import { Router, Request, Response } from 'express';
import DatabaseConnection from '../../../shared/database/connection';
import { authenticateToken, AuthUser } from '../../../shared/middleware/auth.middleware';
import { Logger } from '../../../shared/utils/logger.util';

const MODULE = 'ProviderAvailabilityRoutes';

export class ProviderAvailabilityRoutes {
  public router: Router;

  constructor() {
    this.router = Router();
    this.initializeRoutes();
  }

  private initializeRoutes() {
    // GET /provider/availability/weekly - Lista de bloques semanales
    this.router.get('/provider/availability/weekly', authenticateToken, async (req: Request, res: Response) => {
      try {
        const user = (req as any).user as AuthUser;
        if (user.role !== 'provider') return res.status(403).json({ success: false, error: 'Solo providers' });
        const pool = DatabaseConnection.getPool();
        const [rows] = await pool.query(
          `SELECT id, day_of_week, start_time, end_time, is_active, created_at, updated_at
           FROM provider_availability WHERE provider_id = ? ORDER BY FIELD(day_of_week,'monday','tuesday','wednesday','thursday','friday','saturday','sunday'), start_time ASC`,
          [user.id]
        );
        return res.json({ success: true, blocks: rows });
      } catch (error: any) {
        Logger.error(MODULE, 'Error listing weekly availability', error);
        return res.status(500).json({ success: false, error: 'Error al listar disponibilidad semanal' });
      }
    });

    // POST /provider/availability/weekly - Crear bloque
    this.router.post('/provider/availability/weekly', authenticateToken, async (req: Request, res: Response) => {
      try {
        const user = (req as any).user as AuthUser;
        if (user.role !== 'provider') return res.status(403).json({ success: false, error: 'Solo providers' });
        const { day_of_week, start_time, end_time, is_active } = req.body || {};
        if (!day_of_week || !start_time || !end_time) {
          return res.status(400).json({ success: false, error: 'Campos requeridos: day_of_week, start_time, end_time' });
        }
        const pool = DatabaseConnection.getPool();
        const [result] = await pool.execute(
          `INSERT INTO provider_availability (provider_id, day_of_week, start_time, end_time, is_active)
           VALUES (?, ?, ?, ?, COALESCE(?, TRUE))`,
          [user.id, day_of_week, start_time, end_time, is_active]
        );
        const id = (result as any).insertId;
        const [rows] = await pool.query(`SELECT * FROM provider_availability WHERE id = ?`, [id]);
        return res.status(201).json({ success: true, block: (rows as any[])[0] });
      } catch (error: any) {
        Logger.error(MODULE, 'Error creating weekly availability', error);
        return res.status(500).json({ success: false, error: 'Error al crear disponibilidad' });
      }
    });

    // PUT /provider/availability/weekly/:id - Actualizar bloque
    this.router.put('/provider/availability/weekly/:id', authenticateToken, async (req: Request, res: Response) => {
      try {
        const user = (req as any).user as AuthUser;
        if (user.role !== 'provider') return res.status(403).json({ success: false, error: 'Solo providers' });
        const id = Number(req.params.id);
        const { start_time, end_time, is_active } = req.body || {};
        const pool = DatabaseConnection.getPool();
        const [owned] = await pool.query(`SELECT id FROM provider_availability WHERE id = ? AND provider_id = ?`, [id, user.id]);
        if ((owned as any[]).length === 0) return res.status(404).json({ success: false, error: 'Bloque no encontrado' });
        await pool.execute(
          `UPDATE provider_availability SET 
             start_time = COALESCE(?, start_time),
             end_time = COALESCE(?, end_time),
             is_active = COALESCE(?, is_active),
             updated_at = CURRENT_TIMESTAMP
           WHERE id = ? AND provider_id = ?`,
          [start_time || null, end_time || null, is_active, id, user.id]
        );
        const [rows] = await pool.query(`SELECT * FROM provider_availability WHERE id = ?`, [id]);
        return res.json({ success: true, block: (rows as any[])[0] });
      } catch (error: any) {
        Logger.error(MODULE, 'Error updating weekly availability', error);
        return res.status(500).json({ success: false, error: 'Error al actualizar disponibilidad' });
      }
    });

    // DELETE /provider/availability/weekly/:id - Eliminar bloque
    this.router.delete('/provider/availability/weekly/:id', authenticateToken, async (req: Request, res: Response) => {
      try {
        const user = (req as any).user as AuthUser;
        if (user.role !== 'provider') return res.status(403).json({ success: false, error: 'Solo providers' });
        const id = Number(req.params.id);
        const pool = DatabaseConnection.getPool();
        const [owned] = await pool.query(`SELECT id FROM provider_availability WHERE id = ? AND provider_id = ?`, [id, user.id]);
        if ((owned as any[]).length === 0) return res.status(404).json({ success: false, error: 'Bloque no encontrado' });
        await pool.execute(`DELETE FROM provider_availability WHERE id = ? AND provider_id = ?`, [id, user.id]);
        return res.json({ success: true, message: 'Bloque eliminado' });
      } catch (error: any) {
        Logger.error(MODULE, 'Error deleting weekly availability', error);
        return res.status(500).json({ success: false, error: 'Error al eliminar disponibilidad' });
      }
    });

    // Exceptions
    // GET /provider/availability/exceptions
    this.router.get('/provider/availability/exceptions', authenticateToken, async (req: Request, res: Response) => {
      try {
        const user = (req as any).user as AuthUser;
        if (user.role !== 'provider') return res.status(403).json({ success: false, error: 'Solo providers' });
        const pool = DatabaseConnection.getPool();
        const [rows] = await pool.query(
          `SELECT id, exception_date, is_available, start_time, end_time, reason
           FROM availability_exceptions WHERE provider_id = ? ORDER BY exception_date DESC`,
          [user.id]
        );
        return res.json({ success: true, exceptions: rows });
      } catch (error: any) {
        Logger.error(MODULE, 'Error listing availability exceptions', error);
        return res.status(500).json({ success: false, error: 'Error al listar excepciones' });
      }
    });

    // POST /provider/availability/exceptions
    this.router.post('/provider/availability/exceptions', authenticateToken, async (req: Request, res: Response) => {
      try {
        const user = (req as any).user as AuthUser;
        if (user.role !== 'provider') return res.status(403).json({ success: false, error: 'Solo providers' });
        const { exception_date, is_available, start_time, end_time, reason } = req.body || {};
        if (!exception_date) return res.status(400).json({ success: false, error: 'exception_date es requerido' });
        const pool = DatabaseConnection.getPool();
        const [result] = await pool.execute(
          `INSERT INTO availability_exceptions (provider_id, exception_date, is_available, start_time, end_time, reason)
           VALUES (?, ?, COALESCE(?, FALSE), ?, ?, ?)`,
          [user.id, exception_date, is_available, start_time || null, end_time || null, reason || null]
        );
        const id = (result as any).insertId;
        const [rows] = await pool.query(`SELECT * FROM availability_exceptions WHERE id = ?`, [id]);
        return res.status(201).json({ success: true, exception: (rows as any[])[0] });
      } catch (error: any) {
        Logger.error(MODULE, 'Error creating availability exception', error);
        return res.status(500).json({ success: false, error: 'Error al crear excepción' });
      }
    });

    // DELETE /provider/availability/exceptions/:id
    this.router.delete('/provider/availability/exceptions/:id', authenticateToken, async (req: Request, res: Response) => {
      try {
        const user = (req as any).user as AuthUser;
        if (user.role !== 'provider') return res.status(403).json({ success: false, error: 'Solo providers' });
        const id = Number(req.params.id);
        const pool = DatabaseConnection.getPool();
        const [owned] = await pool.query(`SELECT id FROM availability_exceptions WHERE id = ? AND provider_id = ?`, [id, user.id]);
        if ((owned as any[]).length === 0) return res.status(404).json({ success: false, error: 'Excepción no encontrada' });
        await pool.execute(`DELETE FROM availability_exceptions WHERE id = ? AND provider_id = ?`, [id, user.id]);
        return res.json({ success: true, message: 'Excepción eliminada' });
      } catch (error: any) {
        Logger.error(MODULE, 'Error deleting availability exception', error);
        return res.status(500).json({ success: false, error: 'Error al eliminar excepción' });
      }
    });
  }
}

export default new ProviderAvailabilityRoutes().router;






