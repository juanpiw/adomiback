import { Request, Response, Router } from 'express';
import DatabaseConnection from '../../../shared/database/connection';
import { authenticateToken, AuthUser } from '../../../shared/middleware/auth.middleware';
import { Logger } from '../../../shared/utils/logger.util';
import { logFunnelEvent } from '../../../shared/utils/subscription.util';

const MODULE = 'CLIENT_ACCOUNT';

export class ClientAccountRoutes {
  private router: Router;

  constructor() {
    this.router = Router();
    this.mountRoutes();
  }

  getRouter(): Router {
    return this.router;
  }

  private mountRoutes(): void {
    this.router.post('/account/switch-to-provider', authenticateToken, async (req: Request, res: Response) => {
      const user = (req as any).user as AuthUser;
      if (!user) {
        return res.status(401).json({ ok: false, error: 'auth_required' });
      }

      if (user.role !== 'client') {
        return res.status(409).json({ ok: false, error: 'already_provider' });
      }

      const pool = DatabaseConnection.getPool();
      const connection = await pool.getConnection();

      try {
        await connection.beginTransaction();

        const [[dbUser]]: any = await connection.query(
          'SELECT role, pending_role, account_switch_in_progress FROM users WHERE id = ? LIMIT 1 FOR UPDATE',
          [user.id]
        );

        if (!dbUser) {
          await connection.rollback();
          return res.status(404).json({ ok: false, error: 'user_not_found' });
        }

        if (dbUser.role !== 'client') {
          await connection.rollback();
          return res.status(409).json({ ok: false, error: 'already_provider' });
        }

        if (Number(dbUser.account_switch_in_progress) === 1) {
          await connection.rollback();
          return res.status(200).json({ ok: true, alreadyInProgress: true });
        }

        await connection.execute(
          `UPDATE users
             SET pending_role = 'provider',
                 account_switch_in_progress = 1,
                 account_switch_started_at = NOW(),
                 account_switched_at = NULL,
                 account_switch_source = 'client_dashboard',
                 active_plan_id = NULL,
                 updated_at = CURRENT_TIMESTAMP
           WHERE id = ?`,
          [user.id]
        );

        await logFunnelEvent(connection, {
          event: 'account_switch_requested',
          email: user.email,
          providerId: user.id,
          metadata: {
            source: 'client_dashboard'
          }
        });

        await connection.commit();

        Logger.info(MODULE, 'Client requested switch-to-provider', { userId: user.id, email: user.email });

        return res.json({ ok: true });
      } catch (error: any) {
        await connection.rollback();
        Logger.error(MODULE, 'Error switching account to provider', { userId: user.id, error: error?.message });
        return res.status(500).json({ ok: false, error: 'switch_failed' });
      } finally {
        connection.release();
      }
    });
  }
}


