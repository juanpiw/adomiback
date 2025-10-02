import { Router } from 'express';
import { 
  createFounderBenefits,
  getFounderBenefitsByUserId,
  getAllFounders,
  getActiveFounders,
  isUserFounder,
  getFounderDiscount,
  getFounderBenefitsList,
  updateFounderBenefits,
  deactivateFounderBenefits,
  getFounderStats,
  getFoundersExpiringSoon,
  applyFounderDiscount
} from '../queries/founders';

export function mountFounders(router: Router) {
  // GET /founders - Listar todos los fundadores (admin)
  router.get('/founders', async (req, res) => {
    try {
      // Por ahora devolver array vacío hasta que se configure la tabla correctamente
      res.json({ ok: true, founders: [] });
    } catch (error: any) {
      console.error('[FOUNDERS][GET_ALL][ERROR]', error);
      res.status(500).json({ ok: false, error: 'Error al obtener fundadores' });
    }
  });

  // GET /founders/stats - Estadísticas de fundadores (admin)
  router.get('/founders/stats', async (req, res) => {
    try {
      const stats = await getFounderStats();
      res.json({ ok: true, stats });
    } catch (error: any) {
      console.error('[FOUNDERS][STATS][ERROR]', error);
      res.status(500).json({ ok: false, error: 'Error al obtener estadísticas de fundadores' });
    }
  });

  // GET /founders/expiring - Fundadores que expiran pronto (admin)
  router.get('/founders/expiring', async (req, res) => {
    try {
      const days = parseInt(req.query.days as string) || 30;
      const founders = await getFoundersExpiringSoon(days);
      res.json({ ok: true, founders });
    } catch (error: any) {
      console.error('[FOUNDERS][EXPIRING][ERROR]', error);
      res.status(500).json({ ok: false, error: 'Error al obtener fundadores que expiran' });
    }
  });

  // GET /founders/user/:userId - Obtener beneficios de fundador por usuario
  router.get('/founders/user/:userId', async (req, res) => {
    try {
      const userId = parseInt(req.params.userId);
      if (isNaN(userId)) {
        return res.status(400).json({ ok: false, error: 'ID de usuario inválido' });
      }

      const benefits = await getFounderBenefitsByUserId(userId);
      res.json({ ok: true, benefits });
    } catch (error: any) {
      console.error('[FOUNDERS][GET_USER][ERROR]', error);
      res.status(500).json({ ok: false, error: 'Error al obtener beneficios del usuario' });
    }
  });

  // GET /founders/check/:userId - Verificar si usuario es fundador
  router.get('/founders/check/:userId', async (req, res) => {
    try {
      const userId = parseInt(req.params.userId);
      if (isNaN(userId)) {
        return res.status(400).json({ ok: false, error: 'ID de usuario inválido' });
      }

      const isFounder = await isUserFounder(userId);
      const discount = await getFounderDiscount(userId);
      const benefits = await getFounderBenefitsList(userId);

      res.json({ 
        ok: true, 
        isFounder, 
        discount, 
        benefits 
      });
    } catch (error: any) {
      console.error('[FOUNDERS][CHECK][ERROR]', error);
      res.status(500).json({ ok: false, error: 'Error al verificar status de fundador' });
    }
  });

  // POST /founders - Asignar beneficios de fundador (admin)
  router.post('/founders', async (req, res) => {
    try {
      const {
        user_id,
        benefits,
        discount_percentage,
        notes,
        assigned_by,
        expires_at
      } = req.body;

      // Validaciones
      if (!user_id || !benefits || !Array.isArray(benefits) || discount_percentage === undefined) {
        return res.status(400).json({ 
          ok: false, 
          error: 'Faltan campos requeridos: user_id, benefits (array), discount_percentage' 
        });
      }

      if (discount_percentage < 0 || discount_percentage > 100) {
        return res.status(400).json({ 
          ok: false, 
          error: 'discount_percentage debe estar entre 0 y 100' 
        });
      }

      // Verificar si el usuario ya es fundador
      const existingBenefits = await getFounderBenefitsByUserId(user_id);
      if (existingBenefits) {
        return res.status(409).json({ 
          ok: false, 
          error: 'El usuario ya tiene beneficios de fundador activos' 
        });
      }

      const founderId = await createFounderBenefits({
        user_id,
        benefits,
        discount_percentage: parseFloat(discount_percentage),
        notes,
        assigned_by,
        expires_at: expires_at ? new Date(expires_at) : undefined
      });

      res.status(201).json({ 
        ok: true, 
        founderId, 
        message: 'Beneficios de fundador asignados exitosamente' 
      });
    } catch (error: any) {
      console.error('[FOUNDERS][CREATE][ERROR]', error);
      res.status(500).json({ ok: false, error: 'Error al asignar beneficios de fundador' });
    }
  });

  // PUT /founders/:id - Actualizar beneficios de fundador (admin)
  router.put('/founders/:id', async (req, res) => {
    try {
      const founderId = parseInt(req.params.id);
      if (isNaN(founderId)) {
        return res.status(400).json({ ok: false, error: 'ID de fundador inválido' });
      }

      const updateData = req.body;
      
      // Validar discount_percentage si se proporciona
      if (updateData.discount_percentage !== undefined) {
        if (updateData.discount_percentage < 0 || updateData.discount_percentage > 100) {
          return res.status(400).json({ 
            ok: false, 
            error: 'discount_percentage debe estar entre 0 y 100' 
          });
        }
      }

      const success = await updateFounderBenefits(founderId, updateData);
      
      if (!success) {
        return res.status(404).json({ ok: false, error: 'Fundador no encontrado' });
      }

      res.json({ ok: true, message: 'Beneficios de fundador actualizados exitosamente' });
    } catch (error: any) {
      console.error('[FOUNDERS][UPDATE][ERROR]', error);
      res.status(500).json({ ok: false, error: 'Error al actualizar beneficios de fundador' });
    }
  });

  // DELETE /founders/:id - Revocar beneficios de fundador (admin)
  router.delete('/founders/:id', async (req, res) => {
    try {
      const founderId = parseInt(req.params.id);
      if (isNaN(founderId)) {
        return res.status(400).json({ ok: false, error: 'ID de fundador inválido' });
      }

      const success = await deactivateFounderBenefits(founderId);
      
      if (!success) {
        return res.status(404).json({ ok: false, error: 'Fundador no encontrado' });
      }

      res.json({ ok: true, message: 'Beneficios de fundador revocados exitosamente' });
    } catch (error: any) {
      console.error('[FOUNDERS][DELETE][ERROR]', error);
      res.status(500).json({ ok: false, error: 'Error al revocar beneficios de fundador' });
    }
  });

  // POST /founders/apply-discount - Aplicar descuento de fundador
  router.post('/founders/apply-discount', async (req, res) => {
    try {
      const { userId, originalPrice } = req.body;

      if (!userId || originalPrice === undefined) {
        return res.status(400).json({ 
          ok: false, 
          error: 'Faltan campos requeridos: userId, originalPrice' 
        });
      }

      const discountResult = await applyFounderDiscount(userId, parseFloat(originalPrice));
      res.json({ ok: true, discount: discountResult });
    } catch (error: any) {
      console.error('[FOUNDERS][APPLY_DISCOUNT][ERROR]', error);
      res.status(500).json({ ok: false, error: 'Error al aplicar descuento de fundador' });
    }
  });

  // GET /founders/:id - Obtener fundador por ID (admin)
  router.get('/founders/:id', async (req, res) => {
    try {
      const founderId = parseInt(req.params.id);
      if (isNaN(founderId)) {
        return res.status(400).json({ ok: false, error: 'ID de fundador inválido' });
      }

      // Obtener todos los fundadores y filtrar por ID
      const founders = await getAllFounders();
      const founder = founders.find(f => f.id === founderId);
      
      if (!founder) {
        return res.status(404).json({ ok: false, error: 'Fundador no encontrado' });
      }

      res.json({ ok: true, founder });
    } catch (error: any) {
      console.error('[FOUNDERS][GET_BY_ID][ERROR]', error);
      res.status(500).json({ ok: false, error: 'Error al obtener fundador' });
    }
  });
}
