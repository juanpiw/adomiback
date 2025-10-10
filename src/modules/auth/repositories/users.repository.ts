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
  created_at: Date;
  updated_at: Date;
}

export class UsersRepository {
  private pool = DatabaseConnection.getPool();

  async findByEmail(email: string): Promise<UserRow | null> {
    const [rows] = await this.pool.query(
      'SELECT id, google_id, name, email, password, role, stripe_customer_id FROM users WHERE email = ? LIMIT 1',
      [email]
    );
    const arr = rows as any[];
    return arr.length ? (arr[0] as UserRow) : null;
  }

  async findById(id: number): Promise<UserRow | null> {
    const [rows] = await this.pool.query(
      'SELECT id, google_id, name, email, password, role FROM users WHERE id = ? LIMIT 1',
      [id]
    );
    const arr = rows as any[];
    return arr.length ? (arr[0] as UserRow) : null;
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
    const [result] = await this.pool.execute(
      'INSERT INTO users (google_id, email, name, role, password) VALUES (?, ?, ?, ?, NULL)',
      [googleId, email, name, role]
    );
    return (result as any).insertId as number;
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

