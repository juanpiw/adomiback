import { Router, Request, Response } from 'express';
import DatabaseConnection from '../../../shared/database/connection';
import { authenticateToken, AuthUser } from '../../../shared/middleware/auth.middleware';

// Use shared authenticateToken which re-hydrates role from DB

const CREATE_NOTIFICATION_PREFS_TABLE_SQL = `
CREATE TABLE IF NOT EXISTS notification_preferences (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL UNIQUE,
  email_notifications BOOLEAN DEFAULT TRUE,
  push_notifications BOOLEAN DEFAULT TRUE,
  sms_notifications BOOLEAN DEFAULT FALSE,
  marketing_emails BOOLEAN DEFAULT FALSE,
  appointment_reminders BOOLEAN DEFAULT TRUE,
  payment_notifications BOOLEAN DEFAULT TRUE,
  review_notifications BOOLEAN DEFAULT TRUE,
  chat_notifications BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  INDEX idx_user (user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
`;

export class ClientRoutes {
  private router: Router;

  constructor() {
    this.router = Router();
    this.mountRoutes();
  }

  getRouter(): Router {
    return this.router;
  }

  private mountRoutes() {
    // GET /profile/validate - Endpoint genérico para validar perfiles de clientes y providers
    this.router.get('/profile/validate', authenticateToken, async (req: Request, res: Response) => {
      try {
        const user = (req as any).user as AuthUser;
        const pool = DatabaseConnection.getPool();
        console.log('[PROFILE_VALIDATE] Validando perfil para usuario:', user.id, 'rol:', user.role);

        if (user.role === 'client') {
          // Validar perfil de cliente
          const [rows] = await pool.query(
            `SELECT full_name, phone, address, commune, region FROM client_profiles WHERE client_id = ?`,
            [user.id]
          );
          const profile = (rows as any[])[0];

          const missingFields: string[] = [];
          if (!profile || !profile.full_name || !String(profile.full_name).trim()) missingFields.push('Nombre completo');
          if (!profile || !profile.phone || !String(profile.phone).trim()) missingFields.push('Teléfono de contacto');
          if (!profile || !profile.address || !String(profile.address).trim()) missingFields.push('Dirección principal');
          if (!profile || !profile.commune || !String(profile.commune).trim()) missingFields.push('Comuna');
          if (!profile || !profile.region || !String(profile.region).trim()) missingFields.push('Región');

          const isComplete = missingFields.length === 0;
          console.log('[PROFILE_VALIDATE] Cliente - perfil completo:', isComplete, 'campos faltantes:', missingFields);
          return res.status(200).json({ 
            success: true, 
            isComplete, 
            missingFields, 
            userType: user.role, 
            message: isComplete ? 'Perfil completo' : 'Por favor completa tu perfil para continuar' 
          });
          
        } else if (user.role === 'provider') {
          // Validar perfil de provider
          const [rows] = await pool.query(
            `SELECT business_name, phone, address, commune, region, services FROM provider_profiles WHERE provider_id = ?`,
            [user.id]
          );
          const profile = (rows as any[])[0];

          const missingFields: string[] = [];
          if (!profile || !profile.business_name || !String(profile.business_name).trim()) missingFields.push('Nombre del negocio');
          if (!profile || !profile.phone || !String(profile.phone).trim()) missingFields.push('Teléfono de contacto');
          if (!profile || !profile.address || !String(profile.address).trim()) missingFields.push('Dirección del negocio');
          if (!profile || !profile.commune || !String(profile.commune).trim()) missingFields.push('Comuna');
          if (!profile || !profile.region || !String(profile.region).trim()) missingFields.push('Región');
          if (!profile || !profile.services || !String(profile.services).trim()) missingFields.push('Servicios ofrecidos');

          const isComplete = missingFields.length === 0;
          console.log('[PROFILE_VALIDATE] Provider - perfil completo:', isComplete, 'campos faltantes:', missingFields);
          return res.status(200).json({ 
            success: true, 
            isComplete, 
            missingFields, 
            userType: user.role, 
            message: isComplete ? 'Perfil completo' : 'Por favor completa tu perfil para continuar' 
          });
          
        } else {
          return res.status(400).json({ success: false, error: 'Rol de usuario no válido' });
        }
        
      } catch (error: any) {
        console.error('[PROFILE_VALIDATE] Error:', error);
        return res.status(500).json({ success: false, error: 'Error al validar perfil', details: error.message });
      }
    });

    // GET /client/profile
    this.router.get('/client/profile', authenticateToken, async (req: Request, res: Response) => {
      try {
        const user = (req as any).user as AuthUser;
        if (user.role !== 'client') {
          return res.status(403).json({ success: false, error: 'Solo clientes pueden acceder a este endpoint' });
        }

        const pool = DatabaseConnection.getPool();
        const [rows] = await pool.query(
          `SELECT client_id, full_name, phone, profile_photo_url, address, commune, region, preferred_language, created_at, updated_at
           FROM client_profiles WHERE client_id = ?`,
          [user.id]
        );

        const profile = (rows as any[])[0];
        if (!profile) {
          return res.status(200).json({
            success: true,
            profile: {
              client_id: user.id,
              full_name: '',
              phone: '',
              profile_photo_url: null,
              address: '',
              commune: '',
              region: '',
              preferred_language: 'es',
              created_at: null,
              updated_at: null
            }
          });
        }

        return res.status(200).json({ success: true, profile });
      } catch (error: any) {
        console.error('[CLIENT][GET PROFILE] Error:', error);
        return res.status(500).json({ success: false, error: 'Error al obtener perfil' });
      }
    });

    // POST /client/profile
    this.router.post('/client/profile', authenticateToken, async (req: Request, res: Response) => {
      try {
        const user = (req as any).user as AuthUser;
        if (user.role !== 'client') {
          return res.status(403).json({ success: false, error: 'Solo clientes pueden acceder a este endpoint' });
        }

        const { full_name, phone, address, commune, region, preferred_language, notes, profile_photo_url } = req.body || {};

        if (!full_name || !phone || !address || !commune || !region) {
          return res.status(400).json({ success: false, error: 'Campos requeridos: full_name, phone, address, commune, region' });
        }

        const pool = DatabaseConnection.getPool();

        // Detectar si existe la columna notes para compatibilidad con esquemas antiguos
        const [notesColRows] = await pool.query(`SHOW COLUMNS FROM client_profiles LIKE 'notes'`);
        const hasNotesColumn = (notesColRows as any[]).length > 0;

        // comprobar existencia
        const [existsRows] = await pool.query('SELECT client_id FROM client_profiles WHERE client_id = ?', [user.id]);
        const exists = (existsRows as any[]).length > 0;

        if (exists) {
          if (hasNotesColumn) {
            await pool.query(
              `UPDATE client_profiles SET full_name=?, phone=?, profile_photo_url=?, address=?, commune=?, region=?, preferred_language=?, notes=?, updated_at=CURRENT_TIMESTAMP WHERE client_id=?`,
              [full_name, phone, profile_photo_url || null, address, commune, region, preferred_language || 'es', notes || null, user.id]
            );
          } else {
            await pool.query(
              `UPDATE client_profiles SET full_name=?, phone=?, profile_photo_url=?, address=?, commune=?, region=?, preferred_language=?, updated_at=CURRENT_TIMESTAMP WHERE client_id=?`,
              [full_name, phone, profile_photo_url || null, address, commune, region, preferred_language || 'es', user.id]
            );
          }
        } else {
          if (hasNotesColumn) {
            await pool.query(
              `INSERT INTO client_profiles (client_id, full_name, phone, profile_photo_url, address, commune, region, preferred_language, notes)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
              [user.id, full_name, phone, profile_photo_url || null, address, commune, region, preferred_language || 'es', notes || null]
            );
          } else {
            await pool.query(
              `INSERT INTO client_profiles (client_id, full_name, phone, profile_photo_url, address, commune, region, preferred_language)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
              [user.id, full_name, phone, profile_photo_url || null, address, commune, region, preferred_language || 'es']
            );
          }
        }

        const [rows] = await pool.query(
          hasNotesColumn
            ? `SELECT client_id, full_name, phone, profile_photo_url, address, commune, region, preferred_language, notes, created_at, updated_at FROM client_profiles WHERE client_id = ?`
            : `SELECT client_id, full_name, phone, profile_photo_url, address, commune, region, preferred_language, created_at, updated_at FROM client_profiles WHERE client_id = ?`,
          [user.id]
        );

        const profile = (rows as any[])[0];
        return res.status(200).json({ success: true, profile, message: exists ? 'Perfil actualizado exitosamente' : 'Perfil creado exitosamente' });
      } catch (error: any) {
        console.error('[CLIENT][SAVE PROFILE] Error:', error);
        return res.status(500).json({ success: false, error: 'Error al guardar perfil', details: error.message });
      }
    });

    // GET /client/payment-preference
    this.router.get('/client/payment-preference', authenticateToken, async (req: Request, res: Response) => {
      try {
        const user = (req as any).user as AuthUser;
        if (user.role !== 'client') {
          return res.status(403).json({ success: false, error: 'Solo clientes pueden acceder a este endpoint' });
        }

        const pool = DatabaseConnection.getPool();
        // Verificar si existe la columna
        const [colRows] = await pool.query(`SHOW COLUMNS FROM client_profiles LIKE 'payment_method_pref'`);
        const hasCol = (colRows as any[]).length > 0;
        if (!hasCol) return res.status(200).json({ success: true, preference: null });

        const [[row]]: any = await pool.query(
          `SELECT payment_method_pref FROM client_profiles WHERE client_id = ? LIMIT 1`,
          [user.id]
        );
        return res.status(200).json({ success: true, preference: row?.payment_method_pref || null });
      } catch (error: any) {
        return res.status(500).json({ success: false, error: 'Error al obtener preferencia de pago', details: error.message });
      }
    });

    // PUT /client/payment-preference
    this.router.put('/client/payment-preference', authenticateToken, async (req: Request, res: Response) => {
      try {
        const user = (req as any).user as AuthUser;
        if (user.role !== 'client') {
          return res.status(403).json({ success: false, error: 'Solo clientes pueden acceder a este endpoint' });
        }

        const pref = String((req.body || {}).payment_method_pref || '').trim();
        if (!['card', 'cash'].includes(pref)) {
          return res.status(400).json({ success: false, error: 'payment_method_pref inválido (card|cash)' });
        }

        const pool = DatabaseConnection.getPool();
        // Asegurar existencia de la columna; si no existe, intentar crearla de forma segura
        try {
          const [colRows] = await pool.query(`SHOW COLUMNS FROM client_profiles LIKE 'payment_method_pref'`);
          const hasCol = (colRows as any[]).length > 0;
          if (!hasCol) {
            await pool.query(`ALTER TABLE client_profiles ADD COLUMN payment_method_pref ENUM('card','cash') NULL AFTER preferred_language`);
          }
        } catch {}

        // Asegurar fila en client_profiles
        const [existsRows]: any = await pool.query('SELECT client_id FROM client_profiles WHERE client_id = ? LIMIT 1', [user.id]);
        if (existsRows.length === 0) {
          await pool.query(
            `INSERT INTO client_profiles (client_id, full_name, phone, address, commune, region, preferred_language, payment_method_pref)
             VALUES (?, '', '', '', '', '', 'es', ?)`,
            [user.id, pref]
          );
        } else {
          await pool.query(
            `UPDATE client_profiles SET payment_method_pref = ? , updated_at = CURRENT_TIMESTAMP WHERE client_id = ?`,
            [pref, user.id]
          );
        }

        return res.status(200).json({ success: true, preference: pref });
      } catch (error: any) {
        return res.status(500).json({ success: false, error: 'Error al guardar preferencia de pago', details: error.message });
      }
    });

    // GET /client/notification-preferences
    this.router.get('/client/notification-preferences', authenticateToken, async (req: Request, res: Response) => {
      try {
        const user = (req as any).user as AuthUser;
        const pool = DatabaseConnection.getPool();

        // Garantizar tabla
        try {
          await pool.query(CREATE_NOTIFICATION_PREFS_TABLE_SQL);
        } catch (e) {
          console.warn('[CLIENT][NOTIFICATION_PREFS] No se pudo asegurar la tabla notification_preferences', e);
        }

        const [rows]: any = await pool.query(
          `SELECT push_notifications, marketing_emails
             FROM notification_preferences
            WHERE user_id = ?
            LIMIT 1`,
          [user.id]
        );

        const row = rows?.[0] || null;
        const preferences = {
          pushNotifications: row?.push_notifications !== undefined ? !!row.push_notifications : true,
          promotionalEmails: row?.marketing_emails !== undefined ? !!row.marketing_emails : false
        };

        return res.status(200).json({
          success: true,
          preferences
        });
      } catch (error: any) {
        console.error('[CLIENT][GET NOTIFICATION PREFS] Error:', error);
        return res.status(500).json({ success: false, error: 'Error al obtener preferencias de notificación' });
      }
    });

    // PUT /client/notification-preferences
    this.router.put('/client/notification-preferences', authenticateToken, async (req: Request, res: Response) => {
      try {
        const user = (req as any).user as AuthUser;
        const pool = DatabaseConnection.getPool();

        try {
          await pool.query(CREATE_NOTIFICATION_PREFS_TABLE_SQL);
        } catch (e) {
          console.warn('[CLIENT][NOTIFICATION_PREFS] No se pudo asegurar la tabla notification_preferences', e);
        }

        const body = req.body || {};
        const pushNotifications = typeof body.pushNotifications === 'boolean' ? body.pushNotifications : undefined;
        const promotionalEmails = typeof body.promotionalEmails === 'boolean' ? body.promotionalEmails : undefined;

        if (pushNotifications === undefined && promotionalEmails === undefined) {
          return res.status(400).json({ success: false, error: 'Debes enviar al menos una preferencia a actualizar' });
        }

        const [existsRows]: any = await pool.query(
          `SELECT id FROM notification_preferences WHERE user_id = ? LIMIT 1`,
          [user.id]
        );
        const exists = existsRows.length > 0;

        if (exists) {
          const updateFields: string[] = [];
          const values: any[] = [];

          if (pushNotifications !== undefined) {
            updateFields.push('push_notifications = ?');
            values.push(pushNotifications);
          }
          if (promotionalEmails !== undefined) {
            updateFields.push('marketing_emails = ?');
            values.push(promotionalEmails);
          }
          updateFields.push('updated_at = CURRENT_TIMESTAMP');
          values.push(user.id);

          await pool.query(
            `UPDATE notification_preferences
                SET ${updateFields.join(', ')}
              WHERE user_id = ?`,
            values
          );
        } else {
          await pool.query(
            `INSERT INTO notification_preferences (user_id, push_notifications, marketing_emails)
             VALUES (?, ?, ?)
             ON DUPLICATE KEY UPDATE
               push_notifications = VALUES(push_notifications),
               marketing_emails = VALUES(marketing_emails),
               updated_at = CURRENT_TIMESTAMP`,
            [
              user.id,
              pushNotifications !== undefined ? pushNotifications : true,
              promotionalEmails !== undefined ? promotionalEmails : false
            ]
          );
        }

        const [rows]: any = await pool.query(
          `SELECT push_notifications, marketing_emails
             FROM notification_preferences
            WHERE user_id = ?
            LIMIT 1`,
          [user.id]
        );
        const row = rows?.[0] || null;

        return res.status(200).json({
          success: true,
          preferences: {
            pushNotifications: row?.push_notifications !== undefined ? !!row.push_notifications : true,
            promotionalEmails: row?.marketing_emails !== undefined ? !!row.marketing_emails : false
          }
        });
      } catch (error: any) {
        console.error('[CLIENT][UPDATE NOTIFICATION PREFS] Error:', error);
        return res.status(500).json({ success: false, error: 'Error al guardar preferencias de notificación' });
      }
    });

    // GET /client/payments/history
    this.router.get('/client/payments/history', authenticateToken, async (req: Request, res: Response) => {
      try {
        const user = (req as any).user as AuthUser;
        const pool = DatabaseConnection.getPool();

        const limit = Math.min(100, Math.max(1, parseInt(String(req.query.limit ?? ''), 10) || 20));
        const offset = Math.max(0, parseInt(String(req.query.offset ?? ''), 10) || 0);

        const [tableRows]: any = await pool.query(`SHOW TABLES LIKE 'payments'`);
        if (!tableRows?.length) {
          return res.status(200).json({ success: true, transactions: [], pagination: { total: 0, limit, offset } });
        }

        const [rows]: any = await pool.query(
          `SELECT 
             p.id,
             p.appointment_id,
             p.amount,
             p.commission_amount,
             p.provider_amount,
             p.currency,
             p.payment_method,
             p.status,
             p.paid_at,
             p.created_at,
             a.appointment_date,
             a.start_time,
             ps.name AS service_name,
             pp.full_name AS provider_name
           FROM payments p
           LEFT JOIN appointments a ON a.id = p.appointment_id
           LEFT JOIN provider_services ps ON ps.id = a.service_id
           LEFT JOIN provider_profiles pp ON pp.provider_id = p.provider_id
           WHERE p.client_id = ?
           ORDER BY COALESCE(p.paid_at, p.created_at) DESC
           LIMIT ?
           OFFSET ?`,
          [user.id, limit, offset]
        );

        const [[{ total }]]: any = await pool.query(
          `SELECT COUNT(*) AS total FROM payments WHERE client_id = ?`,
          [user.id]
        );

        const transactions = rows.map((row: any) => ({
          id: row.id,
          appointmentId: row.appointment_id,
          service: row.service_name || 'Servicio reservado',
          providerName: row.provider_name || null,
          amount: Number(row.amount || 0),
          commissionAmount: Number(row.commission_amount || 0),
          providerAmount: Number(row.provider_amount || 0),
          currency: row.currency || 'CLP',
          paymentMethod: row.payment_method || 'card',
          status: row.status || 'pending',
          paidAt: row.paid_at || row.created_at,
          appointmentDate: row.appointment_date || null,
          appointmentTime: row.start_time || null
        }));

        return res.status(200).json({
          success: true,
          transactions,
          pagination: {
            total: Number(total || 0),
            limit,
            offset
          }
        });
      } catch (error: any) {
        console.error('[CLIENT][PAYMENT HISTORY] Error:', error);
        return res.status(500).json({ success: false, error: 'Error al obtener historial de pagos' });
      }
    });

    // GET /client/wallet/summary
    this.router.get('/client/wallet/summary', authenticateToken, async (req: Request, res: Response) => {
      try {
        const user = (req as any).user as AuthUser;
        const pool = DatabaseConnection.getPool();

        const [[summaryRow]]: any = await pool.query(
          `SELECT balance, pending_balance, total_earned, total_withdrawn, currency, last_transaction_at
             FROM wallet_balance
            WHERE user_id = ?
            LIMIT 1`,
          [user.id]
        );

        const [[{ credit_count }]]: any = await pool.query(
          `SELECT COUNT(1) AS credit_count
             FROM transactions
            WHERE user_id = ?
              AND type = 'refund'`,
          [user.id]
        );

        return res.status(200).json({
          success: true,
          summary: {
            balance: Number(summaryRow?.balance ?? 0),
            pending_balance: Number(summaryRow?.pending_balance ?? 0),
            hold_balance: Number(summaryRow?.pending_balance ?? 0),
            total_received: Number(summaryRow?.total_earned ?? 0),
            total_spent: Number(summaryRow?.total_withdrawn ?? 0),
            credits_count: Number(credit_count ?? 0),
            currency: summaryRow?.currency || 'CLP',
            last_updated: summaryRow?.last_transaction_at || null,
            note: 'Tu saldo no expira y solo se genera por reembolsos y compensaciones.'
          }
        });
      } catch (error: any) {
        console.error('[CLIENT][WALLET SUMMARY] Error obteniendo saldo del cliente:', error);
        return res.status(500).json({ success: false, error: 'Error al obtener tu billetera' });
      }
    });

    // GET /client/wallet/movements
    this.router.get('/client/wallet/movements', authenticateToken, async (req: Request, res: Response) => {
      try {
        const user = (req as any).user as AuthUser;
        const pool = DatabaseConnection.getPool();

        const limit = Math.min(100, Math.max(1, Number.parseInt(String(req.query.limit ?? '50'), 10) || 50));
        const offset = Math.max(0, Number.parseInt(String(req.query.offset ?? '0'), 10) || 0);

        const [rows]: any = await pool.query(
          `SELECT
             id,
             type,
             amount,
             currency,
             description,
             appointment_id,
             created_at
           FROM transactions
           WHERE user_id = ?
             AND type IN ('refund','payment_sent')
           ORDER BY created_at DESC
           LIMIT ?
           OFFSET ?`,
          [user.id, limit, offset]
        );

        const [[{ total }]]: any = await pool.query(
          `SELECT COUNT(1) AS total
             FROM transactions
            WHERE user_id = ?
              AND type IN ('refund','payment_sent')`,
          [user.id]
        );

        const movements = rows.map((row: any) => {
          const movementType = String(row.type || '').toLowerCase();
          const kind = movementType === 'refund' ? 'credit' : 'debit';
          const baseTitle = movementType === 'refund' ? 'Reembolso de servicio' : 'Uso de saldo';

          return {
            id: row.id,
            type: kind,
            title: row.description || baseTitle,
            description: row.appointment_id ? `Cita #${row.appointment_id}` : null,
            amount: Number(row.amount ?? 0),
            currency: row.currency || 'CLP',
            created_at: row.created_at
          };
        });

        return res.status(200).json({
          success: true,
          movements,
          pagination: {
            total: Number(total || 0),
            limit,
            offset
          }
        });
      } catch (error: any) {
        console.error('[CLIENT][WALLET MOVEMENTS] Error obteniendo movimientos de billetera:', error);
        return res.status(500).json({ success: false, error: 'Error al obtener los movimientos de tu billetera' });
      }
    });
  }
}
