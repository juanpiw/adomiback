/**
 * Password Reset Repository
 * Handles password reset tokens
 */

import DatabaseConnection from '../../../shared/database/connection';
import { v4 as uuidv4 } from 'uuid';

export interface PasswordResetTokenRow {
  id: number;
  user_id: number;
  token: string;
  expires_at: Date;
  used: boolean;
  created_at: Date;
}

export class PasswordResetRepository {
  private pool = DatabaseConnection.getPool();

  async create(userId: number): Promise<string> {
    const token = uuidv4();
    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + 1); // 1 hora de validez

    await this.pool.execute(
      'INSERT INTO password_reset_tokens (user_id, token, expires_at, used) VALUES (?, ?, ?, FALSE)',
      [userId, token, expiresAt]
    );

    return token;
  }

  async findByToken(token: string): Promise<PasswordResetTokenRow | null> {
    const [rows] = await this.pool.query(
      'SELECT * FROM password_reset_tokens WHERE token = ? AND used = FALSE AND expires_at > NOW() LIMIT 1',
      [token]
    );
    const arr = rows as any[];
    return arr.length ? (arr[0] as PasswordResetTokenRow) : null;
  }

  async markAsUsed(token: string): Promise<void> {
    await this.pool.execute(
      'UPDATE password_reset_tokens SET used = TRUE WHERE token = ?',
      [token]
    );
  }

  async cleanExpired(): Promise<void> {
    await this.pool.execute(
      'DELETE FROM password_reset_tokens WHERE expires_at < NOW() OR used = TRUE'
    );
  }
}

