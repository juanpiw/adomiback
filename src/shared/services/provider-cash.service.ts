import DatabaseConnection from "../database/connection";
import { Logger } from "../utils/logger.util";

const MODULE = "PROVIDER_CASH_SERVICE";

export async function hasPendingCashDebt(providerId: number): Promise<boolean> {
  if (!providerId || !Number.isFinite(providerId)) {
    return false;
  }

  try {
    const pool = DatabaseConnection.getPool();
    const [[row]]: any = await pool.query(
      `SELECT COUNT(*) AS pending
         FROM provider_commission_debts
        WHERE provider_id = ?
          AND status IN ('pending','overdue','under_review','rejected')
          AND (commission_amount - COALESCE(settled_amount, 0)) > 0`,
      [providerId]
    );

    return Number(row?.pending || 0) > 0;
  } catch (error: any) {
    Logger.error(MODULE, 'Error checking pending cash debt', {
      providerId,
      error: error?.message || error
    });
    return false;
  }
}

export async function resolveCashPaymentEnabled(providerId: number): Promise<boolean> {
  const hasDebt = await hasPendingCashDebt(providerId);
  return !hasDebt;
}
