import { pool } from './db';
import { v4 as uuidv4 } from 'uuid';

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

/**
 * Crear refresh token en la base de datos
 */
export async function createRefreshToken(
  userId: number, 
  jti: string, 
  expiresAt: Date
): Promise<{ success: boolean; tokenId?: number; error?: string }> {
  try {
    const token = uuidv4();
    
    const [result] = await pool.execute(
      `INSERT INTO refresh_tokens (user_id, token, jti, expires_at, is_revoked, created_at, updated_at) 
       VALUES (?, ?, ?, ?, FALSE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
      [userId, token, jti, expiresAt]
    );

    // @ts-ignore
    const tokenId = result.insertId as number;

    return { success: true, tokenId };
  } catch (error: any) {
    console.error('[REFRESH_TOKENS][CREATE][ERROR]', error);
    return { success: false, error: error.message };
  }
}

/**
 * Verificar refresh token
 */
export async function verifyRefreshToken(
  token: string
): Promise<{ success: boolean; tokenData?: RefreshTokenRow; error?: string }> {
  try {
    const [rows] = await pool.query(
      `SELECT id, user_id, token, jti, expires_at, is_revoked, created_at, updated_at 
       FROM refresh_tokens 
       WHERE token = ? AND is_revoked = FALSE AND expires_at > NOW() 
       LIMIT 1`,
      [token]
    );

    const arr = rows as any[];
    if (arr.length === 0) {
      return { success: false, error: 'Token no encontrado o expirado' };
    }

    const tokenData = arr[0] as RefreshTokenRow;
    return { success: true, tokenData };
  } catch (error: any) {
    console.error('[REFRESH_TOKENS][VERIFY][ERROR]', error);
    return { success: false, error: error.message };
  }
}

/**
 * Revocar refresh token
 */
export async function revokeRefreshToken(
  token: string
): Promise<{ success: boolean; error?: string }> {
  try {
    await pool.execute(
      'UPDATE refresh_tokens SET is_revoked = TRUE, updated_at = CURRENT_TIMESTAMP WHERE token = ?',
      [token]
    );

    return { success: true };
  } catch (error: any) {
    console.error('[REFRESH_TOKENS][REVOKE][ERROR]', error);
    return { success: false, error: error.message };
  }
}

/**
 * Revocar todos los refresh tokens de un usuario
 */
export async function revokeAllUserTokens(
  userId: number
): Promise<{ success: boolean; revokedCount?: number; error?: string }> {
  try {
    const [result] = await pool.execute(
      'UPDATE refresh_tokens SET is_revoked = TRUE, updated_at = CURRENT_TIMESTAMP WHERE user_id = ? AND is_revoked = FALSE',
      [userId]
    );

    // @ts-ignore
    const revokedCount = result.affectedRows as number;

    return { success: true, revokedCount };
  } catch (error: any) {
    console.error('[REFRESH_TOKENS][REVOKE_ALL][ERROR]', error);
    return { success: false, error: error.message };
  }
}

/**
 * Limpiar tokens expirados
 */
export async function cleanupExpiredTokens(): Promise<{ success: boolean; deletedCount?: number; error?: string }> {
  try {
    const [result] = await pool.execute(
      'DELETE FROM refresh_tokens WHERE expires_at < NOW() OR is_revoked = TRUE',
      []
    );

    // @ts-ignore
    const deletedCount = result.affectedRows as number;

    console.log(`[REFRESH_TOKENS][CLEANUP] Eliminados ${deletedCount} tokens expirados`);
    return { success: true, deletedCount };
  } catch (error: any) {
    console.error('[REFRESH_TOKENS][CLEANUP][ERROR]', error);
    return { success: false, error: error.message };
  }
}

/**
 * Obtener tokens activos de un usuario
 */
export async function getUserActiveTokens(
  userId: number
): Promise<{ success: boolean; tokens?: RefreshTokenRow[]; error?: string }> {
  try {
    const [rows] = await pool.query(
      `SELECT id, user_id, token, jti, expires_at, is_revoked, created_at, updated_at 
       FROM refresh_tokens 
       WHERE user_id = ? AND is_revoked = FALSE AND expires_at > NOW() 
       ORDER BY created_at DESC`,
      [userId]
    );

    const tokens = rows as RefreshTokenRow[];
    return { success: true, tokens };
  } catch (error: any) {
    console.error('[REFRESH_TOKENS][GET_USER_TOKENS][ERROR]', error);
    return { success: false, error: error.message };
  }
}

/**
 * Verificar si un JTI ya existe (para prevenir duplicados)
 */
export async function isJtiUnique(
  jti: string
): Promise<{ success: boolean; isUnique?: boolean; error?: string }> {
  try {
    const [rows] = await pool.query(
      'SELECT id FROM refresh_tokens WHERE jti = ? LIMIT 1',
      [jti]
    );

    const arr = rows as any[];
    return { success: true, isUnique: arr.length === 0 };
  } catch (error: any) {
    console.error('[REFRESH_TOKENS][CHECK_JTI][ERROR]', error);
    return { success: false, error: error.message };
  }
}

/**
 * Iniciar limpieza automática de tokens (ejecutar cada hora)
 */
export function startTokenCleanup(): void {
  console.log('[REFRESH_TOKENS] Iniciando limpieza automática de tokens...');
  
  // Ejecutar inmediatamente
  cleanupExpiredTokens();

  // Ejecutar cada hora
  setInterval(() => {
    cleanupExpiredTokens();
  }, 60 * 60 * 1000); // 1 hora

  console.log('[REFRESH_TOKENS] Limpieza automática iniciada (cada hora)');
}

