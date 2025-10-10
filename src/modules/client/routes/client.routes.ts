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

        // comprobar existencia
        const [existsRows] = await pool.query('SELECT client_id FROM client_profiles WHERE client_id = ?', [user.id]);
        const exists = (existsRows as any[]).length > 0;

        if (exists) {
          await pool.query(
            `UPDATE client_profiles SET full_name=?, phone=?, profile_photo_url=?, address=?, commune=?, region=?, preferred_language=?, notes=?, updated_at=CURRENT_TIMESTAMP WHERE client_id=?`,
            [full_name, phone, profile_photo_url || null, address, commune, region, preferred_language || 'es', notes || null, user.id]
          );
        } else {
          await pool.query(
            `INSERT INTO client_profiles (client_id, full_name, phone, profile_photo_url, address, commune, region, preferred_language, notes)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [user.id, full_name, phone, profile_photo_url || null, address, commune, region, preferred_language || 'es', notes || null]
          );
        }

        const [rows] = await pool.query(
          `SELECT client_id, full_name, phone, profile_photo_url, address, commune, region, preferred_language, notes, created_at, updated_at
           FROM client_profiles WHERE client_id = ?`,
          [user.id]
        );

        const profile = (rows as any[])[0];
        return res.status(200).json({ success: true, profile, message: exists ? 'Perfil actualizado exitosamente' : 'Perfil creado exitosamente' });
      } catch (error: any) {
        console.error('[CLIENT][SAVE PROFILE] Error:', error);
        return res.status(500).json({ success: false, error: 'Error al guardar perfil', details: error.message });
      }
    });
  }
}


