/**
 * Script para ejecutar el schema completo de la base de datos
 * Usa la configuración existente del backend
 */

require('dotenv').config();
const mysql = require('mysql2/promise');
const fs = require('fs');
const path = require('path');

async function runMigration() {
  console.log('🚀 Iniciando migración de base de datos...\n');
  
  // Configuración de conexión (desde .env)
  const config = {
    host: process.env.DB_HOST,
    port: process.env.DB_PORT || 3306,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    multipleStatements: true, // Importante para ejecutar múltiples queries
    ssl: {
      rejectUnauthorized: false
    }
  };

  console.log('📡 Configuración de conexión:');
  console.log(`   Host: ${config.host}`);
  console.log(`   Port: ${config.port}`);
  console.log(`   User: ${config.user}`);
  console.log(`   Database: ${config.database}\n`);

  let connection;

  try {
    // Conectar a la base de datos
    console.log('🔌 Conectando a Azure MySQL...');
    connection = await mysql.createConnection(config);
    console.log('✅ Conexión establecida\n');

    // Leer el archivo SQL
    console.log('📄 Leyendo DATABASE_SCHEMA_COMPLETE.sql...');
    const sqlFile = path.join(__dirname, 'DATABASE_SCHEMA_COMPLETE.sql');
    const sql = fs.readFileSync(sqlFile, 'utf8');
    console.log(`✅ Archivo leído (${sql.length} caracteres)\n`);

    // Dividir el SQL en statements individuales
    console.log('🔧 Ejecutando schema...\n');
    
    // Ejecutar el SQL completo
    const [results] = await connection.query(sql);
    
    console.log('✅ Schema ejecutado correctamente\n');

    // Verificar tablas creadas
    console.log('📊 Verificando tablas creadas...');
    const [tables] = await connection.query('SHOW TABLES');
    
    console.log(`\n✅ Total de tablas: ${tables.length}\n`);
    console.log('📋 Tablas creadas:');
    tables.forEach((table, index) => {
      const tableName = Object.values(table)[0];
      console.log(`   ${(index + 1).toString().padStart(2, '0')}. ${tableName}`);
    });

    // Verificar triggers
    console.log('\n🔄 Verificando triggers...');
    const [triggers] = await connection.query('SHOW TRIGGERS');
    console.log(`✅ Triggers creados: ${triggers.length}`);
    triggers.forEach(trigger => {
      console.log(`   • ${trigger.Trigger}`);
    });

    // Verificar datos en categorías
    console.log('\n📦 Verificando datos iniciales...');
    const [categories] = await connection.query('SELECT COUNT(*) as count FROM service_categories');
    console.log(`✅ Categorías de servicios: ${categories[0].count}`);

    const [settings] = await connection.query('SELECT COUNT(*) as count FROM platform_settings');
    console.log(`✅ Configuraciones de plataforma: ${settings[0].count}`);

    console.log('\n🎉 ¡Migración completada exitosamente!\n');
    
  } catch (error) {
    console.error('\n❌ Error durante la migración:');
    console.error('Código:', error.code);
    console.error('Mensaje:', error.message);
    console.error('SQL:', error.sql?.substring(0, 200));
    console.error('\nDetalles completos:', error);
    
    process.exit(1);
  } finally {
    if (connection) {
      await connection.end();
      console.log('🔌 Conexión cerrada');
    }
  }
}

// Ejecutar migración
runMigration();









