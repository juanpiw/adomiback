import { Express, Router, Request, Response } from 'express';
import DatabaseConnection from '../../shared/database/connection';
import { authenticateToken } from '../../shared/middleware/auth.middleware';
import { Logger } from '../../shared/utils/logger.util';

const MODULE = 'PROMOTIONS';
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function buildRouter(): Router {
  const router = Router();

  // Helper: derive status from dates and is_active
  function deriveStatus(row: any): 'active' | 'inactive' | 'expired' {
    const isActive = !!row.is_active;
    const today = new Date();
    const start = new Date(row.start_date);
    const end = row.end_date ? new Date(row.end_date) : null;
    if (end && end < new Date(today.toDateString())) return 'expired';
    return isActive ? 'active' : 'inactive';
  }

  // POST /promo/signup - registro público para prueba gratis
  router.post('/promo/signup', async (req: Request, res: Response) => {
    try {
      const { nombre, correo, profesion, notas } = req.body || {};

      const cleanNombre = typeof nombre === 'string' ? nombre.trim() : '';
      const cleanCorreo = typeof correo === 'string' ? correo.trim().toLowerCase() : '';
      const cleanProfesion = typeof profesion === 'string' ? profesion.trim() : '';
      const cleanNotas = typeof notas === 'string' ? notas.trim() : null;

      if (!cleanNombre || !cleanCorreo || !cleanProfesion) {
        return res.status(400).json({ success: false, error: 'Los campos nombre, correo y profesión son obligatorios.' });
      }

      if (!EMAIL_REGEX.test(cleanCorreo)) {
        return res.status(400).json({ success: false, error: 'El correo electrónico no es válido.' });
      }

      if (cleanNombre.length > 255 || cleanCorreo.length > 255 || cleanProfesion.length > 100) {
        return res.status(400).json({ success: false, error: 'Uno de los campos excede el largo permitido.' });
      }

      const pool = DatabaseConnection.getPool();
      const [result]: any = await pool.execute(
        `INSERT INTO promo_signups (nombre, correo, profesion, notas, status)
         VALUES (?, ?, ?, ?, 'pending')
         ON DUPLICATE KEY UPDATE
           nombre = VALUES(nombre),
           profesion = VALUES(profesion),
           notas = VALUES(notas),
           status = 'pending',
           updated_at = CURRENT_TIMESTAMP`,
        [cleanNombre, cleanCorreo, cleanProfesion, cleanNotas]
      );

      const isNew = result?.insertId && Number(result.insertId) > 0;
      const [[signup]]: any = await pool.query(
        `SELECT id, nombre, correo, profesion, notas, status, created_at, updated_at
           FROM promo_signups
          WHERE correo = ?
          LIMIT 1`,
        [cleanCorreo]
      );

      if (!signup) {
        return res.status(500).json({ success: false, error: 'No se pudo registrar la promoción.' });
      }

      return res.status(isNew ? 201 : 200).json({
        success: true,
        message: isNew ? 'Registro creado correctamente.' : 'Registro actualizado correctamente.',
        data: signup
      });
    } catch (error: any) {
      if (error?.code === 'ER_DUP_ENTRY') {
        Logger.warn(MODULE, '[PROMO_SIGNUP] Conflicto con correo duplicado', error);
        return res.status(409).json({ success: false, error: 'El correo ingresado ya está registrado.' });
      }
      Logger.error(MODULE, '[PROMO_SIGNUP] Error registrando prueba gratis', error);
      return res.status(500).json({ success: false, error: 'No pudimos registrar tu solicitud. Intenta nuevamente.' });
    }
  });

  // GET /provider/promotions
  router.get('/provider/promotions', authenticateToken, async (req: Request, res: Response) => {
    try {
      const user = (req as any).user || {};
      const providerId = Number(user.id);
      if (!providerId) return res.status(401).json({ success: false, error: 'No autorizado' });
      const pool = DatabaseConnection.getPool();
      const [rows] = await pool.query(
        `SELECT id, provider_id, service_id, name, description, discount_type, discount_value,
                start_date, end_date, is_active, max_uses, current_uses, promo_code,
                created_at, updated_at
         FROM promotions
         WHERE provider_id = ?
         ORDER BY is_active DESC, start_date DESC, id DESC`,
        [providerId]
      );
      const promotions = (rows as any[]).map(r => ({
        ...r,
        status: deriveStatus(r)
      }));
      return res.json({ success: true, promotions });
    } catch (err) {
      Logger.error(MODULE, 'Error listing promotions', err as any);
      return res.status(500).json({ success: false, error: 'Error al listar promociones' });
    }
  });

  // POST /provider/promotions
  router.post('/provider/promotions', authenticateToken, async (req: Request, res: Response) => {
    try {
      const user = (req as any).user || {};
      const providerId = Number(user.id);
      if (!providerId) return res.status(401).json({ success: false, error: 'No autorizado' });

      const {
        service_id,
        name,
        description,
        discount_type,
        discount_value,
        start_date,
        end_date,
        is_active = true,
        max_uses = null,
        promo_code = null
      } = req.body || {};

      if (!name || !discount_type || !discount_value || !start_date || !end_date) {
        return res.status(400).json({ success: false, error: 'Campos requeridos faltantes' });
      }
      if (!['percentage', 'fixed'].includes(discount_type)) {
        return res.status(400).json({ success: false, error: 'discount_type inválido' });
      }

      const pool = DatabaseConnection.getPool();
      const [result] = await pool.execute(
        `INSERT INTO promotions (
           provider_id, service_id, name, description, discount_type, discount_value,
           start_date, end_date, is_active, max_uses, current_uses, promo_code
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?)`,
        [providerId, service_id ?? null, name, description ?? null, discount_type, discount_value,
         start_date, end_date, !!is_active, max_uses ?? null, promo_code ?? null]
      );
      const insertedId = (result as any).insertId;
      return res.status(201).json({ success: true, id: insertedId });
    } catch (err) {
      Logger.error(MODULE, 'Error creating promotion', err as any);
      return res.status(500).json({ success: false, error: 'Error al crear promoción' });
    }
  });

  // PUT /provider/promotions/:id
  router.put('/provider/promotions/:id', authenticateToken, async (req: Request, res: Response) => {
    try {
      const user = (req as any).user || {};
      const providerId = Number(user.id);
      if (!providerId) return res.status(401).json({ success: false, error: 'No autorizado' });
      const id = Number(req.params.id);
      if (!id) return res.status(400).json({ success: false, error: 'ID inválido' });

      const allowed = ['service_id','name','description','discount_type','discount_value','start_date','end_date','is_active','max_uses','promo_code'] as const;
      const updates: string[] = [];
      const values: any[] = [];
      for (const key of allowed) {
        if (key in req.body) {
          if (key === 'discount_type' && !['percentage','fixed'].includes(req.body[key])) {
            return res.status(400).json({ success: false, error: 'discount_type inválido' });
          }
          updates.push(`${key} = ?`);
          values.push(req.body[key]);
        }
      }
      if (updates.length === 0) return res.status(400).json({ success: false, error: 'Nada para actualizar' });

      values.push(providerId, id);
      const pool = DatabaseConnection.getPool();
      const [result] = await pool.execute(
        `UPDATE promotions SET ${updates.join(', ')}, updated_at = CURRENT_TIMESTAMP
         WHERE provider_id = ? AND id = ?`,
        values
      );
      if ((result as any).affectedRows === 0) return res.status(404).json({ success: false, error: 'Promoción no encontrada' });
      return res.json({ success: true });
    } catch (err) {
      Logger.error(MODULE, 'Error updating promotion', err as any);
      return res.status(500).json({ success: false, error: 'Error al actualizar promoción' });
    }
  });

  // PATCH /provider/promotions/:id/toggle
  router.patch('/provider/promotions/:id/toggle', authenticateToken, async (req: Request, res: Response) => {
    try {
      const user = (req as any).user || {};
      const providerId = Number(user.id);
      if (!providerId) return res.status(401).json({ success: false, error: 'No autorizado' });
      const id = Number(req.params.id);
      if (!id) return res.status(400).json({ success: false, error: 'ID inválido' });

      const pool = DatabaseConnection.getPool();
      const [rows] = await pool.query(`SELECT is_active FROM promotions WHERE provider_id = ? AND id = ? LIMIT 1`, [providerId, id]);
      const promo = (rows as any[])[0];
      if (!promo) return res.status(404).json({ success: false, error: 'Promoción no encontrada' });
      const next = promo.is_active ? 0 : 1;
      const [result] = await pool.execute(`UPDATE promotions SET is_active = ?, updated_at = CURRENT_TIMESTAMP WHERE provider_id = ? AND id = ?`, [next, providerId, id]);
      if ((result as any).affectedRows === 0) return res.status(404).json({ success: false, error: 'Promoción no encontrada' });
      return res.json({ success: true, is_active: !!next });
    } catch (err) {
      Logger.error(MODULE, 'Error toggling promotion', err as any);
      return res.status(500).json({ success: false, error: 'Error al alternar promoción' });
    }
  });

  // DELETE /provider/promotions/:id
  router.delete('/provider/promotions/:id', authenticateToken, async (req: Request, res: Response) => {
    try {
      const user = (req as any).user || {};
      const providerId = Number(user.id);
      if (!providerId) return res.status(401).json({ success: false, error: 'No autorizado' });
      const id = Number(req.params.id);
      if (!id) return res.status(400).json({ success: false, error: 'ID inválido' });
      const pool = DatabaseConnection.getPool();
      const [result] = await pool.execute(`DELETE FROM promotions WHERE provider_id = ? AND id = ?`, [providerId, id]);
      if ((result as any).affectedRows === 0) return res.status(404).json({ success: false, error: 'Promoción no encontrada' });
      return res.json({ success: true });
    } catch (err) {
      Logger.error(MODULE, 'Error deleting promotion', err as any);
      return res.status(500).json({ success: false, error: 'Error al eliminar promoción' });
    }
  });

  return router;
}

