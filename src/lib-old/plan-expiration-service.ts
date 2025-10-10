import { getExpired, markAsDowngraded, getUserCurrentPlan } from '../queries/plan-expirations';
import { updateUser } from '../queries/users';

/**
 * Servicio para gestionar la caducidad automática de planes
 */
export class PlanExpirationService {
  /**
   * Procesar planes expirados y degradar a plan básico
   */
  static async processExpiredPlans(): Promise<{ processed: number; errors: number }> {
    try {
      console.log('[PLAN_EXPIRATION_SERVICE] Procesando planes expirados...');
      
      const expiredPlans = await getExpired();
      let processed = 0;
      let errors = 0;

      for (const expiration of expiredPlans) {
        try {
          // Marcar como degradado
          const downgradeResult = await markAsDowngraded(expiration.id);
          if (!downgradeResult.success) {
            console.error(`[PLAN_EXPIRATION_SERVICE] Error degradando plan ${expiration.id}:`, downgradeResult.error);
            errors++;
            continue;
          }

          // Actualizar usuario a plan básico (plan_id = 1)
          const updateResult = await updateUser(expiration.user_id, {
            active_plan_id: 1
          });

          if (!updateResult.success) {
            console.error(`[PLAN_EXPIRATION_SERVICE] Error actualizando usuario ${expiration.user_id}:`, updateResult.error);
            errors++;
            continue;
          }

          console.log(`[PLAN_EXPIRATION_SERVICE] Usuario ${expiration.user_id} degradado a plan básico`);
          processed++;
        } catch (error) {
          console.error(`[PLAN_EXPIRATION_SERVICE] Error procesando expiración ${expiration.id}:`, error);
          errors++;
        }
      }

      console.log(`[PLAN_EXPIRATION_SERVICE] Procesamiento completado: ${processed} exitosos, ${errors} errores`);
      return { processed, errors };
    } catch (error) {
      console.error('[PLAN_EXPIRATION_SERVICE] Error general:', error);
      return { processed: 0, errors: 1 };
    }
  }

  /**
   * Verificar si un usuario tiene plan expirado
   */
  static async isUserPlanExpired(userId: number): Promise<boolean> {
    try {
      const currentPlan = await getUserCurrentPlan(userId);
      return currentPlan ? currentPlan.is_expired : false;
    } catch (error) {
      console.error('[PLAN_EXPIRATION_SERVICE] Error verificando expiración:', error);
      return false;
    }
  }

  /**
   * Obtener días restantes hasta expiración
   */
  static async getDaysUntilExpiration(userId: number): Promise<number | null> {
    try {
      const currentPlan = await getUserCurrentPlan(userId);
      if (!currentPlan || !currentPlan.expires_at) {
        return null;
      }

      const now = new Date();
      const expirationDate = new Date(currentPlan.expires_at);
      const diffTime = expirationDate.getTime() - now.getTime();
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

      return diffDays > 0 ? diffDays : 0;
    } catch (error) {
      console.error('[PLAN_EXPIRATION_SERVICE] Error calculando días restantes:', error);
      return null;
    }
  }

  /**
   * Iniciar procesamiento automático (ejecutar cada hora)
   */
  static startAutomaticProcessing(): void {
    console.log('[PLAN_EXPIRATION_SERVICE] Iniciando procesamiento automático...');
    
    // Ejecutar inmediatamente
    this.processExpiredPlans();

    // Ejecutar cada hora
    setInterval(() => {
      this.processExpiredPlans();
    }, 60 * 60 * 1000); // 1 hora

    console.log('[PLAN_EXPIRATION_SERVICE] Procesamiento automático iniciado (cada hora)');
  }
}
