import { Express, Router, Request, Response } from 'express';
import DatabaseConnection from '../../shared/database/connection';
import { authenticateToken, AuthUser } from '../../shared/middleware/auth.middleware';
import { Logger } from '../../shared/utils/logger.util';

const MODULE = 'WALLET';

type WalletMovementType = 'credit' | 'debit' | 'hold' | 'release';

interface WalletSummaryDto {
  available_balance: number;
  pending_balance: number;
  hold_balance: number;
  total_withdrawn: number;
  credits_earned: number;
  last_updated: string | null;
  next_release_amount: number;
  next_release_date: string | null;
}

interface WalletMovementDto {
  id: number;
  date: string;
  type: WalletMovementType;
  title: string;
  description?: string | null;
  amount: number;
  status: 'completado' | 'pendiente' | 'retenido';
  reference?: string | null;
  relatedAppointmentId?: number | null;
}

const TRANSACTION_TYPE_MAP: Record<string, WalletMovementType> = {
  payment_received: 'credit',
  refund: 'debit',
  withdrawal: 'debit',
  payment_sent: 'debit',
  commission: 'debit'
};

const CREDIT_TYPES = new Set<WalletMovementType>(['credit']);
const DEBIT_TYPES = new Set<WalletMovementType>(['debit']);
const HOLD_TYPES = new Set<WalletMovementType>(['hold', 'release']);

