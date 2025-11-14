import DatabaseConnection from '../database/connection';
import { Logger } from './logger.util';
import { getProviderPlanLimits } from './subscription.util';

let cachedDefaultCommissionRate: { value: number; fetchedAt: number } | null = null;
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutos

async function fetchDefaultCommissionRate(): Promise<number> {
  try {
    const pool = DatabaseConnection.getPool();
    const [[row]]: any = await pool.query(
      `SELECT setting_value FROM platform_settings WHERE setting_key = 'default_commission_rate' LIMIT 1`
    );
    const rate = row ? Number(row.setting_value) || 15.0 : 15.0;
    cachedDefaultCommissionRate = { value: rate, fetchedAt: Date.now() };
    return rate;
  } catch (error) {
    Logger.warn('COMMISSION', 'No se pudo obtener default_commission_rate. Usando 15%', error as any);
    cachedDefaultCommissionRate = { value: 15.0, fetchedAt: Date.now() };
    return 15.0;
  }
}

export async function getDefaultCommissionRate(): Promise<number> {
  if (cachedDefaultCommissionRate) {
    const isFresh = Date.now() - cachedDefaultCommissionRate.fetchedAt < CACHE_TTL_MS;
    if (isFresh) return cachedDefaultCommissionRate.value;
  }
  return fetchDefaultCommissionRate();
}

export async function resolveCommissionRate(providerId: number | null | undefined): Promise<number> {
  if (providerId) {
    try {
      const limits = await getProviderPlanLimits(providerId);
      if (limits.commissionRate && limits.commissionRate > 0) {
        return limits.commissionRate;
      }
    } catch (error) {
      Logger.warn('COMMISSION', 'No se pudo resolver commissionRate por plan, usando default', { error: (error as Error)?.message });
    }
  }
  return getDefaultCommissionRate();
}


