/**
 * Refresh Tokens Repository
 * Handles refresh tokens storage and validation
 */

import DatabaseConnection from '../../../shared/database/connection';

export interface RefreshTokenRow {
  id: number;
  user_id: number;
  token: string;
  jti: string;
  expires_at: Date;
  is_revoked: boolean;
  created_at: Date;
  updated_at: Date;
}

export class RefreshTokensRepository {
  private pool = DatabaseConnection.getPool();

  async create(userId: number, jti: string, expiresAt: Date): Promise<number> {
    const [result] = await this.pool.execute(
      'INSERT INTO refresh_tokens (user_id, token, jti, expires_at) VALUES (?, ?, ?, ?)',
      [userId, jti, jti, expiresAt]
    );
    return (result as any).insertId;
  }

  async findByJti(jti: string): Promise<RefreshTokenRow | null> {
    const [rows] = await this.pool.query(
      'SELECT * FROM refresh_tokens WHERE jti = ? LIMIT 1',
      [jti]
    );
    const arr = rows as any[];
    return arr.length ? (arr[0] as RefreshTokenRow) : null;
  }

  async revoke(jti: string): Promise<void> {
    await this.pool.execute(
      'UPDATE refresh_tokens SET is_revoked = TRUE, updated_at = CURRENT_TIMESTAMP WHERE jti = ?',
      [jti]
    );
  }

  async revokeAllForUser(userId: number): Promise<number> {
    const [result] = await this.pool.execute(
      'UPDATE refresh_tokens SET is_revoked = TRUE, updated_at = CURRENT_TIMESTAMP WHERE user_id = ? AND is_revoked = FALSE',
      [userId]
    );
    return (result as any).affectedRows;
  }

  async cleanExpired(): Promise<void> {
    await this.pool.execute(
      'DELETE FROM refresh_tokens WHERE expires_at < NOW() OR is_revoked = TRUE'
    );
  }
}

