import { Router, Request, Response } from 'express';
import crypto from 'crypto';
import DatabaseConnection from '../../../shared/database/connection';
import { authenticateToken, requireRole, AuthUser } from '../../../shared/middleware/auth.middleware';
import { Logger } from '../../../shared/utils/logger.util';

const MODULE = 'ProviderInvitesRoutes';
const ACTIVE_STATUSES = ["issued", "registered"] as const;
type ActiveStatus = typeof ACTIVE_STATUSES[number];

function generateInviteCode(length = 10) {
  return crypto.randomBytes(length).toString('base64url').replace(/[^a-zA-Z0-9]/g, '').slice(0, length);
}

function buildShareUrl(req: Request, inviteCode: string) {
  const base =
    process.env.INVITES_BASE_URL ||
    process.env.PUBLIC_BASE_URL ||
    process.env.API_BASE_URL ||
    `${req.protocol}://${req.get('host')}`;
  return `${base.replace(/\/+$/, '')}/invitar/${inviteCode}`;
}

async function logInviteEvent(inviteId: number, inviterId: number, eventType: string, metadata?: Record<string, any>) {
  try {
    const pool = DatabaseConnection.getPool();
    await pool.execute(
      `INSERT INTO provider_invite_events (invite_id, inviter_provider_id, event_type, metadata)
       VALUES (?, ?, ?, ?)`,
      [inviteId, inviterId, eventType, metadata ? JSON.stringify(metadata) : null]
    );
  } catch (error: any) {
    Logger.warn(MODULE, 'No se pudo registrar evento de invitación', { inviteId, inviterId, eventType, error: error?.message });
  }
}

async function getProviderInviteStats(providerId: number) {
  const pool = DatabaseConnection.getPool();
  const [[profile]]: any = await pool.query(
    `SELECT invite_quota, invite_used, pioneer_unlocked_at
       FROM provider_profiles
      WHERE provider_id = ?
      LIMIT 1`,
    [providerId]
  );

  const [counts]: any = await pool.query(
    `SELECT
        SUM(status = 'issued' AND (expires_at IS NULL OR expires_at > NOW())) AS issued,
        SUM(status = 'registered' AND (expires_at IS NULL OR expires_at > NOW())) AS registered,
        SUM(status = 'verified') AS verified,
        SUM(status = 'expired') AS expired,
        SUM(status = 'revoked') AS revoked
     FROM provider_invites
    WHERE inviter_provider_id = ?`,
    [providerId]
  );

  return {
    profile: profile || { invite_quota: 3, invite_used: 0, pioneer_unlocked_at: null },
    counts: {
      issued: Number(counts?.issued || 0),
      registered: Number(counts?.registered || 0),
      verified: Number(counts?.verified || 0),
      expired: Number(counts?.expired || 0),
      revoked: Number(counts?.revoked || 0)
    }
  };
}

async function expirePastDueInvites(providerId?: number) {
  try {
    const pool = DatabaseConnection.getPool();
    const params: any[] = [];
    let where = `status IN ('issued','registered') AND expires_at IS NOT NULL AND expires_at < NOW()`;
    if (typeof providerId === 'number') {
      where += ` AND inviter_provider_id = ?`;
      params.push(providerId);
    }

    const [rows]: any = await pool.query(
      `SELECT id, inviter_provider_id
         FROM provider_invites
        WHERE ${where}`,
      params
    );

    if (!Array.isArray(rows) || rows.length === 0) return;

    const ids = rows.map((r: any) => Number(r.id));
    if (ids.length === 0) return;

    await pool.execute(
      `UPDATE provider_invites
          SET status = 'expired',
              updated_at = NOW()
        WHERE id IN (${ids.map(() => '?').join(',')})`,
      ids
    );

    for (const row of rows) {
      await logInviteEvent(Number(row.id), Number(row.inviter_provider_id), 'expired');
    }
  } catch (error: any) {
    Logger.warn(MODULE, 'No se pudo expirar invitaciones vencidas', error?.message || error);
  }
}

