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
import { validateCodeFormat, compareVerificationCodes, sanitizeCode, generateVerificationCode } from '../../shared/utils/verification-code.util';
import { cashClosureGate } from '../../shared/middleware/cash-closure-gate';
import { buildCashCapErrorMessage, loadCashSettings } from './utils/cash-settings.util';

const MODULE = 'APPOINTMENTS';

let ensureCashSchemaPromise: Promise<void> | null = null;

async function ensureCashSchema(): Promise<void> {
  if (ensureCashSchemaPromise) {
    return ensureCashSchemaPromise;
  }

  ensureCashSchemaPromise = (async () => {
    try {
      const pool = DatabaseConnection.getPool();
      const statements: string[] = [
        "ALTER TABLE appointments ADD COLUMN IF NOT EXISTS closure_state ENUM('none','pending_close','resolved','in_review') NOT NULL DEFAULT 'none' AFTER status",
        "ALTER TABLE appointments ADD COLUMN IF NOT EXISTS closure_due_at DATETIME(6) NULL AFTER closure_state",
        "ALTER TABLE appointments ADD COLUMN IF NOT EXISTS closure_provider_action ENUM('none','code_entered','no_show','issue') NOT NULL DEFAULT 'none' AFTER closure_due_at",
        "ALTER TABLE appointments ADD COLUMN IF NOT EXISTS closure_client_action ENUM('none','ok','no_show','issue') NOT NULL DEFAULT 'none' AFTER closure_provider_action",
        'ALTER TABLE appointments ADD COLUMN IF NOT EXISTS closure_notes JSON NULL AFTER closure_client_action',
        'ALTER TABLE appointments ADD COLUMN IF NOT EXISTS cash_verified_at DATETIME(6) NULL AFTER closure_notes',
        'ALTER TABLE appointments ADD COLUMN IF NOT EXISTS verification_code VARCHAR(8) NULL',
        'ALTER TABLE appointments ADD COLUMN IF NOT EXISTS code_generated_at DATETIME(6) NULL',
        "ALTER TABLE appointments ADD COLUMN IF NOT EXISTS payment_method ENUM('card','cash') NULL"
      ];

      for (const sql of statements) {
        await pool.query(sql);
      }

      const indexStatements: string[] = [
        'CREATE INDEX IF NOT EXISTS idx_appointments_closure_state ON appointments (closure_state)',
        'CREATE INDEX IF NOT EXISTS idx_appointments_closure_due_at ON appointments (closure_due_at)'
      ];

      for (const sql of indexStatements) {
        await pool.query(sql);
      }

      await pool.query(
        `INSERT INTO platform_settings (setting_key, setting_value, setting_type, description)
         SELECT 'cash_max_amount', '150000', 'number', 'Tope máximo por cita para pagos en efectivo (CLP)'
         WHERE NOT EXISTS (SELECT 1 FROM platform_settings WHERE setting_key = 'cash_max_amount')`
      );

      Logger.info(MODULE, '[CASH_SCHEMA] Columnas cash/closure verificadas');
    } catch (error) {
      Logger.error(MODULE, '[CASH_SCHEMA] Error garantizando columnas cash/closure', error);
    }
  })();

  return ensureCashSchemaPromise;
}

