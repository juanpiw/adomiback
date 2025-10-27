/**
 * Users Repository
 * Handles all database operations for users table
 */

import DatabaseConnection from '../../../shared/database/connection';

export interface UserRow {
  id: number;
  google_id: string | null;
  name: string | null;
  email: string;
  password: string | null;
  role: 'client' | 'provider';
  stripe_customer_id?: string | null;
  pending_role?: 'provider' | null;
  pending_plan_id?: number | null;
  pending_started_at?: Date | null;
  created_at: Date;
  updated_at: Date;
}

export class UsersRepository {
  private pool = DatabaseConnection.getPool();

  async findByEmail(email: string): Promise<UserRow | null> {
    const [rows] = await this.pool.query(
      'SELECT id, google_id, name, email, password, role, stripe_customer_id, pending_role, pending_plan_id, pending_started_at FROM users WHERE email = ? LIMIT 1',
      [email]
    );
    const arr = rows as any[];
    return arr.length ? (arr[0] as UserRow) : null;
  }

  async findById(id: number): Promise<UserRow | null> {
    console.log('[USERS_REPO] findById llamado con ID:', id);
    const [rows] = await this.pool.query(
      'SELECT id, google_id, name, email, password, role, pending_role, pending_plan_id, pending_started_at FROM users WHERE id = ? LIMIT 1',
      [id]
    );
    const arr = rows as any[];
    const user = arr.length ? (arr[0] as UserRow) : null;
    console.log('[USERS_REPO] Usuario encontrado:', user ? { id: user.id, email: user.email, role: user.role } : 'null');
    return user;
  }

  async create(email: string, passwordHash: string | null, role: 'client' | 'provider' = 'client', name: string | null = null): Promise<number> {
    const safeName = (name && name.trim().length > 0) ? name : (email.split('@')[0] || 'Usuario');
    const [result] = await this.pool.execute(
      'INSERT INTO users (email, password, role, name) VALUES (?, ?, ?, ?)',
      [email, passwordHash, role, safeName]
    );
    return (result as any).insertId as number;
  }

  async createGoogleUser(googleId: string, email: string, name: string, role: 'client' | 'provider' = 'client'): Promise<number> {
    console.log('[USERS_REPO] createGoogleUser llamado con:', { googleId, email, name, role });
    const [result] = await this.pool.execute(
      'INSERT INTO users (google_id, email, name, role, password) VALUES (?, ?, ?, ?, NULL)',
      [googleId, email, name, role]
    );
    const insertId = (result as any).insertId as number;
    console.log('[USERS_REPO] Usuario creado con ID:', insertId);
    return insertId;
  }

  async setPendingRole(userId: number, role: 'provider', planId: number | null = null): Promise<void> {
    await this.pool.execute(
      'UPDATE users SET pending_role = ?, pending_plan_id = ?, pending_started_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
      [role, planId, userId]
    );
  }

  async promoteToProviderFromPending(userId: number): Promise<void> {
    await this.pool.execute(
      "UPDATE users SET role = CASE WHEN pending_role = 'provider' THEN 'provider' ELSE role END, pending_role = NULL, pending_plan_id = NULL, pending_started_at = NULL, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
      [userId]
    );
  }

  async findByGoogleId(googleId: string): Promise<UserRow | null> {
    const [rows] = await this.pool.query(
      'SELECT id, google_id, name, email, password, role FROM users WHERE google_id = ? LIMIT 1',
      [googleId]
    );
    const arr = rows as any[];
    return arr.length ? (arr[0] as UserRow) : null;
  }

  async updatePassword(userId: number, passwordHash: string): Promise<void> {
    await this.pool.execute(
      'UPDATE users SET password = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
      [passwordHash, userId]
    );
  }

  async linkGoogleAccount(userId: number, googleId: string): Promise<{ success: boolean; error?: string }> {
    try {
      await this.pool.execute(
        'UPDATE users SET google_id = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
        [googleId, userId]
      );
      return { success: true };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  }

  async unlinkGoogleAccount(userId: number): Promise<{ success: boolean; error?: string }> {
    try {
      await this.pool.execute(
        'UPDATE users SET google_id = NULL, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
        [userId]
      );
      return { success: true };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  }

  async findByStripeCustomerId(stripeCustomerId: string): Promise<UserRow | null> {
    const [rows] = await this.pool.query(
      'SELECT id, google_id, name, email, password, role, stripe_customer_id FROM users WHERE stripe_customer_id = ? LIMIT 1',
      [stripeCustomerId]
    );
    const arr = rows as any[];
    return arr.length ? (arr[0] as UserRow) : null;
  }

  async updateStripeCustomerId(userId: number, stripeCustomerId: string): Promise<{ success: boolean; error?: string }> {
    try {
      await this.pool.execute(
        'UPDATE users SET stripe_customer_id = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
        [stripeCustomerId, userId]
      );
      return { success: true };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  }
}

