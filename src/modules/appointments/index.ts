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
import { validateCodeFormat, compareVerificationCodes, sanitizeCode } from '../../shared/utils/verification-code.util';

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
                (SELECT p.status FROM payments p WHERE p.appointment_id = a.id ORDER BY p.id DESC LIMIT 1) AS payment_status
         FROM appointments a
         WHERE a.client_id = ?
         ORDER BY a.\`date\` ASC, a.\`start_time\` ASC`,
        [clientId]
      );
      Logger.info(MODULE, `Client appointments loaded: ${(rows as any[]).length} appointments`, { sample: (rows as any[])[0] });
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
        
        // Permitir liberación de fondos en payments
        await pool.execute(
          `UPDATE payments 
           SET can_release = TRUE
           WHERE appointment_id = ?`,
          [appointmentId]
        );
        
        Logger.info(MODULE, '✅ Cita marcada como completada y fondos liberables');
        
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
      
      const [rows] = await pool.query(
        `SELECT a.*, 
                (SELECT name FROM users WHERE id = a.client_id) AS client_name,
                (SELECT email FROM users WHERE id = a.client_id) AS client_email,
                (SELECT name FROM provider_services WHERE id = a.service_id) AS service_name,
                p.id AS payment_id,
                p.amount, 
                p.status AS payment_status, 
                p.paid_at, 
                p.can_release,
                p.released_at
         FROM appointments a
         INNER JOIN payments p ON p.appointment_id = a.id
         WHERE a.provider_id = ? 
           AND p.status = 'completed'
           AND a.status IN ('confirmed', 'scheduled', 'in_progress')
           AND a.verification_code IS NOT NULL
         ORDER BY a.date ASC, a.start_time ASC`,
        [user.id]
      );
      
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

  return router;
}

/**
 * Setup function to mount appointments routes
 */
export function setupAppointmentsModule(app: Express) {
  app.use('/', buildRouter());
  Logger.info(MODULE, 'Appointments routes mounted');
}

