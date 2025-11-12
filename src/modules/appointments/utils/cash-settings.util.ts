import { Logger } from '../../../shared/utils/logger.util';

export interface CashSettings {
  cashCap: number;
  taxRate: number;
  commissionRate: number;
  dueDays: number;
}

const CLP_FORMATTER = new Intl.NumberFormat('es-CL');

export function formatClp(amount: number): string {
  return CLP_FORMATTER.format(Math.round(amount));
}

export function buildCashCapErrorMessage(cashCap: number): string {
  return `Por el momento no podemos procesar pagos en efectivo de $${formatClp(cashCap)} o más. Por favor, selecciona pago con tarjeta.`;
}

export async function loadCashSettings(pool: any, loggerModule = 'CASH_SETTINGS'): Promise<CashSettings> {
  const settings: CashSettings = {
    cashCap: 150000,
    taxRate: 19,
    commissionRate: 15,
    dueDays: 3
  };

  try {
    const [rows]: any = await pool.query(
      `SELECT setting_key, setting_value FROM platform_settings
       WHERE setting_key IN ('cash_max_amount','default_tax_rate','default_commission_rate','cash_commission_due_days')`
    );
    for (const row of rows as any[]) {
      const key = String(row.setting_key);
      const numericValue = Number(row.setting_value);
      if (!Number.isFinite(numericValue)) continue;
      if (key === 'cash_max_amount') settings.cashCap = numericValue;
      if (key === 'default_tax_rate') settings.taxRate = numericValue;
      if (key === 'default_commission_rate') settings.commissionRate = numericValue;
      if (key === 'cash_commission_due_days') settings.dueDays = numericValue;
    }
  } catch (error) {
    Logger.warn(loggerModule, 'No se pudieron cargar los ajustes de efectivo, se usarán valores por defecto', error as any);
  }

  return settings;
}






