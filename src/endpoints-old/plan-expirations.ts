import { Router } from 'express';
import {
  createPlanExpiration,
  getActiveExpirations,
  getExpiringSoon,
  getExpired,
  markAsExpired,
  markAsDowngraded,
  getUserCurrentPlan,
  extendPlanExpiration,
  getExpirationStats
} from '../queries/plan-expirations';

export function mountPlanExpirations(router: Router) {
  // GET /plan-expirations/user/:userId/current - Obtener plan actual del usuario
  router.get('/plan-expirations/user/:userId/current', async (req, res) => {
    try {
      const userId = parseInt(req.params.userId);
      if (isNaN(userId)) {
        return res.status(400).json({ ok: false, error: 'ID de usuario inválido' });
      }

      const currentPlan = await getUserCurrentPlan(userId);
      if (!currentPlan) {
        return res.status(404).json({ ok: false, error: 'No se pudo obtener el plan del usuario' });
      }

      res.json({ ok: true, currentPlan });
    } catch (error: any) {
      console.error('[PLAN_EXPIRATIONS][GET_CURRENT][ERROR]', error);
      res.status(500).json({ ok: false, error: 'Error al obtener plan actual' });
    }
  });

  // GET /plan-expirations/user/:userId/active - Obtener expiraciones activas del usuario
  router.get('/plan-expirations/user/:userId/active', async (req, res) => {
    try {
      const userId = parseInt(req.params.userId);
      if (isNaN(userId)) {
        return res.status(400).json({ ok: false, error: 'ID de usuario inválido' });
      }

      const expirations = await getActiveExpirations(userId);
      res.json({ ok: true, expirations });
    } catch (error: any) {
      console.error('[PLAN_EXPIRATIONS][GET_ACTIVE][ERROR]', error);
      res.status(500).json({ ok: false, error: 'Error al obtener expiraciones activas' });
    }
  });

  // GET /plan-expirations/expiring-soon - Obtener planes que están por vencer
  router.get('/plan-expirations/expiring-soon', async (req, res) => {
    try {
      const days = parseInt(req.query.days as string) || 7;
      const expirations = await getExpiringSoon(days);
      res.json({ ok: true, expirations });
    } catch (error: any) {
      console.error('[PLAN_EXPIRATIONS][GET_EXPIRING_SOON][ERROR]', error);
      res.status(500).json({ ok: false, error: 'Error al obtener planes por vencer' });
    }
  });

  // GET /plan-expirations/expired - Obtener planes expirados
  router.get('/plan-expirations/expired', async (req, res) => {
    try {
      const expirations = await getExpired();
      res.json({ ok: true, expirations });
    } catch (error: any) {
      console.error('[PLAN_EXPIRATIONS][GET_EXPIRED][ERROR]', error);
      res.status(500).json({ ok: false, error: 'Error al obtener planes expirados' });
    }
  });

  // POST /plan-expirations - Crear nueva expiración
  router.post('/plan-expirations', async (req, res) => {
    try {
      const { user_id, subscription_id, plan_id, expires_at, auto_renew, grace_period_days } = req.body;

      if (!user_id || !plan_id || !expires_at) {
        return res.status(400).json({ 
          ok: false, 
          error: 'Faltan campos requeridos: user_id, plan_id, expires_at' 
        });
      }

      const result = await createPlanExpiration({
        user_id,
        subscription_id,
        plan_id,
        expires_at,
        auto_renew,
        grace_period_days
      });

      if (!result.success) {
        return res.status(500).json({ ok: false, error: result.error });
      }

      res.json({ ok: true, expirationId: result.id });
    } catch (error: any) {
      console.error('[PLAN_EXPIRATIONS][CREATE][ERROR]', error);
      res.status(500).json({ ok: false, error: 'Error al crear expiración' });
    }
  });

  // PUT /plan-expirations/:id/expire - Marcar como expirado
  router.put('/plan-expirations/:id/expire', async (req, res) => {
    try {
      const expirationId = parseInt(req.params.id);
      if (isNaN(expirationId)) {
        return res.status(400).json({ ok: false, error: 'ID de expiración inválido' });
      }

      const result = await markAsExpired(expirationId);
      if (!result.success) {
        return res.status(500).json({ ok: false, error: result.error });
      }

      res.json({ ok: true, message: 'Plan marcado como expirado' });
    } catch (error: any) {
      console.error('[PLAN_EXPIRATIONS][EXPIRE][ERROR]', error);
      res.status(500).json({ ok: false, error: 'Error al marcar como expirado' });
    }
  });

  // PUT /plan-expirations/:id/downgrade - Marcar como degradado
  router.put('/plan-expirations/:id/downgrade', async (req, res) => {
    try {
      const expirationId = parseInt(req.params.id);
      if (isNaN(expirationId)) {
        return res.status(400).json({ ok: false, error: 'ID de expiración inválido' });
      }

      const result = await markAsDowngraded(expirationId);
      if (!result.success) {
        return res.status(500).json({ ok: false, error: result.error });
      }

      res.json({ ok: true, message: 'Plan degradado a básico' });
    } catch (error: any) {
      console.error('[PLAN_EXPIRATIONS][DOWNGRADE][ERROR]', error);
      res.status(500).json({ ok: false, error: 'Error al degradar plan' });
    }
  });

  // PUT /plan-expirations/:id/extend - Extender expiración
  router.put('/plan-expirations/:id/extend', async (req, res) => {
    try {
      const expirationId = parseInt(req.params.id);
      const { expires_at } = req.body;

      if (isNaN(expirationId)) {
        return res.status(400).json({ ok: false, error: 'ID de expiración inválido' });
      }

      if (!expires_at) {
        return res.status(400).json({ ok: false, error: 'Fecha de expiración requerida' });
      }

      const result = await extendPlanExpiration(expirationId, expires_at);
      if (!result.success) {
        return res.status(500).json({ ok: false, error: result.error });
      }

      res.json({ ok: true, message: 'Expiración extendida exitosamente' });
    } catch (error: any) {
      console.error('[PLAN_EXPIRATIONS][EXTEND][ERROR]', error);
      res.status(500).json({ ok: false, error: 'Error al extender expiración' });
    }
  });

  // GET /plan-expirations/stats - Obtener estadísticas
  router.get('/plan-expirations/stats', async (req, res) => {
    try {
      const stats = await getExpirationStats();
      res.json({ ok: true, stats });
    } catch (error: any) {
      console.error('[PLAN_EXPIRATIONS][STATS][ERROR]', error);
      res.status(500).json({ ok: false, error: 'Error al obtener estadísticas' });
    }
  });
}