export function setupWalletModule(app: Express) {
  const router = Router();

  router.get('/provider/wallet/summary', authenticateToken, async (req: Request, res: Response) => {
    try {
      const user = (req as any).user as AuthUser;
      if (!user?.id) {
        return res.status(401).json({ success: false, error: 'No autorizado' });
      }
      if (user.role !== 'provider') {
        return res.status(403).json({ success: false, error: 'Solo proveedores pueden consultar la billetera' });
      }

      const providerId = Number(user.id);
      const pool = DatabaseConnection.getPool();

      const [[walletRow]]: any = await pool.query(
        `SELECT balance, pending_balance, total_withdrawn, last_transaction_at
           FROM wallet_balance
          WHERE user_id = ?
          LIMIT 1`,
        [providerId]
      );

      const [holdRows]: any = await pool.query(
        `SELECT p.id,
                p.provider_amount,
                p.release_status,
                p.paid_at
           FROM payments p
          WHERE p.provider_id = ?
            AND p.status = 'completed'
            AND p.payment_method <> 'cash'
            AND (p.release_status IS NULL OR p.release_status IN ('pending','eligible'))`,
        [providerId]
      );

      const [[creditAggregate]]: any = await pool.query(
        `SELECT COUNT(*) AS credit_count
           FROM transactions
          WHERE user_id = ?
            AND type = 'payment_received'`,
        [providerId]
      );

      const holdBalance = Array.isArray(holdRows)
        ? holdRows.reduce((sum: number, row: any) => sum + Number(row?.provider_amount || 0), 0)
        : 0;

      const eligibleReleases = Array.isArray(holdRows)
        ? holdRows.filter((row: any) => String(row?.release_status || 'pending') === 'eligible')
        : [];

      const nextReleaseAmount = eligibleReleases.reduce(
        (sum: number, row: any) => sum + Number(row?.provider_amount || 0),
        0
      );

      const nextReleaseDate = eligibleReleases.length
        ? eligibleReleases
            .map((row: any) => (row?.paid_at ? new Date(row.paid_at) : null))
            .filter((d: Date | null) => d && !Number.isNaN(d.getTime()))
            .sort((a: Date, b: Date) => a.getTime() - b.getTime())[0]
        : null;

      const summary: WalletSummaryDto = {
        available_balance: Number(walletRow?.balance || 0),
        pending_balance: Number(walletRow?.pending_balance || 0),
        hold_balance: holdBalance,
        total_withdrawn: Number(walletRow?.total_withdrawn || 0),
        credits_earned: Number(creditAggregate?.credit_count || 0),
        last_updated: walletRow?.last_transaction_at ? new Date(walletRow.last_transaction_at).toISOString() : null,
        next_release_amount: nextReleaseAmount,
        next_release_date: nextReleaseDate ? nextReleaseDate.toISOString() : null
      };

      return res.json({ success: true, summary });
    } catch (error) {
      Logger.error(MODULE, '[SUMMARY] Error obteniendo resumen de billetera', error);
      return res.status(500).json({ success: false, error: 'Error al obtener el resumen de la billetera' });
    }
  });

  router.get('/provider/wallet/movements', authenticateToken, async (req: Request, res: Response) => {
    try {
      const user = (req as any).user as AuthUser;
      if (!user?.id) {
        return res.status(401).json({ success: false, error: 'No autorizado' });
      }
      if (user.role !== 'provider') {
        return res.status(403).json({ success: false, error: 'Solo proveedores pueden consultar esta información' });
      }

      const providerId = Number(user.id);
      const typeFilter = String(req.query.type || 'all').toLowerCase() as 'all' | 'credits' | 'debits' | 'holds';
      const limit = Math.min(100, Math.max(1, Number(req.query.limit || 50)));
      const offset = Math.max(0, Number(req.query.offset || 0));

      const fetchLimit = Math.min(500, limit + offset);
      const pool = DatabaseConnection.getPool();

      const [transactionRows]: any = await pool.query(
        `SELECT t.id,
                t.type,
                t.amount,
                t.currency,
                t.description,
                t.payment_id,
                t.appointment_id,
                t.created_at,
                a.date AS appointment_date,
                a.start_time AS appointment_start_time,
                ps.name AS service_name,
                u.name AS client_name
           FROM transactions t
           LEFT JOIN appointments a ON a.id = t.appointment_id
           LEFT JOIN provider_services ps ON ps.id = a.service_id
           LEFT JOIN users u ON u.id = a.client_id
          WHERE t.user_id = ?
          ORDER BY t.created_at DESC
          LIMIT ?`,
        [providerId, fetchLimit]
      );

      const [holdsRows]: any = await pool.query(
        `SELECT p.id,
                p.provider_amount,
                p.release_status,
                p.paid_at,
                a.id AS appointment_id,
                a.date AS appointment_date,
                a.start_time AS appointment_start_time,
                ps.name AS service_name,
                u.name AS client_name
           FROM payments p
           LEFT JOIN appointments a ON a.id = p.appointment_id
           LEFT JOIN provider_services ps ON ps.id = a.service_id
           LEFT JOIN users u ON u.id = a.client_id
          WHERE p.provider_id = ?
            AND p.status = 'completed'
            AND p.payment_method <> 'cash'
            AND (p.release_status IS NULL OR p.release_status IN ('pending','eligible'))`,
        [providerId]
      );

      const allMovements: WalletMovementDto[] = [];

      for (const row of (transactionRows as any[]) || []) {
        const mappedType = TRANSACTION_TYPE_MAP[String(row?.type || '').toLowerCase()] || 'credit';
        const status: 'completado' | 'pendiente' | 'retenido' =
          mappedType === 'credit' ? 'completado' : 'completado';

        allMovements.push({
          id: Number(row.id),
          date: toISODate(row.created_at),
          type: mappedType,
          title: buildTransactionTitle(row, mappedType),
          description: buildTransactionDescription(row),
          amount: Math.abs(Number(row.amount || 0)),
          status,
          reference: buildReference('TX', row.id),
          relatedAppointmentId: row.appointment_id ? Number(row.appointment_id) : null
        });
      }

      for (const row of (holdsRows as any[]) || []) {
        const releaseStatus = String(row?.release_status || 'pending');
        const isEligible = releaseStatus === 'eligible';
        allMovements.push({
          id: Number(1_000_000 + (row.id || 0)),
          date: toISODate(row.paid_at),
          type: 'hold',
          title: isEligible ? 'Liberación programada' : 'En retención por verificación',
          description: buildHoldDescription(row),
          amount: Math.abs(Number(row.provider_amount || 0)),
          status: isEligible ? 'pendiente' : 'retenido',
          reference: buildReference('HOLD', row.id),
          relatedAppointmentId: row.appointment_id ? Number(row.appointment_id) : null
        });
      }

      let filteredMovements = allMovements;
      if (typeFilter === 'credits') {
        filteredMovements = allMovements.filter((m) => CREDIT_TYPES.has(m.type));
      } else if (typeFilter === 'debits') {
        filteredMovements = allMovements.filter((m) => DEBIT_TYPES.has(m.type));
      } else if (typeFilter === 'holds') {
        filteredMovements = allMovements.filter((m) => HOLD_TYPES.has(m.type));
      }

      filteredMovements.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

      const total = filteredMovements.length;
      const paginated = filteredMovements.slice(offset, offset + limit);

      return res.json({
        success: true,
        movements: paginated,
        pagination: {
          total,
          limit,
          offset
        }
      });
    } catch (error) {
      Logger.error(MODULE, '[MOVEMENTS] Error obteniendo movimientos de billetera', error);
      return res.status(500).json({ success: false, error: 'Error al obtener los movimientos de la billetera' });
    }
  });

  app.use('/', router);
  Logger.info(MODULE, 'Wallet routes mounted');
}

function toISODate(input: any): string {
  if (!input) {
    return new Date().toISOString();
  }
  const date = new Date(input);
  if (Number.isNaN(date.getTime())) {
    return new Date().toISOString();
  }
  return date.toISOString();
}

function buildReference(prefix: string, id: any): string {
  const safeId = id ? String(id).padStart(2, '0') : '00';
  return `${prefix}-${safeId}`;
}

function buildTransactionTitle(row: any, mappedType: WalletMovementType): string {
  if (row?.description) {
    return String(row.description);
  }
  if (mappedType === 'credit') {
    return 'Ingreso a tu billetera';
  }
  return 'Movimiento de salida';
}

function buildTransactionDescription(row: any): string | undefined {
  const service = row?.service_name ? String(row.service_name) : null;
  const client = row?.client_name ? String(row.client_name) : null;

  if (service && client) {
    return `${service} – ${client}`;
  }
  if (service) {
    return service;
  }
  return undefined;
}

function buildHoldDescription(row: any): string | undefined {
  const service = row?.service_name ? String(row.service_name) : null;
  const client = row?.client_name ? String(row.client_name) : null;
  if (service && client) {
    return `${service} – ${client}`;
  }
  if (service) {
    return service;
  }
  return undefined;
}