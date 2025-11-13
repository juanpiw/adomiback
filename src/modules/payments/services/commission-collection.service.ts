import Stripe from 'stripe';
import DatabaseConnection from '../../../shared/database/connection';
import { Logger } from '../../../shared/utils/logger.util';

const MODULE = 'COMMISSION_COLLECTION_SERVICE';

function getStripe(): Stripe | null {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) return null;
  return new Stripe(key);
}

export interface CollectionResult {
  attempted: number;
  balanceDebits: number;
  cardCharges: number;
  settledAmount: number;
  errors: Array<{ providerId: number; debtId?: number; message: string }>
}

export async function runCommissionCollectionCycle(): Promise<CollectionResult> {
  const pool = DatabaseConnection.getPool();
  const stripe = getStripe();
  if (!stripe) throw new Error('Stripe not configured');
  const result: CollectionResult = { attempted: 0, balanceDebits: 0, cardCharges: 0, settledAmount: 0, errors: [] };

  // Preferido: débito de saldo (si está soportado)
  const prefer = (process.env.CASH_DEBT_PREFERRED_METHOD || '').toLowerCase() || 'balance_debit';
  const useBalanceDebit = prefer === 'balance_debit';

  // Obtener deudas pendientes/atrasadas
  const [debts]: any = await pool.query(
    `SELECT d.id, d.provider_id, d.commission_amount, d.settled_amount, d.currency,
            u.stripe_account_id,
            pbp.stripe_customer_id, pbp.default_payment_method_id
     FROM provider_commission_debts d
     LEFT JOIN users u ON u.id = d.provider_id
     LEFT JOIN provider_billing_profiles pbp ON pbp.provider_id = d.provider_id
     WHERE d.status IN ('pending','overdue')`);

  for (const d of debts as any[]) {
    const debtId = Number(d.id);
    const providerId = Number(d.provider_id);
    const total = Number(d.commission_amount || 0);
    const settled = Number(d.settled_amount || 0);
    const remaining = Math.max(0, total - settled);
    if (remaining <= 0) continue;
    result.attempted += 1;

    // 1) Balance debit
    if (useBalanceDebit && d.stripe_account_id) {
      try {
        // Consultar balance disponible en cuenta conectada
        const bal = await stripe.balance.retrieve({ stripeAccount: String(d.stripe_account_id) as any });
        const avail = Number((bal as any).available?.[0]?.amount || 0);
        if (avail > 0) {
          const chargeAmount = Math.min(avail, remaining);
          // Crear transfer desde la cuenta conectada hacia la plataforma
          const transfer = await stripe.transfers.create({
            amount: chargeAmount,
            currency: (d.currency || 'clp').toLowerCase(),
            destination: undefined
          }, { stripeAccount: String(d.stripe_account_id) as any });

          await pool.execute(
            `INSERT INTO provider_commission_settlements (debt_id, provider_id, settled_amount, method, stripe_transfer_id, transfer_group)
             VALUES (?, ?, ?, 'balance_debit', ?, ?)`,
            [debtId, providerId, chargeAmount, transfer.id, `DEBT-${debtId}-${new Date().toISOString().slice(0,10)}`]
          );
          await pool.execute(
            `UPDATE provider_commission_debts SET settled_amount = LEAST(commission_amount, settled_amount + ?), last_attempt_at = NOW(), attempt_count = attempt_count + 1, stripe_transfer_id = ?
             WHERE id = ?`,
            [chargeAmount, transfer.id, debtId]
          );
          // Cerrar si quedó saldada
          await pool.execute(
            `UPDATE provider_commission_debts SET status = CASE WHEN settled_amount >= commission_amount THEN 'paid' ELSE status END, updated_at = NOW() WHERE id = ?`,
            [debtId]
          );
          result.balanceDebits += 1;
          result.settledAmount += chargeAmount;
          continue;
        }
      } catch (e: any) {
        result.errors.push({ providerId, debtId, message: `balance_debit_error: ${e?.message || 'unknown'}` });
      }
    }

    // 2) Card fallback (si hay PM por defecto)
    if (d.stripe_customer_id && d.default_payment_method_id) {
      try {
        const pi = await stripe.paymentIntents.create({
          amount: remaining,
          currency: (d.currency || 'clp').toLowerCase(),
          customer: d.stripe_customer_id,
          payment_method: d.default_payment_method_id,
          off_session: true,
          confirm: true,
          metadata: {
            type: 'commission_debt',
            debt_id: String(debtId),
            provider_id: String(providerId)
          }
        });
        // El asentamiento se hará en webhook payment_intent.succeeded para asegurar idempotencia
        result.cardCharges += 1;
        continue;
      } catch (e: any) {
        result.errors.push({ providerId, debtId, message: `card_fallback_error: ${e?.message || 'unknown'}` });
      }
    } else {
      result.errors.push({ providerId, debtId, message: 'no_payment_method_for_fallback' });
    }
  }

  return result;
}










