/**
 * Commission Rates Constants
 * Defines the commission split for the platform
 */

export const COMMISSION_RATES = {
  /**
   * Default commission rate for Adomi platform
   * 15% goes to platform, 85% to provider
   */
  DEFAULT: 15.0,

  /**
   * Provider percentage (85%)
   */
  PROVIDER: 85.0,

  /**
   * Platform percentage (15%)
   */
  PLATFORM: 15.0,

  /**
   * Minimum amount to process (CLP)
   */
  MINIMUM_AMOUNT: 1000,

  /**
   * Maximum amount per transaction (CLP)
   */
  MAXIMUM_AMOUNT: 10000000 // 10 millones
} as const;

/**
 * Commission breakdown interface
 */
export interface CommissionBreakdown {
  totalAmount: number;
  commissionRate: number;
  commissionAmount: number;
  providerAmount: number;
  platformAmount: number;
}