function buildRouter(): Router {
  const router = Router();

  void ensureCashSchema();

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
      
      console.log('🟢 [APPOINTMENTS] ==================== NUEVA CITA CREADA ====================');
      console.log('🟢 [APPOINTMENTS] Appointment ID:', id);
      console.log('🟢 [APPOINTMENTS] Provider ID:', provider_id);
      console.log('🟢 [APPOINTMENTS] Client ID:', client_id);
      console.log('🟢 [APPOINTMENTS] Client Name:', (appointment as any).client_name);
      console.log('🟢 [APPOINTMENTS] Start Time:', start_time);
      console.log('🟢 [APPOINTMENTS] Appointment Data:', JSON.stringify(appointment, null, 2));
      
      // Emitir en tiempo real a provider y client
      console.log('🔵 [APPOINTMENTS] Emitiendo socket a provider y client...');
      try { 
        emitToUser(provider_id, 'appointment:created', appointment);
        console.log('🔵 [APPOINTMENTS] ✅ Socket emitido a provider:', provider_id);
      } catch (err) {
        console.error('🔴 [APPOINTMENTS] ❌ Error emitiendo socket a provider:', err);
      }
      
      try { 
        emitToUser(client_id, 'appointment:created', appointment);
        console.log('🔵 [APPOINTMENTS] ✅ Socket emitido a client:', client_id);
      } catch (err) {
        console.error('🔴 [APPOINTMENTS] ❌ Error emitiendo socket a client:', err);
      }
      
      // Push al proveedor
      console.log('🟣 [APPOINTMENTS] ==================== ENVIANDO PUSH NOTIFICATION ====================');
      console.log('🟣 [APPOINTMENTS] Provider ID para push:', provider_id);
      console.log('🟣 [APPOINTMENTS] Título:', 'Nueva cita por confirmar');
      console.log('🟣 [APPOINTMENTS] Mensaje:', `Cliente: ${(appointment as any).client_name || ''} • ${String(start_time).slice(0,5)}`);
      
      try { 
        await PushService.notifyUser(
          Number(provider_id), 
          'Nueva cita por confirmar', 
          `Cliente: ${(appointment as any).client_name || ''} • ${String(start_time).slice(0,5)}`, 
          { type: 'appointment', appointment_id: String(id) }
        );
        console.log('🟣 [APPOINTMENTS] ✅ Push notification enviada exitosamente');
      } catch (pushErr) {
        console.error('🔴 [APPOINTMENTS] ❌ Error enviando push notification:', pushErr);
        console.error('🔴 [APPOINTMENTS] Error stack:', (pushErr as Error).stack);
      }
      
      console.log('🟢 [APPOINTMENTS] ==================== FIN CREACIÓN CITA ====================');
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
      Logger.info(MODULE, `📅 Listando citas del día para provider=${user.id} date=${date}`);
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
      Logger.info(MODULE, `📅 Citas retornadas: ${(rows as any[]).length}`, { sample: (rows as any[])[0] });
      res.setHeader('Cache-Control', 'no-store');
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
      
      console.log('🟢 [TIME_SLOTS] ==================== OBTENIENDO TIME SLOTS ====================');
      console.log('🟢 [TIME_SLOTS] Provider ID:', provider_id);
      console.log('🟢 [TIME_SLOTS] Date:', date);
      console.log('🟢 [TIME_SLOTS] Service ID:', service_id);
      
      if (!provider_id || !date || !service_id) return res.status(400).json({ success: false, error: 'provider_id, date y service_id son requeridos' });
      
      const pool = DatabaseConnection.getPool();
      
      // Duración del servicio
      const [sv] = await pool.query('SELECT duration_minutes FROM provider_services WHERE id = ? AND provider_id = ? LIMIT 1', [service_id, provider_id]);
      if ((sv as any[]).length === 0) return res.status(404).json({ success: false, error: 'Servicio no encontrado' });
      const duration = Number((sv as any[])[0].duration_minutes || 30);
      console.log('🟢 [TIME_SLOTS] Duración del servicio:', duration, 'minutos');
      
      // Obtener día de la semana
      const dayOfWeek = getDayOfWeekFromDate(date);
      console.log('🟢 [TIME_SLOTS] Día de la semana:', dayOfWeek);
      
      // 1. Obtener bloques semanales del proveedor
      const [weekly] = await pool.query(
        'SELECT start_time, end_time FROM provider_availability WHERE provider_id = ? AND day_of_week = ? AND is_active = TRUE',
        [provider_id, dayOfWeek]
      );
      
      let blocks = (weekly as any[]).length > 0 
        ? (weekly as any[]).map((w: any) => ({ 
            start: String(w.start_time).slice(0, 5), 
            end: String(w.end_time).slice(0, 5) 
          }))
        : [{ start: '09:00', end: '18:00' }]; // Default si no hay configuración
      
      console.log('🟢 [TIME_SLOTS] Bloques semanales:', blocks);
      
      // 2. Verificar excepciones para esta fecha específica
      const [exceptions] = await pool.query(
        'SELECT is_available, start_time, end_time, reason FROM availability_exceptions WHERE provider_id = ? AND exception_date = ?',
        [provider_id, date]
      );
      
      console.log('🟢 [TIME_SLOTS] Excepciones encontradas:', (exceptions as any[]).length);
      
      let blockedRanges: Array<{ start: string; end: string; reason: string }> = [];
      
      for (const exc of (exceptions as any[])) {
        console.log('🟢 [TIME_SLOTS] Excepción:', exc);
        
        if (!exc.is_available) {
          // Es un bloqueo
          if (!exc.start_time && !exc.end_time) {
            // Bloqueo de todo el día
            console.log('🔴 [TIME_SLOTS] ⚠️ TODO EL DÍA BLOQUEADO');
            blocks = []; // No hay bloques disponibles
          } else {
            // Bloqueo de horario específico
            blockedRanges.push({
              start: String(exc.start_time).slice(0, 5),
              end: String(exc.end_time).slice(0, 5),
              reason: exc.reason || 'Bloqueado'
            });
            console.log('🔴 [TIME_SLOTS] Horario bloqueado:', exc.start_time, '-', exc.end_time);
          }
        } else {
          // Es una habilitación especial (sobrescribe horario semanal)
          if (exc.start_time && exc.end_time) {
            blocks = [{
              start: String(exc.start_time).slice(0, 5),
              end: String(exc.end_time).slice(0, 5)
            }];
            console.log('🟢 [TIME_SLOTS] Horario especial habilitado:', exc.start_time, '-', exc.end_time);
          }
        }
      }
      
      // 3. Obtener citas existentes del día
      const [apps] = await pool.query('SELECT \`start_time\`, \`end_time\` FROM appointments WHERE provider_id = ? AND \`date\` = ?', [provider_id, date]);
      console.log('🟢 [TIME_SLOTS] Citas existentes:', (apps as any[]).length);
      
      // 4. Generar slots considerando bloques, bloqueos y citas
      const slots: Array<{ time: string; is_available: boolean; reason?: string }> = [];
      
      for (const b of blocks) {
        let cursor = b.start;
        while (addMinutes(cursor, duration) <= b.end) {
          const next = addMinutes(cursor, duration);
          
          // Verificar overlap con citas
          const hasAppointment = (apps as any[]).some((a: any) => {
            const aStart = String(a.start_time).slice(0, 5);
            const aEnd = String(a.end_time).slice(0, 5);
            return !(aEnd <= cursor || aStart >= next);
          });
          
          // Verificar si está en un rango bloqueado
          const isBlocked = blockedRanges.some((br: any) => {
            return !(br.end <= cursor || br.start >= next);
          });
          
          let reason: string | undefined;
          if (isBlocked) {
            reason = 'blocked';
          } else if (hasAppointment) {
            reason = 'booked';
          }
          
          slots.push({ 
            time: cursor, 
            is_available: !hasAppointment && !isBlocked,
            ...(reason ? { reason } : {})
          });
          
          cursor = next;
        }
      }
      
      console.log('🟢 [TIME_SLOTS] Slots generados:', slots.length);
      console.log('🟢 [TIME_SLOTS] Disponibles:', slots.filter(s => s.is_available).length);
      console.log('🟢 [TIME_SLOTS] Bloqueados:', slots.filter(s => s.reason === 'blocked').length);
      console.log('🟢 [TIME_SLOTS] Ocupados:', slots.filter(s => s.reason === 'booked').length);
      
      return res.json({ success: true, time_slots: slots });
    } catch (err) {
      console.error('🔴 [TIME_SLOTS] Error:', err);
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
                a.price,
                (SELECT p.status FROM payments p WHERE p.appointment_id = a.id ORDER BY p.id DESC LIMIT 1) AS payment_status,
                COALESCE(pp.profile_photo_url, cpp.profile_photo_url) AS provider_avatar_url
         FROM appointments a
         LEFT JOIN provider_profiles pp ON pp.provider_id = a.provider_id
         LEFT JOIN client_profiles cpp ON cpp.client_id = a.provider_id
         WHERE a.client_id = ?
         ORDER BY a.\`date\` ASC, a.\`start_time\` ASC`,
        [clientId]
      );
      const publicBase = process.env.PUBLIC_BASE_URL || process.env.API_BASE_URL || `${req.protocol}://${req.get('host')}`;
      const withAvatars = (rows as any[]).map(r => ({
        ...r,
        provider_avatar_url: r.provider_avatar_url ? `${publicBase}${r.provider_avatar_url}` : null
      }));
      Logger.info(MODULE, `Client appointments loaded: ${(withAvatars as any[]).length} appointments`, { sample: (withAvatars as any[])[0] });
      console.log('[BACKEND] Sample appointment data:', (withAvatars as any[])[0] ? { id: (withAvatars as any[])[0].id, price: (withAvatars as any[])[0].price, service_name: (withAvatars as any[])[0].service_name } : 'No appointments');
      return res.json({ success: true, appointments: withAvatars });
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
      
      // Enviar notificaciones push según el estado
      try {
        if (status === 'confirmed') {
          await PushService.notifyUser(
            Number(updated.client_id), 
            'Cita confirmada', 
            `Tu cita con ${updated.provider_name} ha sido confirmada para el ${updated.date} a las ${updated.start_time}`, 
            { type: 'appointment', appointment_id: String(id), status: 'confirmed' }
          );
        } else if (status === 'cancelled') {
          const cancelledBy = user.role === 'provider' ? 'el proveedor' : 'el cliente';
          await PushService.notifyUser(
            Number(updated.client_id), 
            'Cita cancelada', 
            `Tu cita con ${updated.provider_name} ha sido cancelada por ${cancelledBy}`, 
            { type: 'appointment', appointment_id: String(id), status: 'cancelled' }
          );
          await PushService.notifyUser(
            Number(updated.provider_id), 
            'Cita cancelada', 
            `La cita con ${updated.client_name} ha sido cancelada por ${cancelledBy}`, 
            { type: 'appointment', appointment_id: String(id), status: 'cancelled' }
          );
        } else if (status === 'completed') {
          await PushService.notifyUser(
            Number(updated.client_id), 
            'Cita completada', 
            `Tu cita con ${updated.provider_name} ha sido marcada como completada`, 
            { type: 'appointment', appointment_id: String(id), status: 'completed' }
          );
        }
      } catch (pushError) {
        Logger.error(MODULE, 'Error sending push notification', pushError as any);
      }
      
      return res.json({ success: true, appointment: updated });
    } catch (err) {
      Logger.error(MODULE, 'Error updating appointment status', err as any);
      return res.status(500).json({ success: false, error: 'Error al actualizar estado' });
    }
  });

  // POST /appointments/:id/cash/collect - registrar cobro en efectivo
  router.post('/appointments/:id/cash/collect', authenticateToken, cashClosureGate, async (req: Request, res: Response) => {
    try {
      const user = (req as any).user || {};
      const appointmentId = Number(req.params.id);
      if (!Number.isFinite(appointmentId)) return res.status(400).json({ success: false, error: 'id inválido' });

      const pool = DatabaseConnection.getPool();
      // Cargar cita
      const [[appt]]: any = await pool.query('SELECT * FROM appointments WHERE id = ? LIMIT 1', [appointmentId]);
      if (!appt) return res.status(404).json({ success: false, error: 'Cita no encontrada' });
      // Solo el proveedor dueño puede registrar cobro en efectivo
      if (Number(appt.provider_id) !== Number(user.id)) {
        return res.status(403).json({ success: false, error: 'No autorizado' });
      }
      if (String(appt.status) !== 'confirmed') {
        return res.status(400).json({ success: false, error: 'La cita debe estar confirmada para registrar efectivo' });
      }
      const amount = Number(appt.price || 0);
      if (!(amount > 0)) return res.status(400).json({ success: false, error: 'Precio inválido para la cita' });

      const cashSettings = await loadCashSettings(pool, MODULE);
      if (amount > cashSettings.cashCap) {
        return res.status(400).json({ success: false, error: buildCashCapErrorMessage(cashSettings.cashCap), cashCap: cashSettings.cashCap });
      }

      // Evitar duplicados si ya existe payment completed
      const [[existing]]: any = await pool.query(
        'SELECT id FROM payments WHERE appointment_id = ? AND status = "completed" LIMIT 1',
        [appointmentId]
      );
      if (existing) return res.status(400).json({ success: false, error: 'El pago ya fue registrado' });

      // Obtener tax y comisión desde settings
      const taxRate = cashSettings.taxRate;
      const commissionRate = cashSettings.commissionRate;

      const priceBase = Number((amount / (1 + taxRate / 100)).toFixed(2));
      const taxAmount = Number((amount - priceBase).toFixed(2));
      const commissionAmount = Number((priceBase * (commissionRate / 100)).toFixed(2));
      const providerAmount = Number((priceBase - commissionAmount).toFixed(2));

      // Insertar payment en efectivo
      const [ins]: any = await pool.execute(
        `INSERT INTO payments (appointment_id, client_id, provider_id, amount, tax_amount, commission_amount, provider_amount, currency, payment_method, status, paid_at, can_release, release_status)
         VALUES (?, ?, ?, ?, ?, ?, ?, 'CLP', 'cash', 'completed', NOW(), TRUE, 'eligible')`,
        [appointmentId, appt.client_id, appt.provider_id, amount, taxAmount, commissionAmount, providerAmount]
      );
      const paymentId = ins.insertId;

      // Registrar deuda de comisión del proveedor (si existe la tabla) con due_date (T + cash_commission_due_days)
      try {
        await pool.execute(
          `INSERT INTO provider_commission_debts (provider_id, appointment_id, payment_id, commission_amount, currency, status, due_date, created_at)
           VALUES (?, ?, ?, ?, 'CLP', 'pending', DATE_ADD(NOW(), INTERVAL ? DAY), NOW())`,
          [appt.provider_id, appointmentId, paymentId, commissionAmount, cashSettings.dueDays]
        );
      } catch (e) {
        Logger.warn(MODULE, 'No se pudo registrar deuda de comisión (tabla puede no existir aún)');
      }

      // Actualizar appointment para reflejar método de pago
      try {
        await pool.execute(`UPDATE appointments SET payment_method = 'cash', updated_at = NOW() WHERE id = ?`, [appointmentId]);
      } catch (err) {
        Logger.warn(MODULE, '[CASH] No se pudo actualizar payment_method al registrar cobro', err as any);
      }

      // Notificar a cliente (push + in-app)
      try {
        await PushService.notifyUser(
          Number(appt.client_id),
          'Pago en efectivo registrado',
          'El proveedor registró el cobro de tu cita en efectivo.',
          { type: 'payment', appointment_id: String(appointmentId), method: 'cash' }
        );
      } catch {}

      // Emitir socket a cliente y proveedor
      try {
        emitToUser(appt.provider_id, 'payment:created', { appointment_id: appointmentId, payment_id: paymentId, method: 'cash' });
        emitToUser(appt.client_id, 'payment:created', { appointment_id: appointmentId, payment_id: paymentId, method: 'cash' });
      } catch {}

      return res.json({ success: true, payment_id: paymentId });
    } catch (err) {
      Logger.error(MODULE, 'Error registrando cobro en efectivo', err as any);
      return res.status(500).json({ success: false, error: 'Error al registrar efectivo' });
    }
  });

  // POST /appointments/:id/cash/select - seleccionar efectivo y generar código
  router.post('/appointments/:id/cash/select', authenticateToken, cashClosureGate, async (req: Request, res: Response) => {
    try {
      const user = (req as any).user || {};
      const appointmentId = Number(req.params.id);
      if (!Number.isFinite(appointmentId)) return res.status(400).json({ success: false, error: 'id inválido' });

      const pool = DatabaseConnection.getPool();
      const [[appt]]: any = await pool.query('SELECT * FROM appointments WHERE id = ? LIMIT 1', [appointmentId]);
      if (!appt) return res.status(404).json({ success: false, error: 'Cita no encontrada' });
      if (Number(appt.client_id) !== Number(user.id) && Number(appt.provider_id) !== Number(user.id)) {
        return res.status(403).json({ success: false, error: 'No autorizado' });
      }

      const amount = Number(appt.price || 0);
      if (!(amount > 0)) return res.status(400).json({ success: false, error: 'Precio inválido para la cita' });

      const cashSettings = await loadCashSettings(pool, MODULE);
      if (amount > cashSettings.cashCap) {
        return res.status(400).json({ success: false, error: buildCashCapErrorMessage(cashSettings.cashCap), cashCap: cashSettings.cashCap });
      }

      // Generar/asegurar código de verificación
      let verificationCode = String(appt.verification_code || '').trim();
      if (!verificationCode) {
        verificationCode = generateVerificationCode();
        try {
          await pool.execute(
            `UPDATE appointments SET verification_code = ?, code_generated_at = NOW(), payment_method = 'cash', updated_at = NOW() WHERE id = ?`,
            [verificationCode, appointmentId]
          );
        } catch (e) {
          Logger.error(MODULE, 'Fallo al persistir verification_code', e as any);
          return res.status(500).json({ success: false, error: 'No se pudo guardar el código de verificación. Intenta nuevamente.' });
        }
      } else {
        try {
          await pool.execute(`UPDATE appointments SET payment_method = 'cash', updated_at = NOW() WHERE id = ?`, [appointmentId]);
        } catch (err) {
          Logger.warn(MODULE, '[CASH] No se pudo actualizar payment_method al seleccionar efectivo', err as any);
        }
      }

      return res.json({ success: true, code: verificationCode, cashCap: cashSettings.cashCap });
    } catch (err) {
      Logger.error(MODULE, 'Error en cash/select', err as any);
      return res.status(500).json({ success: false, error: 'Error al seleccionar efectivo' });
    }
  });

  // POST /appointments/:id/cash/verify-code - validar código para cierre/pago cash
  router.post('/appointments/:id/cash/verify-code', authenticateToken, cashClosureGate, async (req: Request, res: Response) => {
    try {
      const user = (req as any).user || {};
      const appointmentId = Number(req.params.id);
      const { code } = req.body || {};
      if (!Number.isFinite(appointmentId)) return res.status(400).json({ success: false, error: 'id inválido' });
      if (!validateCodeFormat(String(code || ''))) return res.status(400).json({ success: false, error: 'Código inválido' });

      const pool = DatabaseConnection.getPool();
      const [[appt]]: any = await pool.query('SELECT * FROM appointments WHERE id = ? LIMIT 1', [appointmentId]);
      if (!appt) return res.status(404).json({ success: false, error: 'Cita no encontrada' });

      // Solo proveedor puede validar para registrar cobro
      if (Number(appt.provider_id) !== Number(user.id)) {
        return res.status(403).json({ success: false, error: 'Solo el proveedor puede validar el código' });
      }

      // Ventana de validación: desde inicio hasta fin + 90min (configurable posteriormente)
      // Nota: aquí solo aplicamos verificación de código y tope cash
      const stored = String(appt.verification_code || '').trim();
      if (!stored || !compareVerificationCodes(String(code), stored)) {
        return res.status(400).json({ success: false, error: 'Código incorrecto' });
      }

      const amount = Number(appt.price || 0);
      const cashSettings = await loadCashSettings(pool, MODULE);
      if (amount > cashSettings.cashCap) {
        return res.status(400).json({ success: false, error: buildCashCapErrorMessage(cashSettings.cashCap), cashCap: cashSettings.cashCap });
      }

      // Evitar duplicados si ya existe payment completed
      const [[existing]]: any = await pool.query(
        'SELECT id FROM payments WHERE appointment_id = ? AND status = "completed" LIMIT 1',
        [appointmentId]
      );
      if (existing) return res.status(400).json({ success: false, error: 'El pago ya fue registrado' });

      // Calcular impuestos/comisión
      const taxRate = cashSettings.taxRate;
      const commissionRate = cashSettings.commissionRate;
      const dueDays = cashSettings.dueDays;

      const priceBase = Number((amount / (1 + taxRate / 100)).toFixed(2));
      const taxAmount = Number((amount - priceBase).toFixed(2));
      const commissionAmount = Number((priceBase * (commissionRate / 100)).toFixed(2));
      const providerAmount = Number((priceBase - commissionAmount).toFixed(2));

      // Insert payment cash
      const [ins]: any = await pool.execute(
        `INSERT INTO payments (appointment_id, client_id, provider_id, amount, tax_amount, commission_amount, provider_amount, currency, payment_method, status, paid_at, can_release, release_status)
         VALUES (?, ?, ?, ?, ?, ?, ?, 'CLP', 'cash', 'completed', NOW(), TRUE, 'eligible')`,
        [appointmentId, appt.client_id, appt.provider_id, amount, taxAmount, commissionAmount, providerAmount]
      );
      const paymentId = ins.insertId;

      // Deuda de comisión
      try {
        await pool.execute(
          `INSERT INTO provider_commission_debts (provider_id, appointment_id, payment_id, commission_amount, currency, status, due_date, created_at)
           VALUES (?, ?, ?, ?, 'CLP', 'pending', DATE_ADD(NOW(), INTERVAL ? DAY), NOW())`,
          [appt.provider_id, appointmentId, paymentId, commissionAmount, dueDays]
        );
      } catch (err) {
        Logger.warn(MODULE, '[CASH] No se pudo registrar deuda de comisión durante verify-code', err as any);
      }

      // Marcar cash_verified_at y preparar cierre
      try {
        await pool.execute(
          `UPDATE appointments SET cash_verified_at = NOW(), payment_method = 'cash', updated_at = NOW() WHERE id = ?`,
          [appointmentId]
        );
      } catch {}

      // Notificar
      try {
        await PushService.notifyUser(
          Number(appt.client_id),
          'Pago en efectivo verificado',
          'El proveedor validó el código de tu cita y registró el pago en efectivo.',
          { type: 'payment', appointment_id: String(appointmentId), method: 'cash' }
        );
      } catch {}

      return res.json({ success: true, payment_id: paymentId });
    } catch (err) {
      Logger.error(MODULE, 'Error en cash/verify-code', err as any);
      return res.status(500).json({ success: false, error: 'Error al verificar código de efectivo' });
    }
  });

  // Helper: resolver cierre mutuo si hay suficiente información
  async function resolveClosureIfPossible(appointmentId: number) {
    const pool = DatabaseConnection.getPool();
    const [[appt]]: any = await pool.query('SELECT * FROM appointments WHERE id = ? LIMIT 1', [appointmentId]);
    if (!appt) return { resolved: false };

    const providerAction = String(appt.closure_provider_action || 'none');
    const clientAction = String(appt.closure_client_action || 'none');

    // Si ya existe un payment completed, resolver
    const [[existingPay]]: any = await pool.query('SELECT id FROM payments WHERE appointment_id = ? AND status = "completed" LIMIT 1', [appointmentId]);
    if (existingPay) {
      await pool.execute(`UPDATE appointments SET closure_state = 'resolved', updated_at = NOW() WHERE id = ?`, [appointmentId]);
      return { resolved: true };
    }

    // Matriz parcial
    if (providerAction === 'no_show' && clientAction === 'no_show') {
      await pool.execute(`UPDATE appointments SET closure_state = 'resolved', updated_at = NOW() WHERE id = ?`, [appointmentId]);
      return { resolved: true };
    }

    // Si el cliente dijo OK o no hay acciones pero queremos forzar comisión por defecto, crear payment+debt
    if (clientAction === 'ok' || providerAction === 'code_entered') {
      const amount = Number(appt.price || 0);
      const settings = await loadCashSettings(pool, MODULE);
      if (amount > settings.cashCap) return { resolved: false };

      const priceBase = Number((amount / (1 + settings.taxRate / 100)).toFixed(2));
      const taxAmount = Number((amount - priceBase).toFixed(2));
      const commissionAmount = Number((priceBase * (settings.commissionRate / 100)).toFixed(2));
      const providerAmount = Number((priceBase - commissionAmount).toFixed(2));

      const [ins]: any = await pool.execute(
        `INSERT INTO payments (appointment_id, client_id, provider_id, amount, tax_amount, commission_amount, provider_amount, currency, payment_method, status, paid_at, can_release, release_status)
         VALUES (?, ?, ?, ?, ?, ?, ?, 'CLP', 'cash', 'completed', NOW(), TRUE, 'eligible')`,
        [appointmentId, appt.client_id, appt.provider_id, amount, taxAmount, commissionAmount, providerAmount]
      );
      const paymentId = ins.insertId;
      try {
        await pool.execute(
          `INSERT INTO provider_commission_debts (provider_id, appointment_id, payment_id, commission_amount, currency, status, due_date, created_at)
           VALUES (?, ?, ?, ?, 'CLP', 'pending', DATE_ADD(NOW(), INTERVAL ? DAY), NOW())`,
          [appt.provider_id, appointmentId, paymentId, commissionAmount, settings.dueDays]
        );
      } catch {}
      await pool.execute(`UPDATE appointments SET closure_state = 'resolved', payment_method = 'cash', updated_at = NOW() WHERE id = ?`, [appointmentId]);
      return { resolved: true, payment_id: paymentId };
    }

    return { resolved: false };
  }

  // POST /appointments/:id/closure/provider-action
  router.post('/appointments/:id/closure/provider-action', authenticateToken, async (req: Request, res: Response) => {
    try {
      const user = (req as any).user || {};
      const appointmentId = Number(req.params.id);
      const { action, notes } = req.body || {};
      if (!Number.isFinite(appointmentId)) return res.status(400).json({ success: false, error: 'id inválido' });
      if (!['no_show','issue','code_entered'].includes(String(action))) return res.status(400).json({ success: false, error: 'acción inválida' });

      const pool = DatabaseConnection.getPool();
      const [[appt]]: any = await pool.query('SELECT id, provider_id FROM appointments WHERE id = ? LIMIT 1', [appointmentId]);
      if (!appt) return res.status(404).json({ success: false, error: 'Cita no encontrada' });
      if (Number(appt.provider_id) !== Number(user.id)) return res.status(403).json({ success: false, error: 'No autorizado' });

      await pool.execute(
        `UPDATE appointments SET closure_provider_action = ?, closure_notes = JSON_SET(COALESCE(closure_notes, JSON_OBJECT()), '$.provider_notes', ?) , updated_at = NOW() WHERE id = ?`,
        [String(action), notes || null, appointmentId]
      );

      const result = await resolveClosureIfPossible(appointmentId);
      return res.json({ success: true, resolved: result.resolved, payment_id: (result as any).payment_id || null });
    } catch (err) {
      Logger.error(MODULE, 'Error provider-action', err as any);
      return res.status(500).json({ success: false, error: 'Error en provider-action' });
    }
  });

  // POST /appointments/:id/closure/client-action
  router.post('/appointments/:id/closure/client-action', authenticateToken, async (req: Request, res: Response) => {
    try {
      const user = (req as any).user || {};
      const appointmentId = Number(req.params.id);
      const { action, notes } = req.body || {};
      if (!Number.isFinite(appointmentId)) return res.status(400).json({ success: false, error: 'id inválido' });
      if (!['ok','no_show','issue'].includes(String(action))) return res.status(400).json({ success: false, error: 'acción inválida' });

      const pool = DatabaseConnection.getPool();
      const [[appt]]: any = await pool.query('SELECT id, client_id FROM appointments WHERE id = ? LIMIT 1', [appointmentId]);
      if (!appt) return res.status(404).json({ success: false, error: 'Cita no encontrada' });
      if (Number(appt.client_id) !== Number(user.id)) return res.status(403).json({ success: false, error: 'No autorizado' });

      await pool.execute(
        `UPDATE appointments SET closure_client_action = ?, closure_notes = JSON_SET(COALESCE(closure_notes, JSON_OBJECT()), '$.client_notes', ?) , updated_at = NOW() WHERE id = ?`,
        [String(action), notes || null, appointmentId]
      );

      const result = await resolveClosureIfPossible(appointmentId);
      return res.json({ success: true, resolved: result.resolved, payment_id: (result as any).payment_id || null });
    } catch (err) {
      Logger.error(MODULE, 'Error client-action', err as any);
      return res.status(500).json({ success: false, error: 'Error en client-action' });
    }
  });

  // GET /appointments/:id/closure - estado de cierre
  router.get('/appointments/:id/closure', authenticateToken, async (req: Request, res: Response) => {
    try {
      const appointmentId = Number(req.params.id);
      if (!Number.isFinite(appointmentId)) return res.status(400).json({ success: false, error: 'id inválido' });
      const pool = DatabaseConnection.getPool();
      const [[row]]: any = await pool.query(
        `SELECT id, closure_state, closure_due_at, closure_provider_action, closure_client_action FROM appointments WHERE id = ? LIMIT 1`,
        [appointmentId]
      );
      if (!row) return res.status(404).json({ success: false, error: 'Cita no encontrada' });
      return res.json({ success: true, closure: row });
    } catch (err) {
      Logger.error(MODULE, 'Error get closure', err as any);
      return res.status(500).json({ success: false, error: 'Error al consultar cierre' });
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
  
  /**
   * Obtener día de la semana desde fecha YYYY-MM-DD
   * @param dateStr Fecha en formato YYYY-MM-DD
   * @returns Día de la semana: 'monday', 'tuesday', etc.
   */
  function getDayOfWeekFromDate(dateStr: string): string {
    const [year, month, day] = dateStr.split('-').map(Number);
    const date = new Date(year, month - 1, day);
    const dayIndex = date.getDay(); // 0=Sunday, 1=Monday, ..., 6=Saturday
    
    const daysMap: Record<number, string> = {
      0: 'sunday',
      1: 'monday',
      2: 'tuesday',
      3: 'wednesday',
      4: 'thursday',
      5: 'friday',
      6: 'saturday'
    };
    
    return daysMap[dayIndex] || 'monday';
  }

  // ========================================
  // ENDPOINTS DE VERIFICACIÓN DE CÓDIGOS
  // ========================================

  /**
   * POST /appointments/:id/verify-completion
   * Verifica el código de 4 dígitos para marcar servicio como completado
   * Solo el proveedor puede llamar este endpoint
   */
  router.post('/appointments/:id/verify-completion', authenticateToken, async (req: Request, res: Response) => {
    try {
      const user = (req as any).user || {};
      const appointmentId = Number(req.params.id);
      const { verification_code } = req.body || {};
      
      Logger.info(MODULE, '🔐 ==================== VERIFICANDO CÓDIGO ====================');
      Logger.info(MODULE, `🔐 Appointment ID: ${appointmentId}`);
      Logger.info(MODULE, `🔐 Provider ID: ${user.id}`);
      Logger.info(MODULE, `🔐 Código ingresado: ${verification_code}`);
      
      // Validar formato del código
      if (!verification_code || !validateCodeFormat(verification_code)) {
        Logger.error(MODULE, '❌ Código inválido (formato incorrecto)');
        return res.status(400).json({ 
          success: false, 
          error: 'Código de 4 dígitos requerido' 
        });
      }
      
      const pool = DatabaseConnection.getPool();
      
      // Obtener la cita
      const [rows] = await pool.query(
        `SELECT id, provider_id, client_id, service_id, verification_code, 
                verification_attempts, status, date, start_time,
                (SELECT name FROM users WHERE id = client_id) AS client_name,
                (SELECT name FROM provider_services WHERE id = service_id) AS service_name
         FROM appointments 
         WHERE id = ? AND provider_id = ?
         LIMIT 1`,
        [appointmentId, user.id]
      );
      
      if ((rows as any[]).length === 0) {
        Logger.error(MODULE, '❌ Cita no encontrada o no pertenece al proveedor');
        return res.status(404).json({ 
          success: false, 
          error: 'Cita no encontrada' 
        });
      }
      
      const appointment = (rows as any[])[0];
      
      Logger.info(MODULE, `🔐 Cita encontrada: ${JSON.stringify({
        id: appointment.id,
        status: appointment.status,
        code: appointment.verification_code,
        attempts: appointment.verification_attempts
      })}`);
      
      // Verificar que la cita tenga código (fue pagada)
      if (!appointment.verification_code) {
        Logger.error(MODULE, '❌ Cita no tiene código de verificación (no fue pagada)');
        return res.status(400).json({ 
          success: false, 
          error: 'Esta cita no tiene código de verificación. El cliente debe pagar primero.' 
        });
      }
      
      // Verificar límite de intentos
      if (appointment.verification_attempts >= 3) {
        Logger.error(MODULE, `❌ Límite de intentos excedido (${appointment.verification_attempts})`);
        return res.status(429).json({ 
          success: false, 
          error: 'Límite de intentos excedido. Contacta a soporte.', 
          remainingAttempts: 0
        });
      }
      
      // Sanitizar y comparar códigos
      const inputCode = sanitizeCode(verification_code);
      const storedCode = appointment.verification_code;
      
      Logger.info(MODULE, `🔐 Comparando: '${inputCode}' vs '${storedCode}'`);
      
      if (compareVerificationCodes(inputCode, storedCode)) {
        Logger.info(MODULE, '✅ CÓDIGO CORRECTO - Marcando servicio como completado');
        
        // Marcar como completado y permitir liberación de fondos
        await pool.execute(
          `UPDATE appointments 
           SET status = 'completed', 
               completed_at = NOW(), 
               verified_at = NOW(),
               verified_by_provider_id = ?
           WHERE id = ?`,
          [user.id, appointmentId]
        );
        
        // Permitir liberación de fondos con evaluación de retención (Stripe)
        let stripeReleaseDays = 10;
        try {
          const [cfg]: any = await pool.query(
            `SELECT setting_value FROM platform_settings WHERE setting_key = 'stripe_release_days' LIMIT 1`
          );
          if ((cfg as any[]).length) stripeReleaseDays = Number((cfg as any[])[0].setting_value) || 10;
        } catch {}

        await pool.execute(
          `UPDATE payments 
           SET can_release = TRUE,
               release_status = CASE 
                 WHEN paid_at IS NOT NULL AND paid_at <= NOW() - INTERVAL ? DAY THEN 'eligible' 
                 ELSE 'pending' 
               END
           WHERE appointment_id = ?`,
          [stripeReleaseDays, appointmentId]
        );

        // Si ya es elegible, mover de pending_balance → balance y marcar release
        try {
          const [[p]]: any = await pool.query(
            `SELECT id, provider_id, provider_amount, paid_at,
                    (paid_at IS NOT NULL AND paid_at <= NOW() - INTERVAL ? DAY) AS is_eligible
             FROM payments WHERE appointment_id = ? LIMIT 1`,
            [stripeReleaseDays, appointmentId]
          );
          if (p && Number(p.is_eligible) === 1) {
            // Asegurar fila de wallet
            await pool.execute(
              `INSERT INTO wallet_balance (user_id, balance, pending_balance, total_earned, total_withdrawn, currency)
               VALUES (?, 0, 0, 0, 0, 'CLP')
               ON DUPLICATE KEY UPDATE user_id = user_id`,
              [p.provider_id]
            );
            // Mover fondos
            await pool.execute(
              'UPDATE wallet_balance SET pending_balance = GREATEST(pending_balance - ?, 0), balance = balance + ?, total_earned = total_earned + ? WHERE user_id = ?',
              [p.provider_amount, p.provider_amount, p.provider_amount, p.provider_id]
            );
            // Marcar payment liberado
            await pool.execute('UPDATE payments SET release_status = "completed", released_at = NOW() WHERE id = ?', [p.id]);
            // Registrar transacción
            await pool.execute(
              `INSERT INTO transactions (user_id, type, amount, currency, description, payment_id, appointment_id, created_at)
               VALUES (?, 'payment_received', ?, 'CLP', 'Liberación por verificación', ?, ?, NOW())`,
              [p.provider_id, p.provider_amount, p.id, appointmentId]
            );
            Logger.info(MODULE, '💸 Fondos liberados al balance del proveedor', { paymentId: p.id, appointmentId });
          } else {
            Logger.info(MODULE, '⏳ Fondos marcados como liberables pero no elegibles aún por retención');
          }
        } catch (fundErr) {
          Logger.warn(MODULE, 'No se pudo mover fondos al balance (se intentará luego por job/manual)');
        }
        
        // Emitir socket a proveedor y cliente
        try {
          emitToUser(appointment.provider_id, 'appointment:completed', { id: appointmentId });
          emitToUser(appointment.client_id, 'appointment:completed', { id: appointmentId });
        } catch (socketErr) {
          Logger.error(MODULE, 'Error emitting socket', socketErr as any);
        }
        
        // Notificar al cliente
        try {
          await PushService.notifyUser(
            appointment.client_id,
            '✅ Servicio Completado',
            `Tu servicio "${appointment.service_name}" ha sido verificado y completado.`,
            { type: 'appointment', appointment_id: String(appointmentId), status: 'completed' }
          );
          
          await PushService.createInAppNotification(
            appointment.client_id,
            '✅ Servicio Completado',
            `Tu servicio "${appointment.service_name}" con ${appointment.client_name} ha sido completado exitosamente.`,
            { type: 'appointment', appointment_id: String(appointmentId) }
          );
        } catch (pushErr) {
          Logger.error(MODULE, 'Error sending push notification', pushErr as any);
        }
        
        return res.json({ 
          success: true, 
          message: 'Servicio verificado exitosamente',
          appointment: {
            id: appointmentId,
            status: 'completed',
            completed_at: new Date()
          }
        });
        
      } else {
        Logger.error(MODULE, '❌ CÓDIGO INCORRECTO');
        
        // Incrementar intentos fallidos
        const newAttempts = appointment.verification_attempts + 1;
        await pool.execute(
          'UPDATE appointments SET verification_attempts = ? WHERE id = ?',
          [newAttempts, appointmentId]
        );
        
        // Registrar intento en tabla de auditoría (si existe)
        try {
          await pool.execute(
            `INSERT INTO verification_attempts 
             (appointment_id, provider_id, code_attempted, success, ip_address)
             VALUES (?, ?, ?, FALSE, ?)`,
            [appointmentId, user.id, inputCode, req.ip || 'unknown']
          );
        } catch (auditErr) {
          // Tabla de auditoría puede no existir aún
          Logger.warn(MODULE, 'Could not log verification attempt (table may not exist)');
        }
        
        const remainingAttempts = 3 - newAttempts;
        
        Logger.warn(MODULE, `⚠️ Intentos restantes: ${remainingAttempts}`);
        
        return res.status(400).json({ 
          success: false, 
          error: `Código incorrecto. Intentos restantes: ${remainingAttempts}`,
          remainingAttempts
        });
      }
      
    } catch (err) {
      Logger.error(MODULE, '🔴 Error verificando código', err as any);
      return res.status(500).json({ 
        success: false, 
        error: 'Error al verificar código' 
      });
    }
  });

  /**
   * GET /appointments/:id/verification-code
   * Obtiene el código de verificación de una cita (solo el cliente)
   */
  router.get('/appointments/:id/verification-code', authenticateToken, async (req: Request, res: Response) => {
    try {
      const user = (req as any).user || {};
      const appointmentId = Number(req.params.id);
      
      Logger.info(MODULE, `🔐 Cliente ${user.id} solicitando código para cita ${appointmentId}`);
      
      const pool = DatabaseConnection.getPool();
      const [rows] = await pool.query(
        `SELECT verification_code, code_generated_at, status
         FROM appointments 
         WHERE id = ? AND client_id = ? AND verification_code IS NOT NULL
         LIMIT 1`,
        [appointmentId, user.id]
      );
      
      if ((rows as any[]).length === 0) {
        Logger.warn(MODULE, '❌ Código no disponible (cita no existe, no pertenece al cliente, o no tiene código)');
        return res.status(404).json({ 
          success: false, 
          error: 'Código no disponible. Verifica que la cita haya sido pagada.' 
        });
      }
      
      const { verification_code, code_generated_at, status } = (rows as any[])[0];
      
      Logger.info(MODULE, `✅ Código obtenido: ${verification_code} (generado: ${code_generated_at})`);
      
      return res.json({ 
        success: true, 
        code: verification_code,
        generated_at: code_generated_at,
        status
      });
      
    } catch (err) {
      Logger.error(MODULE, 'Error obteniendo código', err as any);
      return res.status(500).json({ 
        success: false, 
        error: 'Error al obtener código' 
      });
    }
  });

  /**
   * GET /provider/appointments/paid
   * Lista citas pagadas del proveedor (esperando verificación)
   */
  router.get('/provider/appointments/paid', authenticateToken, async (req: Request, res: Response) => {
    try {
      const user = (req as any).user || {};
      
      Logger.info(MODULE, `💰 Proveedor ${user.id} solicitando citas pagadas`);
      
      const pool = DatabaseConnection.getPool();
      
      // Verificar existencia de columnas para compatibilidad con DB antigua
      let hasVerificationCode = true;
      let hasPaymentMethodCol = true;
      let hasCashVerifiedAt = true;
      let hasVerifiedAt = true;
      try {
        const [col]: any = await pool.query(
          `SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'appointments' AND COLUMN_NAME = 'verification_code' LIMIT 1`
        );
        hasVerificationCode = Array.isArray(col) ? col.length > 0 : !!col;
      } catch {}
      try {
        const [col2]: any = await pool.query(
          `SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'appointments' AND COLUMN_NAME = 'payment_method' LIMIT 1`
        );
        hasPaymentMethodCol = Array.isArray(col2) ? col2.length > 0 : !!col2;
      } catch {}
      try {
        const [col3]: any = await pool.query(
          `SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'appointments' AND COLUMN_NAME = 'cash_verified_at' LIMIT 1`
        );
        hasCashVerifiedAt = Array.isArray(col3) ? col3.length > 0 : !!col3;
      } catch {}
      try {
        const [col4]: any = await pool.query(
          `SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'appointments' AND COLUMN_NAME = 'verified_at' LIMIT 1`
        );
        hasVerifiedAt = Array.isArray(col4) ? col4.length > 0 : !!col4;
      } catch {}

      // Citas candidatas: (tienen código no vacío) OR (marcadas como cash)
      const verifParts: string[] = [];
      if (hasVerificationCode) verifParts.push(`(a.verification_code IS NOT NULL AND a.verification_code <> '')`);
      if (hasPaymentMethodCol) verifParts.push(`a.payment_method = 'cash'`);
      const verifFilter = verifParts.length ? `AND (${verifParts.join(' OR ')})` : '';
      const cashNotVerifiedFilter = hasCashVerifiedAt ? `AND a.cash_verified_at IS NULL` : '';
      const codeNotVerifiedFilter = hasVerifiedAt ? `AND a.verified_at IS NULL` : '';

      const sql = `SELECT a.*, 
              (SELECT name FROM users WHERE id = a.client_id) AS client_name,
              (SELECT email FROM users WHERE id = a.client_id) AS client_email,
              (SELECT name FROM provider_services WHERE id = a.service_id) AS service_name,
              COALESCE(pc.payment_method, a.payment_method) AS payment_method,
              pc.id AS payment_id,
              pc.amount,
              pc.status AS payment_status,
              pc.payment_method AS payment_src_method,
              pc.paid_at,
              pc.can_release,
              pc.released_at
        FROM appointments a
        LEFT JOIN payments pc ON pc.appointment_id = a.id AND pc.status = 'completed'
        WHERE a.provider_id = ?
          AND a.status IN ('confirmed', 'scheduled', 'in_progress', 'completed')
          ${verifFilter}
          ${cashNotVerifiedFilter}
          ${codeNotVerifiedFilter}
          AND (
            pc.id IS NULL
            OR (
              pc.payment_method = 'card'
              AND (pc.release_status IS NULL OR pc.release_status <> 'released')
              AND a.verified_at IS NULL
            )
          )
        ORDER BY a.\`date\` ASC, a.\`start_time\` ASC`;

      Logger.info(MODULE, '[PAID_AWAITING] Query flags', {
        providerId: user.id,
        hasVerificationCode,
        hasPaymentMethodCol,
        hasCashVerifiedAt,
        hasVerifiedAt,
        verifFilter,
        cashNotVerifiedFilter,
        codeNotVerifiedFilter
      });
      Logger.info(MODULE, '[PAID_AWAITING] SQL', sql);

      const [rows] = await pool.query(sql, [user.id]);
      try {
        const sample = (rows as any[]).slice(0, 3).map(r => ({
          id: r.id,
          date: r.date,
          start_time: r.start_time,
          verification_code: r.verification_code,
          payment_method: r.payment_method,
          payment_src_method: (r as any).payment_src_method,
          cash_verified_at: r.cash_verified_at
        }));
        Logger.info(MODULE, '[PAID_AWAITING] Result', { count: (rows as any[]).length, sample });
      } catch {}
      
      Logger.info(MODULE, `✅ ${(rows as any[]).length} citas pagadas encontradas`);
      
      return res.json({ 
        success: true, 
        appointments: rows 
      });
      
    } catch (err) {
      Logger.error(MODULE, 'Error listando citas pagadas', err as any);
      return res.status(500).json({ 
        success: false, 
        error: 'Error al listar citas pagadas' 
      });
    }
  });

  /**
   * GET /provider/appointments/pending-requests
   * Lista citas confirmadas sin pagar del proveedor (solicitudes pendientes)
   */
  router.get('/provider/appointments/pending-requests', authenticateToken, async (req: Request, res: Response) => {
    try {
      const user = (req as any).user || {};
      
      console.log('[APPOINTMENTS] 🎯 GET /provider/appointments/pending-requests para provider:', user.id);
      Logger.info(MODULE, `⏳ Proveedor ${user.id} solicitando citas confirmadas sin pagar`);
      
      const pool = DatabaseConnection.getPool();
      
      const [rows] = await pool.query(
        `SELECT a.*, 
                (SELECT name FROM users WHERE id = a.client_id) AS client_name,
                (SELECT email FROM users WHERE id = a.client_id) AS client_email,
                (SELECT name FROM provider_services WHERE id = a.service_id) AS service_name,
                a.price AS scheduled_price,
                (SELECT p.status FROM payments p WHERE p.appointment_id = a.id ORDER BY p.id DESC LIMIT 1) AS payment_status
         FROM appointments a
         WHERE a.provider_id = ? 
           AND a.status = 'confirmed'
           AND NOT EXISTS (
             SELECT 1 FROM payments p 
             WHERE p.appointment_id = a.id 
             AND p.status = 'completed'
           )
         ORDER BY a.date ASC, a.start_time ASC`,
        [user.id]
      );
      
      console.log('[APPOINTMENTS] 📋 Citas confirmadas sin pagar encontradas:', (rows as any[]).length);
      Logger.info(MODULE, `✅ ${(rows as any[]).length} citas confirmadas sin pagar encontradas`);
      
      res.setHeader('Cache-Control', 'no-store');
      return res.json({ 
        success: true, 
        appointments: rows 
      });
      
    } catch (err) {
      console.error('[APPOINTMENTS] ❌ Error listando citas confirmadas sin pagar:', err);
      Logger.error(MODULE, 'Error listando citas confirmadas sin pagar', err as any);
      return res.status(500).json({ 
        success: false, 
        error: 'Error al listar citas confirmadas sin pagar' 
      });
    }
  });

  /**
   * GET /provider/appointments/next
   * Obtiene la próxima cita confirmada del proveedor
   */
  router.get('/provider/appointments/next', authenticateToken, async (req: Request, res: Response) => {
    try {
      const user = (req as any).user || {};
      
      console.log('[APPOINTMENTS] 🎯 GET /provider/appointments/next para provider:', user.id);
      Logger.info(MODULE, `➡️ Proveedor ${user.id} solicitando próxima cita confirmada`);
      
      const pool = DatabaseConnection.getPool();
      
      const [rows] = await pool.query(
        `SELECT a.*, 
                (SELECT name FROM users WHERE id = a.client_id) AS client_name,
                (SELECT email FROM users WHERE id = a.client_id) AS client_email,
                (SELECT name FROM provider_services WHERE id = a.service_id) AS service_name,
                a.price AS scheduled_price
         FROM appointments a
         WHERE a.provider_id = ? 
           AND a.status = 'confirmed'
           AND a.date >= CURDATE()
         ORDER BY a.date ASC, a.start_time ASC
         LIMIT 1`,
        [user.id]
      );
      
      const nextAppointment = (rows as any[])[0] || null;
      console.log('[APPOINTMENTS] 📅 Próxima cita encontrada:', nextAppointment ? nextAppointment.id : 'ninguna');
      Logger.info(MODULE, `✅ Próxima cita encontrada: ${nextAppointment ? nextAppointment.id : 'ninguna'}`);
      
      res.setHeader('Cache-Control', 'no-store');
      return res.json({ 
        success: true, 
        appointment: nextAppointment 
      });
      
    } catch (err) {
      console.error('[APPOINTMENTS] ❌ Error obteniendo próxima cita:', err);
      Logger.error(MODULE, 'Error obteniendo próxima cita', err as any);
      return res.status(500).json({ 
        success: false, 
        error: 'Error al obtener próxima cita' 
      });
    }
  });

  return router;
}

/**
 * Setup function to mount appointments routes
 */
export function setupAppointmentsModule(app: Express) {
  app.use('/', buildRouter());
  Logger.info(MODULE, 'Appointments routes mounted');
}

