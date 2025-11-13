import { getProviderPlanLimits } from '../../shared/utils/subscription.util';

export async function ensureQuotesFeature(providerId: number): Promise<void> {
  const planLimits = await getProviderPlanLimits(providerId);
  if (planLimits.quotesEnabled) {
    return;
  }

  const err: any = new Error('Tu plan actual no incluye el módulo de cotizaciones. Actualiza tu suscripción para continuar.');
  err.code = 'QUOTES_FEATURE_LOCKED';
  err.statusCode = 403;
  throw err;
}
