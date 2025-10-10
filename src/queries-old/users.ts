import { pool, executeQuery } from '../lib/db';

export type UserRow = {
  id: number;
  google_id: string | null;
  name: string | null;
  email: string;
  password: string | null;
  role: 'client' | 'provider';
  stripe_customer_id?: string | null;
};

export async function getUserByEmail(email: string): Promise<UserRow | null> {
  console.log('[USERS][GET_BY_EMAIL] 🔍 Buscando usuario por email:', email);
  
  try {
    const [rows] = await executeQuery('SELECT id, google_id, name, email, password, role, stripe_customer_id FROM users WHERE email = ? LIMIT 1', [email]);
    const arr = rows as any[];
    const user = arr.length ? (arr[0] as UserRow) : null;
    
    if (user) {
      console.log('[USERS][GET_BY_EMAIL] ✅ Usuario encontrado:', {
        id: user.id,
        email: user.email,
        role: user.role,
        google_id: user.google_id ? 'Vinculado' : 'No vinculado'
      });
    } else {
      console.log('[USERS][GET_BY_EMAIL] ⚠️ Usuario NO encontrado para email:', email);
    }
    
    return user;
  } catch (error: any) {
    console.error('[USERS][GET_BY_EMAIL] ❌ ERROR:', error);
    throw error;
  }
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

export async function createGoogleUser(googleId: string, email: string, name: string, role: 'client'|'provider' = 'client'): Promise<number> {
  console.log('[USERS][CREATE_GOOGLE_USER] 🚀 Iniciando creación de usuario Google');
  console.log('[USERS][CREATE_GOOGLE_USER] 📝 Datos recibidos:', {
    googleId,
    email,
    name,
    role
  });
  
  try {
    const [result] = await executeQuery(
      'INSERT INTO users (google_id, email, name, role, password) VALUES (?, ?, ?, ?, NULL)',
      [googleId, email, name, role]
    );
    // @ts-ignore
    const insertId = result.insertId as number;
    
    console.log('[USERS][CREATE_GOOGLE_USER] ✅ Usuario creado exitosamente con ID:', insertId);
    return insertId;
  } catch (error: any) {
    console.error('[USERS][CREATE_GOOGLE_USER] ❌ ERROR al crear usuario:', error);
    console.error('[USERS][CREATE_GOOGLE_USER] 🔍 Detalles del error:', {
      message: error.message,
      code: error.code,
      errno: error.errno,
      sql: error.sql,
      sqlMessage: error.sqlMessage
    });
    throw error;
  }
}

export async function getUserByGoogleId(googleId: string): Promise<UserRow | null> {
  console.log('[USERS][GET_BY_GOOGLE_ID] 🔍 Buscando usuario por Google ID:', googleId);
  
  try {
    const [rows] = await executeQuery('SELECT id, google_id, name, email, password, role FROM users WHERE google_id = ? LIMIT 1', [googleId]);
    const arr = rows as any[];
    const user = arr.length ? (arr[0] as UserRow) : null;
    
    if (user) {
      console.log('[USERS][GET_BY_GOOGLE_ID] ✅ Usuario encontrado:', {
        id: user.id,
        email: user.email,
        role: user.role
      });
    } else {
      console.log('[USERS][GET_BY_GOOGLE_ID] ⚠️ Usuario NO encontrado para Google ID:', googleId);
    }
    
    return user;
  } catch (error: any) {
    console.error('[USERS][GET_BY_GOOGLE_ID] ❌ ERROR:', error);
    throw error;
  }
}

export async function linkGoogleAccount(userId: number, googleId: string): Promise<{ success: boolean; error?: string }> {
  try {
    await executeQuery(
      'UPDATE users SET google_id = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
      [googleId, userId]
    );
    return { success: true };
  } catch (error: any) {
    console.error('[USERS][LINK_GOOGLE][ERROR]', error);
    return { success: false, error: error.message };
  }
}

export async function unlinkGoogleAccount(userId: number): Promise<{ success: boolean; error?: string }> {
  try {
    await executeQuery(
      'UPDATE users SET google_id = NULL, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
      [userId]
    );
    return { success: true };
  } catch (error: any) {
    console.error('[USERS][UNLINK_GOOGLE][ERROR]', error);
    return { success: false, error: error.message };
  }
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

export async function getUserByStripeCustomerId(stripeCustomerId: string): Promise<UserRow | null> {
  const [rows] = await executeQuery('SELECT id, google_id, name, email, password, role, stripe_customer_id FROM users WHERE stripe_customer_id = ? LIMIT 1', [stripeCustomerId]);
  const arr = rows as any[];
  return arr.length ? (arr[0] as UserRow) : null;
}

export async function updateUserStripeCustomerId(userId: number, stripeCustomerId: string): Promise<{ success: boolean; error?: string }> {
  try {
    await executeQuery(
      'UPDATE users SET stripe_customer_id = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
      [stripeCustomerId, userId]
    );
    console.log('[USERS][STRIPE_CUSTOMER] Updated stripe_customer_id for user:', userId);
    return { success: true };
  } catch (error: any) {
    console.error('[USERS][STRIPE_CUSTOMER][ERROR]', error);
    return { success: false, error: error.message };
  }
}
