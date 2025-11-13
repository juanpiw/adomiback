import DatabaseConnection from '../../../shared/database/connection';
import { Logger } from '../../../shared/utils/logger.util';

let admin: any = null;
const MODULE = 'PUSH_SERVICE';

function initFirebaseAdminIfPossible() {
  if (admin) return;
  try {
    // Lazy require to avoid crash if not installed yet
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    admin = require('firebase-admin');
  } catch (err) {
    Logger.warn(MODULE, 'firebase-admin not installed; push disabled');
    return;
  }

  try {
    const projectId = process.env.FIREBASE_PROJECT_ID;
    const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
    let privateKey = process.env.FIREBASE_PRIVATE_KEY;
    if (privateKey && privateKey.includes('\\n')) privateKey = privateKey.replace(/\\n/g, '\n');

    if (!projectId || !clientEmail || !privateKey) {
      Logger.warn(MODULE, 'Missing Firebase service account env vars; push disabled');
      return;
    }

    const credential = admin.credential.cert({
      projectId,
      clientEmail,
      privateKey
    });
    if (!admin.apps || admin.apps.length === 0) {
      admin.initializeApp({ credential });
      Logger.info(MODULE, 'Firebase Admin initialized');
    }
  } catch (err) {
    Logger.error(MODULE, 'Error initializing Firebase Admin', err as any);
    admin = null;
  }
}

export class PushService {
  static async registerToken(userId: number, token: string, platform?: string): Promise<void> {
    const pool = DatabaseConnection.getPool();
    try {
      await pool.execute(
        `INSERT INTO device_tokens (user_id, token, platform, created_at, updated_at)
         VALUES (?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
         ON DUPLICATE KEY UPDATE platform = VALUES(platform), updated_at = CURRENT_TIMESTAMP`,
        [userId, token, platform || null]
      );
    } catch (err) {
      Logger.error(MODULE, 'Error registering token (table missing?)', err as any);
    }
  }

  static async removeToken(userId: number, token: string): Promise<void> {
    const pool = DatabaseConnection.getPool();
    try {
      await pool.execute('DELETE FROM device_tokens WHERE user_id = ? AND token = ?', [userId, token]);
    } catch (err) {
      Logger.error(MODULE, 'Error removing token', err as any);
    }
  }

  static async notifyUser(userId: number, title: string, body: string, data?: Record<string, string | number | boolean | null>): Promise<void> {
    console.log('🟡 [PUSH_SERVICE] ==================== NOTIFY USER ====================');
    console.log('🟡 [PUSH_SERVICE] Timestamp:', new Date().toISOString());
    console.log('🟡 [PUSH_SERVICE] User ID:', userId);
    console.log('🟡 [PUSH_SERVICE] Title:', title);
    console.log('🟡 [PUSH_SERVICE] Body:', body);
    console.log('🟡 [PUSH_SERVICE] Data (raw):', JSON.stringify(data));

    const enrichedData = await this.enrichNotificationData(data);
    const sanitizedData = this.sanitizeNotificationData(enrichedData);
    console.log('🟡 [PUSH_SERVICE] Data (enriched):', JSON.stringify(enrichedData));
    console.log('🟡 [PUSH_SERVICE] Data (sanitized):', JSON.stringify(sanitizedData));
    
    // Crear notificación in-app primero
    console.log('🟡 [PUSH_SERVICE] Creando notificación in-app...');
    await this.createInAppNotification(userId, title, body, sanitizedData);
    console.log('🟡 [PUSH_SERVICE] ✅ Notificación in-app creada');
    
    // Intentar enviar push notification
    console.log('🟡 [PUSH_SERVICE] Inicializando Firebase Admin...');
    initFirebaseAdminIfPossible();
    
    if (!admin) {
      console.error('🔴 [PUSH_SERVICE] ❌ Firebase NO está configurado');
      Logger.info(MODULE, 'Firebase not configured, skipping push notification');
      return;
    }
    
    console.log('🟡 [PUSH_SERVICE] ✅ Firebase Admin está disponible');
    
    const pool = DatabaseConnection.getPool();
    try {
      console.log('🟡 [PUSH_SERVICE] Buscando tokens de dispositivo para user:', userId);
      const [rows] = await pool.query('SELECT token FROM device_tokens WHERE user_id = ?', [userId]);
      const tokens = (rows as any[]).map(r => String(r.token)).filter(Boolean);
      
      console.log('🟡 [PUSH_SERVICE] Tokens encontrados:', tokens.length);
      console.log('🟡 [PUSH_SERVICE] Tokens:', tokens.map(t => t.substring(0, 20) + '...'));
      
      if (tokens.length === 0) {
        console.warn('⚠️ [PUSH_SERVICE] No hay tokens de dispositivo para el usuario', userId);
        Logger.info(MODULE, `No device tokens for user ${userId}`);
        return;
      }
      
      const message = {
        notification: { title, body },
        data: sanitizedData || {},
        tokens
      };
      
      console.log('🟡 [PUSH_SERVICE] Mensaje a enviar:', JSON.stringify(message, null, 2));
      console.log('🟡 [PUSH_SERVICE] Enviando push notification...');
      
      const resp = await admin.messaging().sendMulticast(message);
      
      console.log('🟡 [PUSH_SERVICE] ✅ Push enviado exitosamente');
      console.log('🟡 [PUSH_SERVICE] Success:', resp.successCount);
      console.log('🟡 [PUSH_SERVICE] Failures:', resp.failureCount);
      
      if (resp.failureCount > 0) {
        console.error('🔴 [PUSH_SERVICE] Detalles de errores:');
        resp.responses.forEach((r, i) => {
          if (!r.success) {
            console.error(`🔴 [PUSH_SERVICE] Token ${i}: ${r.error?.message}`);
          }
        });
      }
      
      Logger.info(MODULE, `Push sent: success ${resp.successCount} / failure ${resp.failureCount}`);
    } catch (err) {
      console.error('🔴 [PUSH_SERVICE] ❌ Error enviando push:', err);
      console.error('🔴 [PUSH_SERVICE] Error message:', (err as Error).message);
      console.error('🔴 [PUSH_SERVICE] Error stack:', (err as Error).stack);
      Logger.error(MODULE, 'Error sending push', err as any);
    }
  }

