import { pool } from '../lib/db';
import crypto from 'crypto';

export type PasswordResetTokenRow = {
  id: number;
  user_id: number;
  token: string;
  expires_at: Date;
  used: boolean;
  created_at: Date;
};

export async function createPasswordResetToken(userId: number): Promise<string> {
  // Generar token único
  const token = crypto.randomBytes(32).toString('hex');
  
  // Expira en 1 hora
  const expiresAt = new Date();
  expiresAt.setHours(expiresAt.getHours() + 1);
  
  // Insertar token en la base de datos
  await pool.execute(
    'INSERT INTO password_reset_tokens (user_id, token, expires_at) VALUES (?, ?, ?)',
    [userId, token, expiresAt]
  );
  
  return token;
}

export async function getPasswordResetToken(token: string): Promise<PasswordResetTokenRow | null> {
  const [rows] = await pool.query(
    'SELECT * FROM password_reset_tokens WHERE token = ? AND used = FALSE AND expires_at > NOW()',
    [token]
  );
  
  const arr = rows as any[];
  return arr.length ? (arr[0] as PasswordResetTokenRow) : null;
}

export async function markTokenAsUsed(token: string): Promise<void> {
  await pool.execute(
    'UPDATE password_reset_tokens SET used = TRUE WHERE token = ?',
    [token]
  );
}

export async function cleanupExpiredTokens(): Promise<void> {
  await pool.execute(
    'DELETE FROM password_reset_tokens WHERE expires_at < NOW() OR used = TRUE'
  );
}

