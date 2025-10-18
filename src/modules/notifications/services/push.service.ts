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
    initFirebaseAdminIfPossible();
    if (!admin) return;
    const pool = DatabaseConnection.getPool();
    try {
      const [rows] = await pool.query('SELECT token FROM device_tokens WHERE user_id = ?', [userId]);
      const tokens = (rows as any[]).map(r => String(r.token)).filter(Boolean);
      if (tokens.length === 0) return;
      const message = {
        notification: { title, body },
        data: data || {},
        tokens
      };
      const resp = await admin.messaging().sendMulticast(message);
      Logger.info(MODULE, `Push sent: success ${resp.successCount} / failure ${resp.failureCount}`);
    } catch (err) {
      Logger.error(MODULE, 'Error sending push', err as any);
    }
  }
}


