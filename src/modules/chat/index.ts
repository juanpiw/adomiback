/**
 * Chat Module
 * Handles conversations and messaging between clients and providers
 */

import { Router, Request, Response } from 'express';
import { authenticateToken } from '../../shared/middleware/auth.middleware';
import DatabaseConnection from '../../shared/database/connection';
import { Logger } from '../../shared/utils/logger.util';
import { emitToConversation } from '../../shared/realtime/socket';

const MODULE = 'CHAT';

export function setupChatModule(app: any) {
  const router = Router();

  // POST /conversations - iniciar/obtener conversación cliente↔proveedor
  router.post('/conversations', authenticateToken, async (req: Request, res: Response) => {
    try {
      const user = (req as any).user || {};
      Logger.info(MODULE, 'POST /conversations incoming', { authedUserId: user.id, body: req.body });
      const { client_id, provider_id } = req.body || {};
      if (!client_id || !provider_id) {
        return res.status(400).json({ success: false, error: 'client_id y provider_id son requeridos' });
      }
      const pool = DatabaseConnection.getPool();
      // buscar existente
      const [found] = await pool.query(
        'SELECT * FROM conversations WHERE client_id = ? AND provider_id = ? LIMIT 1',
        [client_id, provider_id]
      );
      if ((found as any[]).length > 0) {
        Logger.info(MODULE, 'Conversation found', { client_id, provider_id, conversationId: (found as any[])[0]?.id });
        return res.json({ success: true, conversation: (found as any[])[0] });
      }
      // crear
      await pool.execute(
        'INSERT INTO conversations (client_id, provider_id) VALUES (?, ?)',
        [client_id, provider_id]
      );
      const [rows] = await pool.query(
        'SELECT * FROM conversations WHERE client_id = ? AND provider_id = ? LIMIT 1',
        [client_id, provider_id]
      );
      Logger.info(MODULE, 'Conversation created', { client_id, provider_id, conversationId: (rows as any[])[0]?.id });
      return res.status(201).json({ success: true, conversation: (rows as any[])[0] });
    } catch (error: any) {
      Logger.error(MODULE, 'Error creating/getting conversation', error);
      return res.status(500).json({ success: false, error: 'Error al crear conversación' });
    }
  });

  // GET /conversations/user/:userId - conversaciones del usuario
  router.get('/conversations/user/:userId', authenticateToken, async (req: Request, res: Response) => {
    try {
      const user = (req as any).user || {};
      const userId = Number(req.params.userId);
      Logger.info(MODULE, 'GET /conversations/user/:userId', { authedUserId: user.id, paramUserId: userId });
      if (!Number.isFinite(userId)) return res.status(400).json({ success: false, error: 'userId inválido' });
      const pool = DatabaseConnection.getPool();
      const [rows] = await pool.query(
        `SELECT c.*, 
                (SELECT content FROM messages m WHERE m.id = c.last_message_id) AS last_message_preview,
                (SELECT COUNT(*) FROM messages m WHERE m.conversation_id = c.id AND m.receiver_id = ? AND m.read_at IS NULL) AS unread_count,
                (SELECT name FROM users u1 WHERE u1.id = c.client_id) AS client_name,
                (SELECT name FROM users u2 WHERE u2.id = c.provider_id) AS provider_name,
                CASE WHEN c.client_id = ? 
                     THEN (SELECT name FROM users ux WHERE ux.id = c.provider_id)
                     ELSE (SELECT name FROM users uy WHERE uy.id = c.client_id)
                END AS contact_name
         FROM conversations c
         WHERE c.client_id = ? OR c.provider_id = ?
         ORDER BY (c.last_message_at IS NULL), c.last_message_at DESC`,
        [userId, userId, userId, userId]
      );
      Logger.info(MODULE, 'Conversations listed', { count: (rows as any[])?.length || 0 });
      return res.json({ success: true, conversations: rows });
    } catch (error: any) {
      Logger.error(MODULE, 'Error listing conversations', error);
      return res.status(500).json({ success: false, error: 'Error al listar conversaciones' });
    }
  });

  // GET /conversations/:id/messages - listar mensajes (paginado simple)
  router.get('/conversations/:id/messages', authenticateToken, async (req: Request, res: Response) => {
    try {
      const user = (req as any).user || {};
      const id = Number(req.params.id);
      Logger.info(MODULE, 'GET /conversations/:id/messages', { authedUserId: user.id, conversationId: id, query: req.query });
      if (!Number.isFinite(id)) return res.status(400).json({ success: false, error: 'conversationId inválido' });
      const limit = Math.max(1, Math.min(100, Number(req.query.limit) || 50));
      const before = req.query.before ? new Date(String(req.query.before)) : null;
      const pool = DatabaseConnection.getPool();
      const params: any[] = [id];
      let whereBefore = '';
      if (before && !Number.isNaN(before.getTime())) {
        whereBefore = ' AND created_at < ?';
        params.push(before);
      }
      params.push(limit);
      const [rows] = await pool.query(
        `SELECT * FROM messages WHERE conversation_id = ?${whereBefore} ORDER BY created_at DESC LIMIT ?`,
        params
      );
      Logger.info(MODULE, 'Messages listed', { count: (rows as any[])?.length || 0 });
      return res.json({ success: true, messages: rows });
    } catch (error: any) {
      Logger.error(MODULE, 'Error listing messages', error);
      return res.status(500).json({ success: false, error: 'Error al listar mensajes' });
    }
  });

  // POST /messages - enviar mensaje
  router.post('/messages', authenticateToken, async (req: Request, res: Response) => {
    try {
      const user = (req as any).user || {};
      Logger.info(MODULE, 'POST /messages incoming', { authedUserId: user.id, body: req.body });
      const { conversation_id, receiver_id, content } = req.body || {};
      if (!conversation_id || !receiver_id || !content || String(content).trim().length === 0) {
        return res.status(400).json({ success: false, error: 'conversation_id, receiver_id y content son requeridos' });
      }
      const pool = DatabaseConnection.getPool();
      // validar que el usuario pertenezca a la conversación
      const [convRows] = await pool.query('SELECT * FROM conversations WHERE id = ? LIMIT 1', [conversation_id]);
      if ((convRows as any[]).length === 0) {
        return res.status(404).json({ success: false, error: 'Conversación no encontrada' });
      }
      const conv = (convRows as any[])[0];
      if (conv.client_id !== user.id && conv.provider_id !== user.id) {
        return res.status(403).json({ success: false, error: 'No autorizado en esta conversación' });
      }
      const [insertRes] = await pool.execute(
        'INSERT INTO messages (conversation_id, sender_id, receiver_id, content) VALUES (?, ?, ?, ?)',
        [conversation_id, user.id, receiver_id, content]
      );
      Logger.info(MODULE, 'Message inserted', { conversation_id, sender_id: user.id, receiver_id, insertId: (insertRes as any)?.insertId });
      // actualizar last_message_* en conversación
      const [last] = await pool.query('SELECT id, created_at, content FROM messages WHERE conversation_id = ? ORDER BY id DESC LIMIT 1', [conversation_id]);
      const lastMsg = (last as any[])[0];
      await pool.execute(
        'UPDATE conversations SET last_message_id = ?, last_message_at = ? WHERE id = ?',
        [lastMsg.id, lastMsg.created_at, conversation_id]
      );
      Logger.info(MODULE, 'Conversation updated with last message', { conversation_id, last_message_id: lastMsg.id });
      // Emitir en tiempo real a la sala de la conversación
      try { emitToConversation(conversation_id, 'message:new', lastMsg); } catch {}
      return res.status(201).json({ success: true, message: lastMsg });
    } catch (error: any) {
      Logger.error(MODULE, 'Error sending message', error);
      return res.status(500).json({ success: false, error: 'Error al enviar mensaje' });
    }
  });

  // PATCH /messages/:id/read - marcar leído
  router.patch('/messages/:id/read', authenticateToken, async (req: Request, res: Response) => {
    try {
      const user = (req as any).user || {};
      Logger.info(MODULE, 'PATCH /messages/:id/read', { authedUserId: user.id, params: req.params });
      const id = Number(req.params.id);
      if (!Number.isFinite(id)) return res.status(400).json({ success: false, error: 'messageId inválido' });
      const pool = DatabaseConnection.getPool();
      // validar ownership como receiver
      const [rows] = await pool.query('SELECT id, receiver_id FROM messages WHERE id = ? LIMIT 1', [id]);
      if ((rows as any[]).length === 0) return res.status(404).json({ success: false, error: 'Mensaje no encontrado' });
      const msg = (rows as any[])[0];
      if (msg.receiver_id !== user.id) return res.status(403).json({ success: false, error: 'No autorizado' });
      await pool.execute('UPDATE messages SET read_at = CURRENT_TIMESTAMP WHERE id = ?', [id]);
      return res.json({ success: true });
    } catch (error: any) {
      Logger.error(MODULE, 'Error marking message as read', error);
      return res.status(500).json({ success: false, error: 'Error al marcar leído' });
    }
  });

  app.use('/', router);
  Logger.info(MODULE, 'Chat routes mounted');
}

