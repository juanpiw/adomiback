import { Router, Request, Response } from 'express';
import DatabaseConnection from '../../../shared/database/connection';
import { JWTUtil } from '../../../shared/utils/jwt.util';

interface AuthUser {
  id: number;
  email: string;
  role: 'client' | 'provider';
}

function authenticateToken(req: Request, res: Response, next: () => void) {
  const token = JWTUtil.extractTokenFromHeader(req.headers.authorization);
  if (!token) {
    return res.status(401).json({ success: false, error: 'Unauthorized' });
  }
  const payload = JWTUtil.verifyAccessToken(token);
  if (!payload) {
    return res.status(401).json({ success: false, error: 'Invalid token' });
  }
  (req as any).user = {
    id: payload.userId,
    email: payload.email,
    role: payload.role
  } as AuthUser;
  next();
}

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
  }
}