export async function markInviteAsVerified(providerId: number) {
  const pool = DatabaseConnection.getPool();
  const [[userRow]]: any = await pool.query(
    `SELECT id, email
       FROM users
      WHERE id = ?
      LIMIT 1`,
    [providerId]
  );
  if (!userRow) {
    return { matched: false };
  }

  const email = (userRow.email || '').trim();

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    const [inviteRows]: any = await conn.query(
      `SELECT id, inviter_provider_id, invite_code
         FROM provider_invites
        WHERE status IN ('issued','registered')
          AND (
            invitee_provider_id = ?
            OR (invitee_email IS NOT NULL AND invitee_email <> '' AND invitee_email = ?)
          )
        ORDER BY created_at DESC
        LIMIT 1
      `,
      [providerId, email || null]
    );

    if (!Array.isArray(inviteRows) || inviteRows.length === 0) {
      await conn.commit();
      return { matched: false };
    }

    const invite = inviteRows[0];
    const [[profileBefore]]: any = await conn.query(
      `SELECT invite_quota, invite_used, pioneer_unlocked_at
         FROM provider_profiles
        WHERE provider_id = ?
        LIMIT 1
        FOR UPDATE`,
      [invite.inviter_provider_id]
    );

    await conn.execute(
      `UPDATE provider_invites
          SET status = 'verified',
              invitee_provider_id = ?,
              verified_at = NOW(),
              updated_at = NOW()
        WHERE id = ?`,
      [providerId, invite.id]
    );

    const inviteQuota = Number(profileBefore?.invite_quota ?? 3);
    const inviteUsedBefore = Number(profileBefore?.invite_used ?? 0);
    const pioneerUnlockedBefore = !!profileBefore?.pioneer_unlocked_at;
    const inviteUsedAfter = inviteUsedBefore + 1;
    const pioneerUnlockedAfter = pioneerUnlockedBefore || inviteUsedAfter >= inviteQuota;

    await conn.execute(
      `UPDATE provider_profiles
          SET invite_used = invite_used + 1,
              pioneer_unlocked_at = CASE
                WHEN pioneer_unlocked_at IS NULL AND invite_used + 1 >= invite_quota THEN NOW()
                ELSE pioneer_unlocked_at
              END,
              updated_at = NOW()
        WHERE provider_id = ?`,
      [invite.inviter_provider_id]
    );

    await logInviteEvent(invite.id, invite.inviter_provider_id, 'verified', {
      invitee_provider_id: providerId,
      pioneer_unlocked: !pioneerUnlockedBefore && pioneerUnlockedAfter
    });

    await conn.commit();
    return {
      matched: true,
      inviteId: invite.id,
      inviterProviderId: invite.inviter_provider_id,
      pioneerUnlocked: !pioneerUnlockedBefore && pioneerUnlockedAfter
    };
  } catch (error) {
    await conn.rollback();
    Logger.error(MODULE, 'Error confirmando invitación verificada', error as any);
    throw error;
  } finally {
    conn.release();
  }
}

const router = Router();

