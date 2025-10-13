/**
 * Provider Portfolio Routes
 * Endpoints para gestionar el portafolio (galería) del profesional
 */

import { Router, Request, Response } from 'express';
import DatabaseConnection from '../../../shared/database/connection';
import { authenticateToken } from '../../auth/middleware/auth.middleware';
import { Logger } from '../../../shared/utils/logger.util';

interface AuthUser {
  id: number;
  email: string;
  role: string;
}

const MODULE = 'ProviderPortfolioRoutes';

export class ProviderPortfolioRoutes {
  public router: Router;

  constructor() {
    this.router = Router();
    this.initializeRoutes();
  }

  private initializeRoutes() {
    // GET /provider/portfolio - Listar items del portafolio
    this.router.get('/provider/portfolio', authenticateToken, async (req: Request, res: Response) => {
      try {
        const user = (req as any).user as AuthUser;
        Logger.info(MODULE, 'GET /provider/portfolio', { userId: user.id });

        if (user.role !== 'provider') {
          return res.status(403).json({ success: false, error: 'Solo providers pueden acceder' });
        }

        const pool = DatabaseConnection.getPool();
        const [rows] = await pool.query(
          `SELECT id, file_url, file_type, title, description, 
                  order_index, is_active, file_size, mime_type, 
                  thumbnail_url, is_featured, view_count,
                  created_at, updated_at
           FROM provider_portfolio
           WHERE provider_id = ? AND is_active = TRUE
           ORDER BY order_index ASC, created_at DESC`,
          [user.id]
        );

        return res.json({ success: true, portfolio: rows });
      } catch (error: any) {
        Logger.error(MODULE, 'Error fetching portfolio', error);
        return res.status(500).json({ success: false, error: 'Error al obtener portafolio' });
      }
    });

    // POST /provider/portfolio - Agregar item al portafolio
    this.router.post('/provider/portfolio', authenticateToken, async (req: Request, res: Response) => {
      try {
        const user = (req as any).user as AuthUser;
        Logger.info(MODULE, 'POST /provider/portfolio', { userId: user.id, body: req.body });

        if (user.role !== 'provider') {
          return res.status(403).json({ success: false, error: 'Solo providers pueden acceder' });
        }

        const {
          file_url,
          file_type,
          title,
          description,
          file_size,
          mime_type,
          thumbnail_url
        } = req.body;

        // Validaciones
        if (!file_url || !file_type) {
          return res.status(400).json({
            success: false,
            error: 'file_url y file_type son requeridos'
          });
        }

        if (!['image', 'video'].includes(file_type)) {
          return res.status(400).json({
            success: false,
            error: 'file_type debe ser "image" o "video"'
          });
        }

        const pool = DatabaseConnection.getPool();

        // Verificar límite de items (máximo 10)
        const [countResult] = await pool.query(
          'SELECT COUNT(*) as count FROM provider_portfolio WHERE provider_id = ? AND is_active = TRUE',
          [user.id]
        );
        const currentCount = (countResult as any[])[0].count;

        if (currentCount >= 10) {
          return res.status(400).json({
            success: false,
            error: 'Has alcanzado el límite máximo de 10 items en el portafolio'
          });
        }

        // Obtener el siguiente order_index
        const nextOrder = currentCount;

        // Insertar item
        const [result] = await pool.execute(
          `INSERT INTO provider_portfolio 
           (provider_id, file_url, file_type, title, description, 
            file_size, mime_type, thumbnail_url, order_index)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            user.id,
            file_url,
            file_type,
            title || null,
            description || null,
            file_size || null,
            mime_type || null,
            thumbnail_url || null,
            nextOrder
          ]
        );

        const itemId = (result as any).insertId;

        // Obtener el item creado
        const [rows] = await pool.query(
          'SELECT * FROM provider_portfolio WHERE id = ?',
          [itemId]
        );

        const item = (rows as any[])[0];

        // Actualizar profile_completion (agregar +10% si tiene al menos 2 items)
        if (currentCount === 1) {
          await pool.execute(
            `UPDATE provider_profiles 
             SET profile_completion = LEAST(100, profile_completion + 10)
             WHERE provider_id = ?`,
            [user.id]
          );
        }

        Logger.info(MODULE, 'Portfolio item created', { itemId, userId: user.id });
        return res.status(201).json({ success: true, item });
      } catch (error: any) {
        Logger.error(MODULE, 'Error creating portfolio item', error);
        return res.status(500).json({ success: false, error: 'Error al agregar item al portafolio' });
      }
    });

    // DELETE /provider/portfolio/:id - Eliminar item del portafolio
    this.router.delete('/provider/portfolio/:id', authenticateToken, async (req: Request, res: Response) => {
      try {
        const user = (req as any).user as AuthUser;
        const itemId = req.params.id;
        Logger.info(MODULE, 'DELETE /provider/portfolio/:id', { userId: user.id, itemId });

        if (user.role !== 'provider') {
          return res.status(403).json({ success: false, error: 'Solo providers pueden acceder' });
        }

        const pool = DatabaseConnection.getPool();

        // Verificar que el item pertenece al usuario
        const [rows] = await pool.query(
          'SELECT * FROM provider_portfolio WHERE id = ? AND provider_id = ?',
          [itemId, user.id]
        );

        if ((rows as any[]).length === 0) {
          return res.status(404).json({ success: false, error: 'Item no encontrado' });
        }

        // Marcar como inactivo en lugar de eliminar (soft delete)
        await pool.execute(
          'UPDATE provider_portfolio SET is_active = FALSE, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND provider_id = ?',
          [itemId, user.id]
        );

        Logger.info(MODULE, 'Portfolio item deleted', { itemId, userId: user.id });
        return res.json({ success: true, message: 'Item eliminado correctamente' });
      } catch (error: any) {
        Logger.error(MODULE, 'Error deleting portfolio item', error);
        return res.status(500).json({ success: false, error: 'Error al eliminar item' });
      }
    });

    // PUT /provider/portfolio/reorder - Reordenar items del portafolio
    this.router.put('/provider/portfolio/reorder', authenticateToken, async (req: Request, res: Response) => {
      try {
        const user = (req as any).user as AuthUser;
        const { items } = req.body; // Array de { id, order_index }
        Logger.info(MODULE, 'PUT /provider/portfolio/reorder', { userId: user.id, items });

        if (user.role !== 'provider') {
          return res.status(403).json({ success: false, error: 'Solo providers pueden acceder' });
        }

        if (!Array.isArray(items)) {
          return res.status(400).json({ success: false, error: 'items debe ser un array' });
        }

        const pool = DatabaseConnection.getPool();

        // Actualizar order_index de cada item
        for (const item of items) {
          await pool.execute(
            'UPDATE provider_portfolio SET order_index = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND provider_id = ?',
            [item.order_index, item.id, user.id]
          );
        }

        Logger.info(MODULE, 'Portfolio reordered', { userId: user.id });
        return res.json({ success: true, message: 'Portafolio reordenado correctamente' });
      } catch (error: any) {
        Logger.error(MODULE, 'Error reordering portfolio', error);
        return res.status(500).json({ success: false, error: 'Error al reordenar portafolio' });
      }
    });
  }
}

export default new ProviderPortfolioRoutes().router;

