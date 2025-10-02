import { Router } from 'express';
import { 
  getActivePlans, 
  getPlanById, 
  getPlanByStripePriceId,
  getPlansWithSubscriptionCount,
  createPlan,
  updatePlan,
  deactivatePlan
} from '../queries/plans';

export function mountPlans(router: Router) {
  // GET /plans - Obtener todos los planes activos
  router.get('/plans', async (req, res) => {
    try {
      const plans = await getActivePlans();
      res.json({ ok: true, plans });
    } catch (error: any) {
      console.error('[PLANS][GET][ERROR]', error);
      res.status(500).json({ ok: false, error: 'Error al obtener planes' });
    }
  });

  // GET /plans/stats - Obtener planes con estadísticas
  router.get('/plans/stats', async (req, res) => {
    try {
      const plans = await getPlansWithSubscriptionCount();
      res.json({ ok: true, plans });
    } catch (error: any) {
      console.error('[PLANS][STATS][ERROR]', error);
      res.status(500).json({ ok: false, error: 'Error al obtener estadísticas de planes' });
    }
  });

  // GET /plans/:id - Obtener plan por ID
  router.get('/plans/:id', async (req, res) => {
    try {
      const planId = parseInt(req.params.id);
      if (isNaN(planId)) {
        return res.status(400).json({ ok: false, error: 'ID de plan inválido' });
      }

      const plan = await getPlanById(planId);
      if (!plan) {
        return res.status(404).json({ ok: false, error: 'Plan no encontrado' });
      }

      res.json({ ok: true, plan });
    } catch (error: any) {
      console.error('[PLANS][GET_BY_ID][ERROR]', error);
      res.status(500).json({ ok: false, error: 'Error al obtener plan' });
    }
  });

  // GET /plans/stripe/:priceId - Obtener plan por Stripe Price ID
  router.get('/plans/stripe/:priceId', async (req, res) => {
    try {
      const { priceId } = req.params;
      const plan = await getPlanByStripePriceId(priceId);
      
      if (!plan) {
        return res.status(404).json({ ok: false, error: 'Plan no encontrado' });
      }

      res.json({ ok: true, plan });
    } catch (error: any) {
      console.error('[PLANS][GET_BY_STRIPE_ID][ERROR]', error);
      res.status(500).json({ ok: false, error: 'Error al obtener plan' });
    }
  });

  // POST /plans - Crear nuevo plan (admin)
  router.post('/plans', async (req, res) => {
    try {
      const {
        name,
        stripe_price_id,
        price,
        currency,
        interval,
        description,
        features,
        max_services,
        max_bookings
      } = req.body;

      // Validaciones
      if (!name || !stripe_price_id || price === undefined || !currency || !interval) {
        return res.status(400).json({ 
          ok: false, 
          error: 'Faltan campos requeridos: name, stripe_price_id, price, currency, interval' 
        });
      }

      if (!['month', 'year'].includes(interval)) {
        return res.status(400).json({ 
          ok: false, 
          error: 'Interval debe ser "month" o "year"' 
        });
      }

      const planId = await createPlan({
        name,
        stripe_price_id,
        price: parseFloat(price),
        currency,
        interval,
        description: description || '',
        features: features || '[]',
        max_services: parseInt(max_services) || 0,
        max_bookings: parseInt(max_bookings) || 0
      });

      res.status(201).json({ ok: true, planId, message: 'Plan creado exitosamente' });
    } catch (error: any) {
      console.error('[PLANS][CREATE][ERROR]', error);
      res.status(500).json({ ok: false, error: 'Error al crear plan' });
    }
  });

  // PUT /plans/:id - Actualizar plan (admin)
  router.put('/plans/:id', async (req, res) => {
    try {
      const planId = parseInt(req.params.id);
      if (isNaN(planId)) {
        return res.status(400).json({ ok: false, error: 'ID de plan inválido' });
      }

      const updateData = req.body;
      
      // Validar interval si se proporciona
      if (updateData.interval && !['month', 'year'].includes(updateData.interval)) {
        return res.status(400).json({ 
          ok: false, 
          error: 'Interval debe ser "month" o "year"' 
        });
      }

      const success = await updatePlan(planId, updateData);
      
      if (!success) {
        return res.status(404).json({ ok: false, error: 'Plan no encontrado o sin cambios' });
      }

      res.json({ ok: true, message: 'Plan actualizado exitosamente' });
    } catch (error: any) {
      console.error('[PLANS][UPDATE][ERROR]', error);
      res.status(500).json({ ok: false, error: 'Error al actualizar plan' });
    }
  });

  // DELETE /plans/:id - Desactivar plan (admin)
  router.delete('/plans/:id', async (req, res) => {
    try {
      const planId = parseInt(req.params.id);
      if (isNaN(planId)) {
        return res.status(400).json({ ok: false, error: 'ID de plan inválido' });
      }

      const success = await deactivatePlan(planId);
      
      if (!success) {
        return res.status(404).json({ ok: false, error: 'Plan no encontrado' });
      }

      res.json({ ok: true, message: 'Plan desactivado exitosamente' });
    } catch (error: any) {
      console.error('[PLANS][DELETE][ERROR]', error);
      res.status(500).json({ ok: false, error: 'Error al desactivar plan' });
    }
  });
}