router.post(
  '/provider/invites',
  authenticateToken,
  requireRole('provider'),
  async (req: Request, res: Response) => {
    try {
      const user = (req as any).user as AuthUser;
      const pool = DatabaseConnection.getPool();

      await expirePastDueInvites(user.id);

      const [[providerUser]]: any = await pool.query(
        `SELECT email
           FROM users
          WHERE id = ?
          LIMIT 1`,
        [user.id]
      );
      const providerEmail = (providerUser?.email || '').trim().toLowerCase();

      const [[profile]]: any = await pool.query(
        `SELECT invite_quota
           FROM provider_profiles
          WHERE provider_id = ?
          LIMIT 1`,
        [user.id]
      );
      const inviteQuota = Number(profile?.invite_quota ?? 3);

      const [[activeResult]]: any = await pool.query(
        `SELECT COUNT(*) AS active_count
           FROM provider_invites
          WHERE inviter_provider_id = ?
            AND status IN ('issued','registered')
            AND (expires_at IS NULL OR expires_at > NOW())`,
        [user.id]
      );
      const activeInvites = Number(activeResult?.active_count || 0);
      if (activeInvites >= inviteQuota) {
        return res.status(409).json({ success: false, error: 'invite_quota_reached' });
      }

      const dailyLimit = Number(process.env.PROVIDER_INVITE_DAILY_LIMIT || 5);
      if (dailyLimit > 0) {
        const [[dailyCount]]: any = await pool.query(
          `SELECT COUNT(*) AS daily_count
             FROM provider_invites
            WHERE inviter_provider_id = ?
              AND created_at >= DATE_SUB(NOW(), INTERVAL 1 DAY)`,
          [user.id]
        );
        if (Number(dailyCount?.daily_count || 0) >= dailyLimit) {
          return res.status(429).json({ success: false, error: 'invite_daily_limit_reached' });
        }
      }

      const emailRaw = typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : '';
      const phoneRaw = typeof req.body?.phone === 'string' ? req.body.phone.trim() : '';
      const nameRaw = typeof req.body?.name === 'string' ? req.body.name.trim() : '';

      const inviteeEmail = emailRaw || null;
      const inviteePhone = phoneRaw || null;
      const inviteeName = nameRaw || null;

      if (!inviteeEmail && !inviteePhone) {
        return res.status(400).json({ success: false, error: 'contact_required' });
      }

      if (inviteeEmail && providerEmail && inviteeEmail === providerEmail) {
        return res.status(400).json({ success: false, error: 'invitee_same_provider' });
      }

      if (inviteeEmail) {
        const [[duplicate]]: any = await pool.query(
          `SELECT id, status
             FROM provider_invites
            WHERE inviter_provider_id = ?
              AND invitee_email = ?
            ORDER BY created_at DESC
            LIMIT 1`,
          [user.id, inviteeEmail]
        );
        if (duplicate) {
          if (duplicate.status === 'verified') {
            await logInviteEvent(Number(duplicate.id), user.id, 'duplicate_invitee', { invitee_email: inviteeEmail });
            return res.status(409).json({ success: false, error: 'invitee_already_verified' });
          }
        }
      }

      // Generar código único
      let inviteCode = generateInviteCode();
      for (let i = 0; i < 5; i += 1) {
        const [[exists]]: any = await pool.query(
          `SELECT id FROM provider_invites WHERE invite_code = ? LIMIT 1`,
          [inviteCode]
        );
        if (!exists) break;
        inviteCode = generateInviteCode();
      }

      const expiresInDays = Number(process.env.PROVIDER_INVITE_EXPIRATION_DAYS || 30);

      const [insertResult]: any = await pool.execute(
        `INSERT INTO provider_invites
           (inviter_provider_id, invite_code, invitee_email, invitee_phone, invitee_name, expires_at)
         VALUES (?, ?, ?, ?, ?, DATE_ADD(NOW(), INTERVAL ? DAY))`,
        [user.id, inviteCode, inviteeEmail, inviteePhone, inviteeName, expiresInDays]
      );

      const inviteId = Number(insertResult.insertId);
      await logInviteEvent(inviteId, user.id, 'issued', {
        invitee_email: inviteeEmail,
        invitee_phone: inviteePhone
      });

      return res.json({
        success: true,
        invite: {
          id: inviteId,
          invite_code: inviteCode,
          status: 'issued',
          invitee_email: inviteeEmail,
          invitee_phone: inviteePhone,
          invitee_name: inviteeName,
          share_url: buildShareUrl(req, inviteCode)
        }
      });
    } catch (error: any) {
      Logger.error(MODULE, 'Error creando invitación', error);
      return res.status(500).json({ success: false, error: 'invite_creation_failed' });
    }
  }
);

