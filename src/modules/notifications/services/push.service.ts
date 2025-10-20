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

  static async notifyUser(userId: number, title: string, body: string, data?: Record<string, string>): Promise<void> {
    console.log('🟡 [PUSH_SERVICE] ==================== NOTIFY USER ====================');
    console.log('🟡 [PUSH_SERVICE] Timestamp:', new Date().toISOString());
    console.log('🟡 [PUSH_SERVICE] User ID:', userId);
    console.log('🟡 [PUSH_SERVICE] Title:', title);
    console.log('🟡 [PUSH_SERVICE] Body:', body);
    console.log('🟡 [PUSH_SERVICE] Data:', JSON.stringify(data));
    
    // Crear notificación in-app primero
    console.log('🟡 [PUSH_SERVICE] Creando notificación in-app...');
    await this.createInAppNotification(userId, title, body, data);
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
        data: data || {},
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
}


