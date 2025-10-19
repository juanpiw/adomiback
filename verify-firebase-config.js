#!/usr/bin/env node

/**
 * Script para verificar la configuración de Firebase
 * Ejecutar: node verify-firebase-config.js
 */

require('dotenv').config();

console.log('🔍 Verificando configuración de Firebase...\n');

const projectId = process.env.FIREBASE_PROJECT_ID;
const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
const privateKey = process.env.FIREBASE_PRIVATE_KEY;

let errors = 0;

// Verificar FIREBASE_PROJECT_ID
if (!projectId) {
  console.error('❌ FIREBASE_PROJECT_ID no está configurado');
  errors++;
} else {
  console.log(`✅ FIREBASE_PROJECT_ID: ${projectId}`);
}

// Verificar FIREBASE_CLIENT_EMAIL
if (!clientEmail) {
  console.error('❌ FIREBASE_CLIENT_EMAIL no está configurado');
  errors++;
} else {
  console.log(`✅ FIREBASE_CLIENT_EMAIL: ${clientEmail}`);
}

// Verificar FIREBASE_PRIVATE_KEY
if (!privateKey) {
  console.error('❌ FIREBASE_PRIVATE_KEY no está configurado');
  errors++;
} else {
  console.log(`✅ FIREBASE_PRIVATE_KEY encontrado`);
  
  // Verificar formato de la clave
  const hasBegin = privateKey.includes('-----BEGIN PRIVATE KEY-----');
  const hasEnd = privateKey.includes('-----END PRIVATE KEY-----');
  const length = privateKey.length;
  
  console.log(`   - Longitud: ${length} caracteres`);
  console.log(`   - Tiene BEGIN: ${hasBegin ? '✅' : '❌'}`);
  console.log(`   - Tiene END: ${hasEnd ? '✅' : '❌'}`);
  
  if (!hasBegin || !hasEnd) {
    console.error('   ⚠️ La clave privada parece estar incompleta o mal formateada');
    errors++;
  } else if (length < 1600) {
    console.warn(`   ⚠️ La clave privada parece muy corta (${length} chars). Longitud esperada: ~1700`);
    errors++;
  } else {
    console.log('   ✅ Formato aparentemente correcto');
  }
  
  // Verificar saltos de línea
  const hasNewlines = privateKey.includes('\\n');
  if (!hasNewlines) {
    console.warn('   ⚠️ La clave no contiene \\n (saltos de línea escapados)');
    console.warn('   💡 Asegúrate de que los saltos de línea estén como \\n literalmente');
  } else {
    console.log('   ✅ Contiene \\n (saltos de línea escapados)');
  }
}

console.log('\n' + '='.repeat(50));

if (errors === 0) {
  console.log('✅ Configuración de Firebase parece correcta');
  console.log('\n💡 Si aún tienes errores, intenta:');
  console.log('   1. Regenerar la clave privada en Firebase Console');
  console.log('   2. Copiar el JSON completo');
  console.log('   3. Extraer el "private_key" exactamente como aparece');
  console.log('   4. Pegarlo en .env entre comillas dobles');
} else {
  console.error(`❌ Se encontraron ${errors} error(es) en la configuración`);
  console.log('\n📋 Pasos para corregir:');
  console.log('   1. Ve a: https://console.firebase.google.com/');
  console.log('   2. Project Settings → Service Accounts');
  console.log('   3. Generate new private key');
  console.log('   4. Copia el "private_key" del JSON');
  console.log('   5. Pega en .env como: FIREBASE_PRIVATE_KEY="-----BEGIN...\\n...\\n-----END..."');
}

console.log('='.repeat(50) + '\n');

process.exit(errors > 0 ? 1 : 0);

