import { pool } from '../lib/db';

export interface UserVerification {
  id: number;
  user_id: number;
  document_type: 'id_card' | 'background_check';
  file_url: string;
  status: 'pending' | 'approved' | 'rejected';
  reviewed_by: number | null;
  notes: string | null;
  created_at: Date;
  updated_at: Date;
}

export interface CreateVerificationData {
  user_id: number;
  document_type: 'id_card' | 'background_check';
  file_url: string;
}

export interface UpdateVerificationData {
  status?: 'pending' | 'approved' | 'rejected';
  reviewed_by?: number;
  notes?: string;
}

/**
 * Crear una nueva verificación de documento
 */
export async function createUserVerification(data: CreateVerificationData): Promise<number> {
  const query = `
    INSERT INTO user_verifications (user_id, document_type, file_url)
    VALUES (?, ?, ?)
  `;
  
  const [result] = await pool.execute(query, [
    data.user_id,
    data.document_type,
    data.file_url
  ]);
  
  return (result as any).insertId;
}

/**
 * Obtener verificaciones por usuario
 */
export async function getUserVerifications(userId: number): Promise<UserVerification[]> {
  const query = `
    SELECT * FROM user_verifications 
    WHERE user_id = ? 
    ORDER BY created_at DESC
  `;
  
  const [rows] = await pool.execute(query, [userId]);
  return rows as UserVerification[];
}

/**
 * Obtener verificación por ID
 */
export async function getUserVerificationById(id: number): Promise<UserVerification | null> {
  const query = `
    SELECT * FROM user_verifications 
    WHERE id = ?
  `;
  
  const [rows] = await pool.execute(query, [id]);
  const verifications = rows as UserVerification[];
  return verifications.length > 0 ? verifications[0] : null;
}

/**
 * Actualizar estado de verificación
 */
export async function updateUserVerification(
  id: number, 
  data: UpdateVerificationData
): Promise<boolean> {
  const fields = [];
  const values = [];
  
  if (data.status !== undefined) {
    fields.push('status = ?');
    values.push(data.status);
  }
  
  if (data.reviewed_by !== undefined) {
    fields.push('reviewed_by = ?');
    values.push(data.reviewed_by);
  }
  
  if (data.notes !== undefined) {
    fields.push('notes = ?');
    values.push(data.notes);
  }
  
  if (fields.length === 0) {
    return false;
  }
  
  fields.push('updated_at = CURRENT_TIMESTAMP');
  values.push(id);
  
  const query = `
    UPDATE user_verifications 
    SET ${fields.join(', ')}
    WHERE id = ?
  `;
  
  const [result] = await pool.execute(query, values);
  return (result as any).affectedRows > 0;
}

/**
 * Obtener verificaciones pendientes (para admin)
 */
export async function getPendingVerifications(): Promise<UserVerification[]> {
  const query = `
    SELECT uv.*, u.email, u.name, u.role
    FROM user_verifications uv
    JOIN users u ON uv.user_id = u.id
    WHERE uv.status = 'pending'
    ORDER BY uv.created_at ASC
  `;
  
  const [rows] = await pool.execute(query);
  return rows as UserVerification[];
}

/**
 * Obtener estadísticas de verificaciones
 */
export async function getVerificationStats(): Promise<{
  total: number;
  pending: number;
  approved: number;
  rejected: number;
}> {
  const query = `
    SELECT 
      COUNT(*) as total,
      SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) as pending,
      SUM(CASE WHEN status = 'approved' THEN 1 ELSE 0 END) as approved,
      SUM(CASE WHEN status = 'rejected' THEN 1 ELSE 0 END) as rejected
    FROM user_verifications
  `;
  
  const [rows] = await pool.execute(query);
  const stats = (rows as any[])[0];
  
  return {
    total: stats.total || 0,
    pending: stats.pending || 0,
    approved: stats.approved || 0,
    rejected: stats.rejected || 0
  };
}

/**
 * Verificar si un usuario ya tiene verificaciones pendientes
 */
export async function hasPendingVerification(userId: number, documentType: string): Promise<boolean> {
  const query = `
    SELECT COUNT(*) as count
    FROM user_verifications 
    WHERE user_id = ? AND document_type = ? AND status = 'pending'
  `;
  
  const [rows] = await pool.execute(query, [userId, documentType]);
  const result = (rows as any[])[0];
  return result.count > 0;
}