  /**
   * Crear notificación in-app (visible en la campana de notificaciones)
   */
  static async createInAppNotification(
    userId: number, 
    title: string, 
    body: string, 
    data?: Record<string, string>
  ): Promise<void> {
    const pool = DatabaseConnection.getPool();
    try {
      const type = data?.type || 'system';
      const dataJson = data ? JSON.stringify(data) : null;
      
      await pool.execute(
        `INSERT INTO notifications (user_id, type, title, body, message, data, is_read)
         VALUES (?, ?, ?, ?, ?, ?, FALSE)`,
        [userId, type, title, body, body, dataJson]
      );
      
      Logger.info(MODULE, `In-app notification created for user ${userId}: ${title}`);
    } catch (err) {
      Logger.error(MODULE, 'Error creating in-app notification', err as any);
    }
  }

  /**
   * Obtener notificaciones de un usuario
   */
  static async getUserNotifications(
    userId: number, 
    limit: number = 20, 
    offset: number = 0,
    unreadOnly: boolean = false
  ): Promise<any[]> {
    const pool = DatabaseConnection.getPool();
    try {
      let query = `
        SELECT id, type, title, body, data, is_read, created_at
        FROM notifications
        WHERE user_id = ?
      `;
      
      if (unreadOnly) {
        query += ' AND is_read = FALSE';
      }
      
      query += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';
      
      const [rows] = await pool.query(query, [userId, limit, offset]);
      return rows as any[];
    } catch (err) {
      Logger.error(MODULE, 'Error getting user notifications', err as any);
      return [];
    }
  }

  /**
   * Marcar notificación como leída
   */
  static async markAsRead(notificationId: number, userId: number): Promise<boolean> {
    const pool = DatabaseConnection.getPool();
    try {
      const [result] = await pool.execute(
        'UPDATE notifications SET is_read = TRUE WHERE id = ? AND user_id = ?',
        [notificationId, userId]
      );
      return (result as any).affectedRows > 0;
    } catch (err) {
      Logger.error(MODULE, 'Error marking notification as read', err as any);
      return false;
    }
  }

  /**
   * Marcar todas las notificaciones como leídas
   */
  static async markAllAsRead(userId: number): Promise<boolean> {
    const pool = DatabaseConnection.getPool();
    try {
      await pool.execute(
        'UPDATE notifications SET is_read = TRUE WHERE user_id = ? AND is_read = FALSE',
        [userId]
      );
      return true;
    } catch (err) {
      Logger.error(MODULE, 'Error marking all notifications as read', err as any);
      return false;
    }
  }

  /**
   * Obtener conteo de notificaciones no leídas
   */
  static async getUnreadCount(userId: number): Promise<number> {
    const pool = DatabaseConnection.getPool();
    try {
      const [rows] = await pool.query(
        'SELECT COUNT(*) as count FROM notifications WHERE user_id = ? AND is_read = FALSE',
        [userId]
      );
      return (rows as any[])[0]?.count || 0;
    } catch (err) {
      Logger.error(MODULE, 'Error getting unread count', err as any);
      return 0;
    }
  }

