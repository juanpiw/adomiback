/**
 * Appointments Module
 * Handles booking system and appointments management
 */

import { Express, Router, Request, Response } from 'express';
import DatabaseConnection from '../../shared/database/connection';
import { authenticateToken } from '../../shared/middleware/auth.middleware';
import { Logger } from '../../shared/utils/logger.util';
import { emitToUser } from '../../shared/realtime/socket';
import { PushService } from '../notifications/services/push.service';

const MODULE = 'APPOINTMENTS';

function buildRouter(): Router {
  const router = Router();

  // POST /appointments - crear cita
  router.post('/appointments', authenticateToken, async (req: Request, res: Response) => {
    try {
      const user = (req as any).user || {};
      const { provider_id, client_id, service_id, date, start_time, end_time, notes } = req.body || {};
      if (!provider_id || !client_id || !service_id || !date || !start_time || !end_time) {
        return res.status(400).json({ success: false, error: 'provider_id, client_id, service_id, date, start_time, end_time son requeridos' });
      }
      const pool = DatabaseConnection.getPool();
      // Validar service -> provider y obtener precio/duración
      const [sv] = await pool.query('SELECT id, provider_id, duration_minutes, price FROM provider_services WHERE id = ? LIMIT 1', [service_id]);
      if ((sv as any[]).length === 0 || (sv as any[])[0].provider_id !== Number(provider_id)) {
        return res.status(400).json({ success: false, error: 'Servicio inválido para el proveedor' });
      }
      const service = (sv as any[])[0];
      // Validar solape simple (misma fecha)
      const [over] = await pool.query(
        `SELECT id FROM appointments
         WHERE provider_id = ? AND \`date\` = ?
           AND NOT (\`end_time\` <= ? OR \`start_time\` >= ?)
         LIMIT 1`,
        [provider_id, date, start_time, end_time]
      );
      if ((over as any[]).length > 0) {
        return res.status(409).json({ success: false, error: 'Horario no disponible (solape)' });
      }
      // Insertar cita
      const [ins] = await pool.execute(
        `INSERT INTO appointments (provider_id, client_id, service_id, \`date\`, \`start_time\`, \`end_time\`, price, status, notes)
         VALUES (?, ?, ?, ?, ?, ?, ?, 'scheduled', ?)`,
        [provider_id, client_id, service_id, date, start_time, end_time, service.price ?? 0, notes || null]
      );
      const id = (ins as any).insertId;
      const [row] = await pool.query(
        `SELECT a.*, 
                (SELECT name FROM users WHERE id = a.client_id) AS client_name,
                (SELECT name FROM users WHERE id = a.provider_id) AS provider_name
         FROM appointments a WHERE a.id = ?`,
        [id]
      );
      const appointment = (row as any[])[0];
      Logger.info(MODULE, 'Appointment created', { id, provider_id, client_id });
      // Emitir en tiempo real a provider y client
      try { emitToUser(provider_id, 'appointment:created', appointment); } catch {}
      try { emitToUser(client_id, 'appointment:created', appointment); } catch {}
      // Push al proveedor
      try { await PushService.notifyUser(Number(provider_id), 'Nueva cita por confirmar', `Cliente: ${(appointment as any).client_name || ''} • ${String(start_time).slice(0,5)}`, { type: 'appointment', appointment_id: String(id) }); } catch {}
      return res.status(201).json({ success: true, appointment });
    } catch (err) {
      Logger.error(MODULE, 'Error creating appointment', err as any);
      return res.status(500).json({ success: false, error: 'Error al crear cita' });
    }
  });

  // GET /appointments?month=YYYY-MM - listar por mes (proveedor actual)
  router.get('/appointments', authenticateToken, async (req: Request, res: Response) => {
    try {
      const user = (req as any).user || {};
      const month = String(req.query.month || '').trim();
      if (!month) return res.status(400).json({ success: false, error: 'month requerido (YYYY-MM)' });
      const pool = DatabaseConnection.getPool();
      const [rows] = await pool.query(
        `SELECT a.*, 
                (SELECT name FROM users WHERE id = a.client_id) AS client_name,
                (SELECT name FROM provider_services WHERE id = a.service_id) AS service_name,
                (SELECT p.status FROM payments p WHERE p.appointment_id = a.id ORDER BY p.id DESC LIMIT 1) AS payment_status
         FROM appointments a
         WHERE a.provider_id = ? AND DATE_FORMAT(a.\`date\`, '%Y-%m') = ?
         ORDER BY a.\`date\` ASC, a.\`start_time\` ASC`,
        [user.id, month]
      );
      return res.json({ success: true, appointments: rows });
    } catch (err) {
      Logger.error(MODULE, 'Error listing appointments by month', err as any);
      return res.status(500).json({ success: false, error: 'Error al listar citas' });
    }
  });

  // GET /appointments/by-day?date=YYYY-MM-DD - listar por día (proveedor actual)
  router.get('/appointments/by-day', authenticateToken, async (req: Request, res: Response) => {
    try {
      const user = (req as any).user || {};
      const date = String(req.query.date || '').trim();
      if (!date) return res.status(400).json({ success: false, error: 'date requerido (YYYY-MM-DD)' });
      const pool = DatabaseConnection.getPool();
      const [rows] = await pool.query(
        `SELECT a.*, 
                (SELECT name FROM users WHERE id = a.client_id) AS client_name,
                (SELECT name FROM provider_services WHERE id = a.service_id) AS service_name,
                (SELECT p.status FROM payments p WHERE p.appointment_id = a.id ORDER BY p.id DESC LIMIT 1) AS payment_status
         FROM appointments a
         WHERE a.provider_id = ? AND a.\`date\` = ?
         ORDER BY a.\`start_time\` ASC`,
        [user.id, date]
      );
      return res.json({ success: true, appointments: rows });
    } catch (err) {
      Logger.error(MODULE, 'Error listing appointments by day', err as any);
      return res.status(500).json({ success: false, error: 'Error al listar citas del día' });
    }
  });

  // PUT /appointments/:id - actualizar cita
  router.put('/appointments/:id', authenticateToken, async (req: Request, res: Response) => {
    try {
      const user = (req as any).user || {};
      const id = Number(req.params.id);
      const { status, date, start_time, end_time, notes } = req.body || {};
      if (!Number.isFinite(id)) return res.status(400).json({ success: false, error: 'id inválido' });
      const pool = DatabaseConnection.getPool();
      // Verificar pertenencia
      const [own] = await pool.query('SELECT * FROM appointments WHERE id = ? AND provider_id = ? LIMIT 1', [id, user.id]);
      if ((own as any[]).length === 0) return res.status(404).json({ success: false, error: 'Cita no encontrada' });
      // Validar solape si cambian tiempos
      if (date && start_time && end_time) {
        const [over] = await pool.query(
          `SELECT id FROM appointments
           WHERE provider_id = ? AND \`date\` = ? AND id <> ?
             AND NOT (\`end_time\` <= ? OR \`start_time\` >= ?)
           LIMIT 1`,
          [user.id, date, id, start_time, end_time]
        );
        if ((over as any[]).length > 0) {
          return res.status(409).json({ success: false, error: 'Horario no disponible (solape)' });
        }
      }
      await pool.execute(
        `UPDATE appointments
         SET status = COALESCE(?, status),
             \`date\` = COALESCE(?, \`date\`),
             \`start_time\` = COALESCE(?, \`start_time\`),
             \`end_time\` = COALESCE(?, \`end_time\`),
             notes = COALESCE(?, notes),
             updated_at = CURRENT_TIMESTAMP
         WHERE id = ? AND provider_id = ?`,
        [status, date, start_time, end_time, notes, id, user.id]
      );
      const [row] = await pool.query('SELECT * FROM appointments WHERE id = ?', [id]);
      const appointment = (row as any[])[0];
      // Emitir actualización
      try { emitToUser(appointment.provider_id, 'appointment:updated', appointment); } catch {}
      try { emitToUser(appointment.client_id, 'appointment:updated', appointment); } catch {}
      return res.json({ success: true, appointment });
    } catch (err) {
      Logger.error(MODULE, 'Error updating appointment', err as any);
      return res.status(500).json({ success: false, error: 'Error al actualizar cita' });
    }
  });

  // DELETE /appointments/:id - eliminar cita
  router.delete('/appointments/:id', authenticateToken, async (req: Request, res: Response) => {
    try {
      const user = (req as any).user || {};
      const id = Number(req.params.id);
      if (!Number.isFinite(id)) return res.status(400).json({ success: false, error: 'id inválido' });
      const pool = DatabaseConnection.getPool();
      const [own] = await pool.query('SELECT id, provider_id, client_id FROM appointments WHERE id = ? AND provider_id = ? LIMIT 1', [id, user.id]);
      if ((own as any[]).length === 0) return res.status(404).json({ success: false, error: 'Cita no encontrada' });
      const appt = (own as any[])[0];
      await pool.execute('DELETE FROM appointments WHERE id = ? AND provider_id = ?', [id, user.id]);
      // Emitir eliminación
      try { emitToUser(appt.provider_id, 'appointment:deleted', { id }); } catch {}
      try { emitToUser(appt.client_id, 'appointment:deleted', { id }); } catch {}
      return res.json({ success: true });
    } catch (err) {
      Logger.error(MODULE, 'Error deleting appointment', err as any);
      return res.status(500).json({ success: false, error: 'Error al eliminar cita' });
    }
  });

  // GET /availability/time-slots?provider_id&date&service_id - obtener franjas
  router.get('/availability/time-slots', authenticateToken, async (req: Request, res: Response) => {
    try {
      const provider_id = Number(req.query.provider_id);
      const date = String(req.query.date || '').trim();
      const service_id = Number(req.query.service_id);
      if (!provider_id || !date || !service_id) return res.status(400).json({ success: false, error: 'provider_id, date y service_id son requeridos' });
      const pool = DatabaseConnection.getPool();
      // Duración del servicio
      const [sv] = await pool.query('SELECT duration_minutes FROM provider_services WHERE id = ? AND provider_id = ? LIMIT 1', [service_id, provider_id]);
      if ((sv as any[]).length === 0) return res.status(404).json({ success: false, error: 'Servicio no encontrado' });
      const duration = Number((sv as any[])[0].duration_minutes || 30);
      // Citas existentes del día
      const [apps] = await pool.query('SELECT \`start_time\`, \`end_time\` FROM appointments WHERE provider_id = ? AND \`date\` = ?', [provider_id, date]);
      // TODO: obtener bloques de disponibilidad semanal (por ahora 09:00-18:00)
      const blocks = [{ start: '09:00', end: '18:00' }];
      // Generar slots
      const slots: Array<{ time: string; is_available: boolean }> = [];
      for (const b of blocks) {
        let cursor = b.start;
        while (addMinutes(cursor, duration) <= b.end) {
          const next = addMinutes(cursor, duration);
          const overlaps = (apps as any[]).some((a) => !(a.end_time <= cursor || a.start_time >= next));
          slots.push({ time: cursor, is_available: !overlaps });
          cursor = next;
        }
      }
      return res.json({ success: true, time_slots: slots });
    } catch (err) {
      Logger.error(MODULE, 'Error getting time-slots', err as any);
      return res.status(500).json({ success: false, error: 'Error al obtener time-slots' });
    }
  });

  // GET /client/appointments - listar citas del cliente autenticado (próximas/pasadas/canceladas)
  router.get('/client/appointments', authenticateToken, async (req: Request, res: Response) => {
    try {
      const user = (req as any).user || {};
      const clientId = Number(user.id);
      if (!clientId) return res.status(401).json({ success: false, error: 'No autorizado' });
      const pool = DatabaseConnection.getPool();
      const [rows] = await pool.query(
        `SELECT a.*, 
                (SELECT name FROM users WHERE id = a.provider_id) AS provider_name,
                (SELECT name FROM provider_services WHERE id = a.service_id) AS service_name,
                (SELECT p.status FROM payments p WHERE p.appointment_id = a.id ORDER BY p.id DESC LIMIT 1) AS payment_status
         FROM appointments a
         WHERE a.client_id = ?
         ORDER BY a.\`date\` ASC, a.\`start_time\` ASC`,
        [clientId]
      );
      return res.json({ success: true, appointments: rows });
    } catch (err) {
      Logger.error(MODULE, 'Error listing client appointments', err as any);
      return res.status(500).json({ success: false, error: 'Error al listar citas del cliente' });
    }
  });

  // PATCH /appointments/:id/status - actualizar sólo el estado
  router.patch('/appointments/:id/status', authenticateToken, async (req: Request, res: Response) => {
    try {
      const user = (req as any).user || {};
      const id = Number(req.params.id);
      const { status } = req.body || {};
      if (!id || !status) return res.status(400).json({ success: false, error: 'id y status son requeridos' });
      if (!['scheduled','confirmed','completed','cancelled'].includes(status)) {
        return res.status(400).json({ success: false, error: 'status inválido' });
      }
      const pool = DatabaseConnection.getPool();
      // Asegurar autorización: proveedor dueño o cliente dueño puede cambiar a cancelada; confirmado/completed solo provider
      const [rows] = await pool.query('SELECT * FROM appointments WHERE id = ? LIMIT 1', [id]);
      if ((rows as any[]).length === 0) return res.status(404).json({ success: false, error: 'Cita no encontrada' });
      const appt = (rows as any[])[0];
      const isProvider = Number(appt.provider_id) === Number(user.id);
      const isClient = Number(appt.client_id) === Number(user.id);
      if (['confirmed','completed'].includes(status) && !isProvider) {
        return res.status(403).json({ success: false, error: 'No autorizado para cambiar a ese estado' });
      }
      if (status === 'cancelled' && !(isProvider || isClient)) {
        return res.status(403).json({ success: false, error: 'No autorizado' });
      }
      // Determine who cancels (not persisted unless column exists)
      const cancelledBy = status === 'cancelled' ? (user.role === 'provider' ? 'provider' : (user.role === 'client' ? 'client' : 'system')) : null;
      await pool.execute('UPDATE appointments SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?', [status, id]);
      const [after] = await pool.query(
        `SELECT a.*, 
                (SELECT name FROM users WHERE id = a.provider_id) AS provider_name,
                (SELECT name FROM users WHERE id = a.client_id) AS client_name
         FROM appointments a WHERE a.id = ? LIMIT 1`,
        [id]
      );
      const updated = (after as any[])[0];
      if (cancelledBy) (updated as any).cancelled_by = cancelledBy;
      try { emitToUser(updated.provider_id, 'appointment:updated', updated); } catch {}
      try { emitToUser(updated.client_id, 'appointment:updated', updated); } catch {}
      return res.json({ success: true, appointment: updated });
    } catch (err) {
      Logger.error(MODULE, 'Error updating appointment status', err as any);
      return res.status(500).json({ success: false, error: 'Error al actualizar estado' });
    }
  });

  function addMinutes(hhmm: string, minutes: number): string {
    const [hh, mm] = hhmm.split(':').map(Number);
    const d = new Date(1970, 0, 1, hh, mm);
    d.setMinutes(d.getMinutes() + minutes);
    const H = String(d.getHours()).padStart(2, '0');
    const M = String(d.getMinutes()).padStart(2, '0');
    return `${H}:${M}`;
  }

  return router;
}

/**
 * Setup function to mount appointments routes
 */
export function setupAppointmentsModule(app: Express) {
  app.use('/', buildRouter());
  Logger.info(MODULE, 'Appointments routes mounted');
}