router.get(
  '/provider/invites',
  authenticateToken,
  requireRole('provider'),
  async (req: Request, res: Response) => {
    try {
      const user = (req as any).user as AuthUser;
      const pool = DatabaseConnection.getPool();

      await expirePastDueInvites(user.id);

      const stats = await getProviderInviteStats(user.id);
      const [rows]: any = await pool.query(
        `SELECT id,
                invite_code,
                invitee_email,
                invitee_phone,
                invitee_name,
                status,
                invitee_provider_id,
                registered_at,
                verified_at,
                expires_at,
                created_at,
                updated_at
           FROM provider_invites
          WHERE inviter_provider_id = ?
          ORDER BY created_at DESC
          LIMIT 200`,
        [user.id]
      );

      return res.json({
        success: true,
        summary: {
          quota: Number(stats.profile.invite_quota ?? 3),
          used: Number(stats.profile.invite_used ?? 0),
          pioneer_unlocked_at: stats.profile.pioneer_unlocked_at,
          counts: stats.counts
        },
        invites: (rows as any[]).map((row) => ({
          ...row,
          share_url: buildShareUrl(req, row.invite_code)
        }))
      });
    } catch (error: any) {
      Logger.error(MODULE, 'Error obteniendo invitaciones', error);
      return res.status(500).json({ success: false, error: 'invite_list_failed' });
    }
  }
);

router.post('/provider/invites/accept', async (req: Request, res: Response) => {
  try {
    const codeRaw = typeof req.body?.inviteCode === 'string' ? req.body.inviteCode.trim() : '';
    if (!codeRaw) {
      return res.status(400).json({ success: false, error: 'invite_code_required' });
    }

    const nameRaw = typeof req.body?.name === 'string' ? req.body.name.trim() : '';
    const phoneRaw = typeof req.body?.phone === 'string' ? req.body.phone.trim() : '';
    const emailRaw = typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : '';

    const pool = DatabaseConnection.getPool();
    await expirePastDueInvites();
    const [[invite]]: any = await pool.query(
      `SELECT id, inviter_provider_id, status, expires_at
         FROM provider_invites
        WHERE invite_code = ?
        LIMIT 1`,
      [codeRaw]
    );

    if (!invite) {
      return res.status(404).json({ success: false, error: 'invite_not_found' });
    }

    if (invite.status === 'verified') {
      return res.status(409).json({ success: false, error: 'invite_already_verified' });
    }

    if (invite.status === 'revoked' || invite.status === 'expired') {
      return res.status(409).json({ success: false, error: 'invite_no_longer_valid' });
    }

    if (invite.expires_at && new Date(invite.expires_at).getTime() < Date.now()) {
      await pool.execute(
        `UPDATE provider_invites
            SET status = 'expired', updated_at = NOW()
          WHERE id = ?`,
        [invite.id]
      );
      await logInviteEvent(invite.id, invite.inviter_provider_id, 'expired');
      return res.status(409).json({ success: false, error: 'invite_expired' });
    }

    await pool.execute(
      `UPDATE provider_invites
          SET status = 'registered',
              invitee_email = COALESCE(NULLIF(?, ''), invitee_email),
              invitee_phone = COALESCE(NULLIF(?, ''), invitee_phone),
              invitee_name = COALESCE(NULLIF(?, ''), invitee_name),
              registered_at = NOW(),
              updated_at = NOW()
        WHERE id = ?`,
      [emailRaw || null, phoneRaw || null, nameRaw || null, invite.id]
    );

    await logInviteEvent(invite.id, invite.inviter_provider_id, 'registered', {
      invitee_email: emailRaw || null,
      invitee_phone: phoneRaw || null
    });

    return res.json({ success: true });
  } catch (error: any) {
    Logger.error(MODULE, 'Error aceptando invitación', error);
    return res.status(500).json({ success: false, error: 'invite_accept_failed' });
  }
});

export default router;

