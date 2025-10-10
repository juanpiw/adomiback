/**
 * Database Connection Manager
 * Singleton pattern for MySQL connection pool
 */

import mysql from 'mysql2/promise';

class DatabaseConnection {
  private static pool: mysql.Pool | null = null;

  /**
   * Get or create the connection pool
   */
  static getPool(): mysql.Pool {
    if (!this.pool) {
      this.pool = mysql.createPool({
        host: process.env.DB_HOST,
        port: process.env.DB_PORT ? Number(process.env.DB_PORT) : 3306,
        user: process.env.DB_USER,
        password: process.env.DB_PASSWORD,
        database: process.env.DB_NAME,
        waitForConnections: true,
        connectionLimit: 10,
        queueLimit: 0,
        acquireTimeout: 60000,
        ssl: {
          rejectUnauthorized: false
        }
      } as any);
    }
    return this.pool;
  }

  /**
   * Test database connection
   */
  static async testConnection(retries: number = 3): Promise<boolean> {
    for (let attempt = 1; attempt <= retries; attempt++) {
      try {
        console.log(`[DB] Attempting to connect... (attempt ${attempt}/${retries})`);
        const connection = await this.getPool().getConnection();
        await connection.ping();
        connection.release();
        console.log('[DB] ✅ Connection successful');
        return true;
      } catch (error: any) {
        console.error(`[DB] ❌ Connection failed (attempt ${attempt}/${retries}):`, error.message);
        if (attempt < retries) {
          await new Promise(resolve => setTimeout(resolve, 3000));
        }
      }
    }
    return false;
  }

  /**
   * Close all connections
   */
  static async close(): Promise<void> {
    if (this.pool) {
      await this.pool.end();
      this.pool = null;
      console.log('[DB] Connection pool closed');
    }
  }
}

export default DatabaseConnection;

