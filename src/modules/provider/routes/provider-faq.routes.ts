import { Router, Request, Response } from 'express';
import DatabaseConnection from '../../../shared/database/connection';
import { authenticateToken, requireRole, AuthUser } from '../../../shared/middleware/auth.middleware';
import { Logger } from '../../../shared/utils/logger.util';

const MODULE = 'ProviderFAQRoutes';
const DEFAULT_MAX_FAQS = 6;

class ProviderFaqRoutes {
  public router: Router;

  constructor() {
    this.router = Router();
    this.mountRoutes();
  }

  private mountRoutes() {
    // Listar preguntas frecuentes del provider autenticado
    this.router.get('/provider/faqs', authenticateToken, requireRole('provider'), async (req: Request, res: Response) => {
      try {
        const user = (req as any).user as AuthUser;
        const pool = DatabaseConnection.getPool();
        const [rows] = await pool.query(
          `SELECT id, question, answer, order_index
             FROM provider_faqs
            WHERE provider_id = ? AND is_active = 1
            ORDER BY order_index ASC, id ASC`,
          [user.id]
        );

        Logger.info(MODULE, 'List FAQs', { providerId: user.id, count: (rows as any[]).length });
        return res.json({ success: true, faqs: rows });
      } catch (error: any) {
        Logger.error(MODULE, 'Error listing FAQs', { error: error?.message });
        return res.status(500).json({ success: false, error: 'No se pudieron obtener las preguntas frecuentes' });
      }
    });

    // Crear nueva FAQ
    this.router.post('/provider/faqs', authenticateToken, requireRole('provider'), async (req: Request, res: Response) => {
      try {
        const user = (req as any).user as AuthUser;
        const { question, answer } = req.body || {};
        const trimmedQuestion = String(question || '').trim();
        const trimmedAnswer = String(answer || '').trim();

        if (!trimmedQuestion || !trimmedAnswer) {
          return res.status(400).json({ success: false, error: 'Pregunta y respuesta son obligatorias' });
        }

        const maxFaqs = Number(process.env.PROVIDER_FAQ_MAX || DEFAULT_MAX_FAQS);
        const pool = DatabaseConnection.getPool();

        const [[{ total }]]: any = await pool.query(
          `SELECT COUNT(*) AS total
             FROM provider_faqs
            WHERE provider_id = ? AND is_active = 1`,
          [user.id]
        );

        if (Number(total) >= maxFaqs) {
          return res.status(400).json({ success: false, error: `Has alcanzado el límite de ${maxFaqs} preguntas frecuentes` });
        }

        const orderIndex = Number(total);
        const [result] = await pool.execute(
          `INSERT INTO provider_faqs (provider_id, question, answer, order_index)
           VALUES (?, ?, ?, ?)`,
          [user.id, trimmedQuestion, trimmedAnswer, orderIndex]
        );

        const faqId = (result as any).insertId;
        Logger.info(MODULE, 'FAQ created', { providerId: user.id, faqId });

        return res.status(201).json({
          success: true,
          faq: {
            id: faqId,
            question: trimmedQuestion,
            answer: trimmedAnswer,
            order_index: orderIndex
          }
        });
      } catch (error: any) {
        Logger.error(MODULE, 'Error creating FAQ', { error: error?.message });
        return res.status(500).json({ success: false, error: 'No se pudo crear la pregunta frecuente' });
      }
    });

    // Actualizar pregunta frecuente
    this.router.put('/provider/faqs/:id', authenticateToken, requireRole('provider'), async (req: Request, res: Response) => {
      try {
        const user = (req as any).user as AuthUser;
        const faqId = Number(req.params.id);
        if (!faqId || !Number.isFinite(faqId)) {
          return res.status(400).json({ success: false, error: 'ID inválido' });
        }

        const { question, answer } = req.body || {};
        const trimmedQuestion = question !== undefined ? String(question).trim() : undefined;
        const trimmedAnswer = answer !== undefined ? String(answer).trim() : undefined;

        if ((trimmedQuestion !== undefined && !trimmedQuestion) || (trimmedAnswer !== undefined && !trimmedAnswer)) {
          return res.status(400).json({ success: false, error: 'Pregunta y respuesta no pueden quedar vacías' });
        }

        const pool = DatabaseConnection.getPool();
        const [[faq]]: any = await pool.query(
          `SELECT id, provider_id FROM provider_faqs WHERE id = ? AND is_active = 1 LIMIT 1`,
          [faqId]
        );

        if (!faq || faq.provider_id !== user.id) {
          return res.status(404).json({ success: false, error: 'Pregunta no encontrada' });
        }

        if (trimmedQuestion === undefined && trimmedAnswer === undefined) {
          return res.status(400).json({ success: false, error: 'No hay cambios que aplicar' });
        }

        await pool.execute(
          `UPDATE provider_faqs
              SET question = COALESCE(?, question),
                  answer = COALESCE(?, answer),
                  updated_at = CURRENT_TIMESTAMP
            WHERE id = ?`,
          [trimmedQuestion, trimmedAnswer, faqId]
        );

        const [[updated]]: any = await pool.query(
          `SELECT id, question, answer, order_index
             FROM provider_faqs
            WHERE id = ?`,
          [faqId]
        );

        Logger.info(MODULE, 'FAQ updated', { providerId: user.id, faqId });
        return res.json({ success: true, faq: updated });
      } catch (error: any) {
        Logger.error(MODULE, 'Error updating FAQ', { error: error?.message });
        return res.status(500).json({ success: false, error: 'No se pudo actualizar la pregunta frecuente' });
      }
    });

    // Reordenar FAQs
    this.router.put('/provider/faqs/reorder', authenticateToken, requireRole('provider'), async (req: Request, res: Response) => {
      try {
        const user = (req as any).user as AuthUser;
        const { order } = req.body || {};

        if (!Array.isArray(order) || !order.length) {
          return res.status(400).json({ success: false, error: 'Debes enviar un arreglo con los nuevos órdenes' });
        }

        const pool = DatabaseConnection.getPool();
        const faqIds = order.map((item: any) => Number(item?.id)).filter((id: number) => Number.isFinite(id));

        if (faqIds.length !== order.length) {
          return res.status(400).json({ success: false, error: 'Formato de orden inválido' });
        }

        const [rows]: any = await pool.query(
          `SELECT id FROM provider_faqs WHERE provider_id = ? AND is_active = 1`,
          [user.id]
        );
        const providerFaqIds = new Set((rows as any[]).map(r => r.id));

        // Ensure all ids belong to provider
        if (!faqIds.every(id => providerFaqIds.has(id))) {
          return res.status(400).json({ success: false, error: 'Las preguntas no pertenecen al proveedor' });
        }

        await Promise.all(order.map((item: any, index: number) => {
          const id = Number(item.id);
          return pool.execute(
            `UPDATE provider_faqs SET order_index = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
            [index, id]
          );
        }));

        Logger.info(MODULE, 'FAQs reordered', { providerId: user.id, count: order.length });
        return res.json({ success: true });
      } catch (error: any) {
        Logger.error(MODULE, 'Error reordering FAQs', { error: error?.message });
        return res.status(500).json({ success: false, error: 'No se pudo reordenar las preguntas frecuentes' });
      }
    });

    // Eliminar FAQ (soft delete)
    this.router.delete('/provider/faqs/:id', authenticateToken, requireRole('provider'), async (req: Request, res: Response) => {
      try {
        const user = (req as any).user as AuthUser;
        const faqId = Number(req.params.id);
        if (!faqId || !Number.isFinite(faqId)) {
          return res.status(400).json({ success: false, error: 'ID inválido' });
        }

        const pool = DatabaseConnection.getPool();
        const [[faq]]: any = await pool.query(
          `SELECT id, provider_id FROM provider_faqs WHERE id = ? AND is_active = 1 LIMIT 1`,
          [faqId]
        );

        if (!faq || faq.provider_id !== user.id) {
          return res.status(404).json({ success: false, error: 'Pregunta no encontrada' });
        }

        await pool.execute(
          `UPDATE provider_faqs SET is_active = 0, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
          [faqId]
        );

        // Reordenar las restantes para evitar huecos
        const [rows]: any = await pool.query(
          `SELECT id FROM provider_faqs WHERE provider_id = ? AND is_active = 1 ORDER BY order_index ASC, id ASC`,
          [user.id]
        );

        await Promise.all((rows as any[]).map((row: any, index: number) =>
          pool.execute(
            `UPDATE provider_faqs SET order_index = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
            [index, row.id]
          )
        ));

        Logger.info(MODULE, 'FAQ removed', { providerId: user.id, faqId });
        return res.json({ success: true });
      } catch (error: any) {
        Logger.error(MODULE, 'Error deleting FAQ', { error: error?.message });
        return res.status(500).json({ success: false, error: 'No se pudo eliminar la pregunta frecuente' });
      }
    });
  }
}

export default new ProviderFaqRoutes().router;

