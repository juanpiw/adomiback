import mysql from 'mysql2/promise';

console.log('[DB] Config:', {
  host: process.env.DB_HOST,
  port: process.env.DB_PORT,
  user: process.env.DB_USER,
  database: process.env.DB_NAME,
  password: process.env.DB_PASSWORD ? '***' : 'undefined'
});

export const pool = mysql.createPool({
  host: process.env.DB_HOST,
  port: process.env.DB_PORT ? Number(process.env.DB_PORT) : 3306,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  // Timeout configurations for Azure MySQL
  acquireTimeout: 60000, // 60 seconds to get connection
  // SSL configuration for Azure MySQL
  ssl: {
    rejectUnauthorized: false
  }
} as any);

// Initialize database tables
export async function initDatabase() {
  try {
        // Create users table
        await pool.execute(`
          CREATE TABLE IF NOT EXISTS users (
            id INT AUTO_INCREMENT PRIMARY KEY,
            google_id VARCHAR(255) NULL,
            name VARCHAR(255) NULL,
            email VARCHAR(255) UNIQUE NOT NULL,
            password VARCHAR(255) NULL,
            role ENUM('client', 'provider') NOT NULL DEFAULT 'client',
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
          )
        `);

        // Create promo_signups table
        await pool.execute(`
          CREATE TABLE IF NOT EXISTS promo_signups (
            id INT AUTO_INCREMENT PRIMARY KEY,
            nombre VARCHAR(255) NOT NULL,
            correo VARCHAR(255) NOT NULL,
            profesion VARCHAR(100) NOT NULL,
            notas TEXT,
            status ENUM('pending', 'contacted', 'converted', 'cancelled') DEFAULT 'pending',
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            
            INDEX idx_email (correo),
            INDEX idx_status (status),
            INDEX idx_profesion (profesion),
            INDEX idx_created_at (created_at),
            UNIQUE KEY unique_email (correo)
          )
        `);

    // Create service_categories table
    await pool.execute(`
      CREATE TABLE IF NOT EXISTS service_categories (
        id INT AUTO_INCREMENT PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        description TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Create services table
    await pool.execute(`
      CREATE TABLE IF NOT EXISTS services (
        id INT AUTO_INCREMENT PRIMARY KEY,
        category_id INT NOT NULL,
        name VARCHAR(255) NOT NULL,
        description TEXT,
        duration_minutes INT NOT NULL DEFAULT 60,
        price DECIMAL(10,2) NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (category_id) REFERENCES service_categories(id) ON DELETE CASCADE
      )
    `);

    // Create provider_services table
    await pool.execute(`
      CREATE TABLE IF NOT EXISTS provider_services (
        id INT AUTO_INCREMENT PRIMARY KEY,
        provider_id INT NOT NULL,
        service_id INT NOT NULL,
        is_active BOOLEAN DEFAULT TRUE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (provider_id) REFERENCES users(id) ON DELETE CASCADE,
        FOREIGN KEY (service_id) REFERENCES services(id) ON DELETE CASCADE,
        UNIQUE KEY unique_provider_service (provider_id, service_id)
      )
    `);

    // Create password_reset_tokens table
    await pool.execute(`
      CREATE TABLE IF NOT EXISTS password_reset_tokens (
        id INT AUTO_INCREMENT PRIMARY KEY,
        user_id INT NOT NULL,
        token VARCHAR(255) UNIQUE NOT NULL,
        expires_at TIMESTAMP NOT NULL,
        used BOOLEAN DEFAULT FALSE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      )
    `);

    // Create refresh_tokens table for JWT refresh tokens
    await pool.execute(`
      CREATE TABLE IF NOT EXISTS refresh_tokens (
        id INT AUTO_INCREMENT PRIMARY KEY,
        user_id INT NOT NULL,
        token VARCHAR(255) UNIQUE NOT NULL,
        jti VARCHAR(255) UNIQUE NOT NULL,
        expires_at TIMESTAMP NOT NULL,
        is_revoked BOOLEAN DEFAULT FALSE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
        INDEX idx_user_id (user_id),
        INDEX idx_token (token),
        INDEX idx_jti (jti),
        INDEX idx_expires_at (expires_at)
      )
    `);

    console.log('[DB] MySQL database tables initialized successfully');
  } catch (error) {
    console.error('[DB] Error initializing database:', error);
    throw error;
  }
}

// Test database connection with retry mechanism
export async function testConnection(retries: number = 3) {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      console.log(`[DB] Attempting to connect to database... (attempt ${attempt}/${retries})`);
      console.log('[DB] Connection config:', {
        host: process.env.DB_HOST,
        port: process.env.DB_PORT,
        user: process.env.DB_USER,
        database: process.env.DB_NAME,
        ssl: 'enabled',
        timeout: '60s'
      });
      
      const connection = await pool.getConnection();
      console.log('[DB] Connection established, testing ping...');
      
      await connection.ping();
      console.log('[DB] Ping successful');
      
      connection.release();
      console.log('[DB] Connection released');
      
      // Initialize tables
      console.log('[DB] Initializing database tables...');
      await initDatabase();
      
      console.log('[DB] ✅ Connected to MySQL database successfully');
      return true;
    } catch (error: any) {
      console.error(`[DB] ❌ Error connecting to database (attempt ${attempt}/${retries}):`);
      console.error('[DB] Error message:', error.message);
      console.error('[DB] Error code:', error.code);
      console.error('[DB] Error errno:', error.errno);
      console.error('[DB] Error sqlMessage:', error.sqlMessage);
      console.error('[DB] Error sqlState:', error.sqlState);
      
      if (error.code === 'ER_ACCESS_DENIED_ERROR') {
        console.error('[DB] 💡 Check your database credentials (username/password)');
      } else if (error.code === 'ENOTFOUND') {
        console.error('[DB] 💡 Check your database host and DNS resolution');
      } else if (error.code === 'ECONNREFUSED') {
        console.error('[DB] 💡 Check if the database server is running and accessible');
      } else if (error.code === 'ER_BAD_DB_ERROR') {
        console.error('[DB] 💡 Check if the database name exists');
      } else if (error.code === 'ETIMEDOUT') {
        console.error('[DB] 💡 Connection timeout - check network connectivity to Azure MySQL');
      }
      
      if (attempt < retries) {
        console.log(`[DB] Retrying connection in 5 seconds...`);
        await new Promise(resolve => setTimeout(resolve, 5000));
      }
    }
  }
  
  console.error('[DB] ❌ Failed to connect to database after all retry attempts');
  return false;
}

// Wrapper function for database queries with timeout handling
export async function executeQuery(query: string, params: any[] = [], retries: number = 3) {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      console.log(`[DB] Executing query (attempt ${attempt}/${retries}):`, query.substring(0, 100) + '...');
      const result = await pool.execute(query, params);
      console.log(`[DB] Query executed successfully`);
      return result;
    } catch (error: any) {
      console.error(`[DB] Query failed (attempt ${attempt}/${retries}):`, error.message);
      
      if (error.code === 'ETIMEDOUT' && attempt < retries) {
        console.log(`[DB] Retrying query in 3 seconds...`);
        await new Promise(resolve => setTimeout(resolve, 3000));
        continue;
      }
      
      throw error;
    }
  }
}