  private static async enrichNotificationData(
    data?: Record<string, string | number | boolean | null>
  ): Promise<Record<string, string | number | boolean | null> | undefined> {
    if (!data) {
      return undefined;
    }

    const enriched: Record<string, string | number | boolean | null> = { ...data };
    const rawAppointmentId =
      enriched.appointment_id ??
      enriched.appointmentId ??
      enriched.appointmentID ??
      enriched.appointment;

    if (rawAppointmentId === undefined || rawAppointmentId === null) {
      return enriched;
    }

    const appointmentId = Number(rawAppointmentId);
    if (!Number.isFinite(appointmentId) || appointmentId <= 0) {
      enriched.appointment_id = String(rawAppointmentId);
      enriched.appointmentId = String(rawAppointmentId);
      return enriched;
    }

    const pool = DatabaseConnection.getPool();
    try {
      const [[appointment]]: any = await pool.query(
        `SELECT id, date, start_time, end_time
           FROM appointments
          WHERE id = ?
          LIMIT 1`,
        [appointmentId]
      );

      if (appointment) {
        const dateStr = this.normalizeDateString(appointment.date);
        const startTimeStr = this.normalizeTimeString(appointment.start_time);
        const endTimeStr = this.normalizeTimeString(appointment.end_time);
        const localIso = this.buildLocalIsoString(dateStr, startTimeStr);
        const utcIso = localIso ? `${localIso}:00Z` : null;
        const formattedLabel = this.formatDisplayDate(dateStr, startTimeStr);

        if (dateStr) {
          enriched.appointment_date = dateStr;
          enriched.appointmentDate = dateStr;
          if (!enriched.date) {
            enriched.date = dateStr;
          }
        }
        if (startTimeStr) {
          enriched.appointment_time = startTimeStr;
          enriched.appointmentTime = startTimeStr;
          enriched.start_time = startTimeStr;
          enriched.startTime = startTimeStr;
        }
        if (endTimeStr) {
          enriched.end_time = endTimeStr;
          enriched.endTime = endTimeStr;
        }
        if (localIso) {
          enriched.appointment_datetime = localIso;
          enriched.appointmentDateTime = localIso;
        }
        if (utcIso) {
          enriched.appointment_datetime_iso = utcIso;
          enriched.appointmentDateTimeIso = utcIso;
        }
        if (formattedLabel) {
          enriched.appointment_formatted_date = formattedLabel;
          enriched.appointmentFormattedDate = formattedLabel;
          enriched.appointment_display_date = formattedLabel;
          enriched.appointmentDisplayDate = formattedLabel;
        }
      }
    } catch (err) {
      Logger.error(MODULE, 'Error enriching notification data with appointment info', err as any);
    }

    enriched.appointment_id = String(appointmentId);
    enriched.appointmentId = String(appointmentId);

    return enriched;
  }

  private static sanitizeNotificationData(
    data?: Record<string, string | number | boolean | null>
  ): Record<string, string> | undefined {
    if (!data) {
      return undefined;
    }
    const sanitized: Record<string, string> = {};
    for (const [key, value] of Object.entries(data)) {
      if (value === undefined || value === null) {
        continue;
      }
      sanitized[key] = typeof value === 'string' ? value : String(value);
    }
    return Object.keys(sanitized).length > 0 ? sanitized : undefined;
  }

  private static normalizeDateString(value: any): string | null {
    if (value === undefined || value === null) {
      return null;
    }
    if (value instanceof Date && !isNaN(value.getTime())) {
      return value.toISOString().slice(0, 10);
    }
    const raw = String(value).trim();
    if (!raw) {
      return null;
    }
    const match = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (match) {
      return `${match[1]}-${match[2]}-${match[3]}`;
    }
    const parsed = new Date(raw);
    if (!isNaN(parsed.getTime())) {
      return parsed.toISOString().slice(0, 10);
    }
    return null;
  }

  private static normalizeTimeString(value: any): string | null {
    if (value === undefined || value === null) {
      return null;
    }
    const raw = String(value).trim();
    if (!raw) {
      return null;
    }
    if (/^\d{2}:\d{2}(:\d{2})?$/.test(raw)) {
      return raw.slice(0, 5);
    }
    if (/^\d{4}$/.test(raw)) {
      return `${raw.slice(0, 2)}:${raw.slice(2)}`;
    }
    if (/^\d{1,2}$/.test(raw)) {
      return raw.padStart(2, '0') + ':00';
    }
    return null;
  }

  private static buildLocalIsoString(dateStr: string | null, timeStr: string | null): string | null {
    if (!dateStr) {
      return null;
    }
    const time = timeStr || '00:00';
    return `${dateStr}T${time}`;
  }

  private static formatDisplayDate(dateStr: string | null, timeStr: string | null): string | null {
    if (!dateStr) {
      return null;
    }
    const time = timeStr || '00:00';
    const isoWithSeconds = `${dateStr}T${time}:00`;
    const parsed = new Date(isoWithSeconds);
    if (isNaN(parsed.getTime())) {
      const fallback = new Date(`${dateStr}T00:00:00`);
      if (isNaN(fallback.getTime())) {
        return null;
      }
      return fallback.toLocaleDateString('es-CL', {
        weekday: 'long',
        day: 'numeric',
        month: 'long',
        year: 'numeric'
      });
    }
    return parsed.toLocaleDateString('es-CL', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric'
    });
  }
}


