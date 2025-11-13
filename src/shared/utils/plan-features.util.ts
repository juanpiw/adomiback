import { Logger } from './logger.util';

export type PlanAnalyticsTier = 'basic' | 'advanced';

export interface PlanFeatureMetadata {
  cashEnabled: boolean;
  quotesEnabled: boolean;
  portfolioLimit: number; // 0 => ilimitado
  promotionsEnabled: boolean;
  promotionsLimit: number; // 0 => ilimitado
  faqEnabled: boolean;
  faqLimit: number; // 0 => ilimitado
  clientRatingVisible: boolean;
  analyticsTier: PlanAnalyticsTier;
  csvExportEnabled: boolean;
  supportLevel: string | null;
  kycSlaHours: number | null;
  searchPriority: string | null;
}

const DEFAULT_FEATURES: PlanFeatureMetadata = {
  cashEnabled: true,
  quotesEnabled: true,
  portfolioLimit: 0,
  promotionsEnabled: true,
  promotionsLimit: 0,
  faqEnabled: true,
  faqLimit: 6,
  clientRatingVisible: true,
  analyticsTier: 'basic',
  csvExportEnabled: false,
  supportLevel: 'standard',
  kycSlaHours: null,
  searchPriority: null
};

function toBool(value: any, fallback: boolean): boolean {
  if (value === undefined || value === null) return fallback;
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value !== 0;
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (!normalized) return fallback;
    return ['1', 'true', 'yes', 'si', 'on', 'enabled'].includes(normalized);
  }
  return fallback;
}

function toNumber(value: any, fallback: number): number {
  if (value === undefined || value === null) return fallback;
  const num = Number(value);
  return Number.isFinite(num) ? num : fallback;
}

function toAnalyticsTier(value: any, fallback: PlanAnalyticsTier): PlanAnalyticsTier {
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (normalized === 'advanced') return 'advanced';
    if (normalized === 'basic') return 'basic';
  }
  return fallback;
}

export function parsePlanMetadata(rawMetadata: any): PlanFeatureMetadata {
  let metadata: Record<string, any> = {};
  if (rawMetadata && typeof rawMetadata === 'object') {
    metadata = rawMetadata;
  } else if (typeof rawMetadata === 'string') {
    try {
      metadata = JSON.parse(rawMetadata);
    } catch (error) {
      Logger.warn('PLAN_FEATURES', 'No se pudo parsear metadata de plan', { error: (error as Error)?.message });
      metadata = {};
    }
  }

  const safeGet = (key: string, fallback: any) => {
    if (metadata.hasOwnProperty(key)) return metadata[key];
    const camelKey = key.replace(/_([a-z])/g, (_, letter: string) => letter.toUpperCase());
    if (metadata.hasOwnProperty(camelKey)) return metadata[camelKey];
    return fallback;
  };

  return {
    cashEnabled: toBool(safeGet('cash_enabled', DEFAULT_FEATURES.cashEnabled), DEFAULT_FEATURES.cashEnabled),
    quotesEnabled: toBool(safeGet('quotes_enabled', DEFAULT_FEATURES.quotesEnabled), DEFAULT_FEATURES.quotesEnabled),
    portfolioLimit: toNumber(safeGet('portfolio_limit', DEFAULT_FEATURES.portfolioLimit), DEFAULT_FEATURES.portfolioLimit),
    promotionsEnabled: toBool(safeGet('promotions_enabled', DEFAULT_FEATURES.promotionsEnabled), DEFAULT_FEATURES.promotionsEnabled),
    promotionsLimit: toNumber(safeGet('promotions_limit', DEFAULT_FEATURES.promotionsLimit), DEFAULT_FEATURES.promotionsLimit),
    faqEnabled: toBool(safeGet('faq_enabled', DEFAULT_FEATURES.faqEnabled), DEFAULT_FEATURES.faqEnabled),
    faqLimit: toNumber(safeGet('faq_limit', DEFAULT_FEATURES.faqLimit), DEFAULT_FEATURES.faqLimit),
    clientRatingVisible: toBool(safeGet('client_rating_visible', DEFAULT_FEATURES.clientRatingVisible), DEFAULT_FEATURES.clientRatingVisible),
    analyticsTier: toAnalyticsTier(safeGet('analytics_tier', DEFAULT_FEATURES.analyticsTier), DEFAULT_FEATURES.analyticsTier),
    csvExportEnabled: toBool(safeGet('csv_export_enabled', DEFAULT_FEATURES.csvExportEnabled), DEFAULT_FEATURES.csvExportEnabled),
    supportLevel: (() => {
      const value = safeGet('support_level', DEFAULT_FEATURES.supportLevel);
      return typeof value === 'string' ? value : DEFAULT_FEATURES.supportLevel;
    })(),
    kycSlaHours: (() => {
      const value = safeGet('kyc_sla_hours', DEFAULT_FEATURES.kycSlaHours);
      const num = Number(value);
      return Number.isFinite(num) ? num : DEFAULT_FEATURES.kycSlaHours;
    })(),
    searchPriority: (() => {
      const value = safeGet('search_priority', DEFAULT_FEATURES.searchPriority);
      return typeof value === 'string' ? value : DEFAULT_FEATURES.searchPriority;
    })()
  };
}

export function getDefaultPlanFeatures(): PlanFeatureMetadata {
  return { ...DEFAULT_FEATURES };
}