export function setupPromotionsModule(app: Express) {
  console.log('💎'.repeat(20));
  console.log('💎 MÓDULO DE PROMOCIONES INICIANDO 💎');
  console.log('💎'.repeat(20));
  console.log('[PROMOTIONS] 🚀 Inicializando módulo de promociones...');
  console.log('[PROMOTIONS] 📁 Archivo: backend/src/modules/promotions/index.ts');
  console.log('[PROMOTIONS] 🎯 Montando rutas en app...');

  app.use('/', buildRouter());

  console.log('[PROMOTIONS] ✅ Rutas de promociones montadas correctamente');
  console.log('[PROMOTIONS] 🔗 Endpoints disponibles:');
  console.log('[PROMOTIONS]   - POST /promo/signup');
  console.log('[PROMOTIONS]   - GET /provider/promotions');
  console.log('[PROMOTIONS]   - POST /provider/promotions');
  console.log('[PROMOTIONS]   - PUT /provider/promotions/:id');
  console.log('[PROMOTIONS]   - PATCH /provider/promotions/:id/toggle');
  console.log('[PROMOTIONS]   - DELETE /provider/promotions/:id');
  console.log('[PROMOTIONS] 📊 Módulo de promociones completamente inicializado');
  console.log('💎'.repeat(20));
  console.log('💎 MÓDULO DE PROMOCIONES LISTO 💎');
  console.log('💎'.repeat(20));

  Logger.info(MODULE, 'Promotions routes mounted');
}










