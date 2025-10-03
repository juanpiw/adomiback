import { pool, executeQuery } from '../lib/db';

export type UserRow = {
  id: number;
  google_id: string | null;
  name: string | null;
  email: string;
  password: string | null;
  role: 'client' | 'provider';
};

export async function getUserByEmail(email: string): Promise<UserRow | null> {
  const [rows] = await executeQuery('SELECT id, google_id, name, email, password, role FROM users WHERE email = ? LIMIT 1', [email]);
  const arr = rows as any[];
  return arr.length ? (arr[0] as UserRow) : null;
}

export async function createUser(email: string, passwordHash: string | null, role: 'client'|'provider' = 'client', name: string | null = null): Promise<number> {
  const safeName = (name && name.trim().length > 0) ? name : (email.split('@')[0] || 'Usuario');
  const [result] = await executeQuery(
    'INSERT INTO users (email, password, role, name) VALUES (?, ?, ?, ?)',
    [email, passwordHash, role, safeName]
  );
  // @ts-ignore
  return result.insertId as number;
}

export async function getUserById(id: number): Promise<UserRow | null> {
  const [rows] = await pool.query('SELECT id, google_id, name, email, password, role FROM users WHERE id = ? LIMIT 1', [id]);
  const arr = rows as any[];
  return arr.length ? (arr[0] as UserRow) : null;
}

export async function updateUserPassword(userId: number, passwordHash: string): Promise<void> {
  await pool.execute(
    'UPDATE users SET password = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
    [passwordHash, userId]
  );
}

export async function updateUser(userId: number, updates: {
  name?: string;
  email?: string;
  role?: 'client' | 'provider';
  active_plan_id?: number;
}): Promise<{ success: boolean; error?: string }> {
  try {
    const fields = [];
    const values = [];

    if (updates.name !== undefined) {
      fields.push('name = ?');
      values.push(updates.name);
    }
    if (updates.email !== undefined) {
      fields.push('email = ?');
      values.push(updates.email);
    }
    if (updates.role !== undefined) {
      fields.push('role = ?');
      values.push(updates.role);
    }
    if (updates.active_plan_id !== undefined) {
      fields.push('active_plan_id = ?');
      values.push(updates.active_plan_id);
    }

    if (fields.length === 0) {
      return { success: false, error: 'No hay campos para actualizar' };
    }

    fields.push('updated_at = CURRENT_TIMESTAMP');
    values.push(userId);

    await pool.execute(
      `UPDATE users SET ${fields.join(', ')} WHERE id = ?`,
      values
    );

    return { success: true };
  } catch (error: any) {
    console.error('[USERS][UPDATE][ERROR]', error);
    return { success: false, error: error.message };
  }
}
