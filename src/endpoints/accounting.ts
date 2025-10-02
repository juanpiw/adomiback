import { Router } from 'express';
import { 
  getRevenueSummary, 
  getUserRevenue, 
  getRevenueByPeriod,
  getRevenueByTransactionType,
  getMonthlyRevenueStats,
  getTopUsersByRevenue,
  getProfitabilityMetrics,
  getPlatformSettings,
  updatePlatformSetting
} from '../queries/accounting';

export function mountAccounting(router: Router) {
  // GET /accounting/summary - Resumen de ingresos
  router.get('/accounting/summary', async (req, res) => {
    try {
      const { startDate, endDate } = req.query;
      
      const summary = await getRevenueSummary(
        startDate ? new Date(startDate as string) : undefined,
        endDate ? new Date(endDate as string) : undefined
      );
      
      res.json({ ok: true, summary });
    } catch (error: any) {
      console.error('[ACCOUNTING][SUMMARY][ERROR]', error);
      res.status(500).json({ ok: false, error: 'Error al obtener resumen de ingresos' });
    }
  });

  // GET /accounting/user/:id - Ingresos por usuario
  router.get('/accounting/user/:id', async (req, res) => {
    try {
      const userId = parseInt(req.params.id);
      if (isNaN(userId)) {
        return res.status(400).json({ ok: false, error: 'ID de usuario inválido' });
      }

      const revenue = await getUserRevenue(userId);
      res.json({ ok: true, revenue });
    } catch (error: any) {
      console.error('[ACCOUNTING][USER][ERROR]', error);
      res.status(500).json({ ok: false, error: 'Error al obtener ingresos del usuario' });
    }
  });

  // GET /accounting/period - Ingresos por período
  router.get('/accounting/period', async (req, res) => {
    try {
      const { startDate, endDate } = req.query;
      
      if (!startDate || !endDate) {
        return res.status(400).json({ ok: false, error: 'startDate y endDate son requeridos' });
      }
      
      const revenue = await getRevenueByPeriod(
        new Date(startDate as string),
        new Date(endDate as string)
      );
      
      res.json({ ok: true, revenue });
    } catch (error: any) {
      console.error('[ACCOUNTING][PERIOD][ERROR]', error);
      res.status(500).json({ ok: false, error: 'Error al obtener ingresos del período' });
    }
  });

  // GET /accounting/transaction-type/:type - Ingresos por tipo de transacción
  router.get('/accounting/transaction-type/:type', async (req, res) => {
    try {
      const { type } = req.params;
      const { startDate, endDate } = req.query;
      
      const validTypes = ['subscription', 'one_time', 'refund', 'chargeback'];
      if (!validTypes.includes(type)) {
        return res.status(400).json({ 
          ok: false, 
          error: 'Tipo de transacción inválido. Debe ser: ' + validTypes.join(', ') 
        });
      }
      
      const revenue = await getRevenueByTransactionType(
        type,
        startDate ? new Date(startDate as string) : undefined,
        endDate ? new Date(endDate as string) : undefined
      );
      
      res.json({ ok: true, revenue });
    } catch (error: any) {
      console.error('[ACCOUNTING][TRANSACTION_TYPE][ERROR]', error);
      res.status(500).json({ ok: false, error: 'Error al obtener ingresos por tipo de transacción' });
    }
  });

  // GET /accounting/monthly - Estadísticas mensuales
  router.get('/accounting/monthly', async (req, res) => {
    try {
      const months = parseInt(req.query.months as string) || 12;
      const stats = await getMonthlyRevenueStats(months);
      res.json({ ok: true, stats });
    } catch (error: any) {
      console.error('[ACCOUNTING][MONTHLY][ERROR]', error);
      res.status(500).json({ ok: false, error: 'Error al obtener estadísticas mensuales' });
    }
  });

  // GET /accounting/top-users - Top usuarios por ingresos
  router.get('/accounting/top-users', async (req, res) => {
    try {
      const limit = parseInt(req.query.limit as string) || 10;
      const topUsers = await getTopUsersByRevenue(limit);
      res.json({ ok: true, topUsers });
    } catch (error: any) {
      console.error('[ACCOUNTING][TOP_USERS][ERROR]', error);
      res.status(500).json({ ok: false, error: 'Error al obtener top usuarios' });
    }
  });

  // GET /accounting/profitability - Métricas de rentabilidad
  router.get('/accounting/profitability', async (req, res) => {
    try {
      const metrics = await getProfitabilityMetrics();
      res.json({ ok: true, metrics });
    } catch (error: any) {
      console.error('[ACCOUNTING][PROFITABILITY][ERROR]', error);
      res.status(500).json({ ok: false, error: 'Error al obtener métricas de rentabilidad' });
    }
  });

  // GET /accounting/settings - Configuración de la plataforma
  router.get('/accounting/settings', async (req, res) => {
    try {
      const settings = await getPlatformSettings();
      res.json({ ok: true, settings });
    } catch (error: any) {
      console.error('[ACCOUNTING][SETTINGS][ERROR]', error);
      res.status(500).json({ ok: false, error: 'Error al obtener configuración' });
    }
  });

  // PUT /accounting/settings - Actualizar configuración de la plataforma
  router.put('/accounting/settings', async (req, res) => {
    try {
      const { key, value, description, updatedBy } = req.body;
      
      if (!key || value === undefined) {
        return res.status(400).json({ 
          ok: false, 
          error: 'key y value son requeridos' 
        });
      }

      const success = await updatePlatformSetting(key, value, description, updatedBy);
      
      if (!success) {
        return res.status(500).json({ 
          ok: false, 
          error: 'Error al actualizar configuración' 
        });
      }

      res.json({ ok: true, message: 'Configuración actualizada exitosamente' });
    } catch (error: any) {
      console.error('[ACCOUNTING][UPDATE_SETTINGS][ERROR]', error);
      res.status(500).json({ ok: false, error: 'Error al actualizar configuración' });
    }
  });

  // GET /accounting/dashboard - Dashboard completo de contabilidad
  router.get('/accounting/dashboard', async (req, res) => {
    try {
      const { startDate, endDate } = req.query;
      
      // Obtener todos los datos del dashboard en paralelo
      const [
        summary,
        monthlyStats,
        topUsers,
        profitability,
        settings
      ] = await Promise.all([
        getRevenueSummary(
          startDate ? new Date(startDate as string) : undefined,
          endDate ? new Date(endDate as string) : undefined
        ),
        getMonthlyRevenueStats(12),
        getTopUsersByRevenue(5),
        getProfitabilityMetrics(),
        getPlatformSettings()
      ]);
      
      res.json({ 
        ok: true, 
        dashboard: {
          summary,
          monthlyStats,
          topUsers,
          profitability,
          settings
        }
      });
    } catch (error: any) {
      console.error('[ACCOUNTING][DASHBOARD][ERROR]', error);
      res.status(500).json({ ok: false, error: 'Error al obtener dashboard de contabilidad' });
    }
  });
}

