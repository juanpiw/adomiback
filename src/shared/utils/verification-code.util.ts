/**
 * Utilidades para Códigos de Verificación
 * Sistema de verificación de servicios completados
 */

import { Logger } from './logger.util';

const MODULE = 'VERIFICATION_CODE';

/**
 * Genera un código de verificación de 4 dígitos
 * Rango: 1000-9999
 * @returns Código de 4 dígitos como string
 */
export function generateVerificationCode(): string {
  const code = Math.floor(1000 + Math.random() * 9000).toString();
  Logger.info(MODULE, `Código generado: ${code}`);
  return code;
}

/**
 * Valida que un código tenga el formato correcto
 * @param code - Código a validar
 * @returns true si es válido, false si no
 */
export function validateCodeFormat(code: string): boolean {
  if (!code) return false;
  
  // Debe ser exactamente 4 dígitos
  const isValid = /^\d{4}$/.test(code);
  
  if (!isValid) {
    Logger.warn(MODULE, `Código inválido: ${code}`);
  }
  
  return isValid;
}

/**
 * Compara dos códigos de forma segura
 * @param inputCode - Código ingresado por el usuario
 * @param storedCode - Código almacenado en la BD
 * @returns true si coinciden, false si no
 */
export function compareVerificationCodes(inputCode: string, storedCode: string): boolean {
  if (!inputCode || !storedCode) return false;
  
  // Comparación exacta (case-sensitive para números no aplica, pero por si acaso)
  const match = inputCode.trim() === storedCode.trim();
  
  if (match) {
    Logger.info(MODULE, '✅ Códigos coinciden');
  } else {
    Logger.warn(MODULE, '❌ Códigos NO coinciden');
  }
  
  return match;
}

/**
 * Sanitiza un código de entrada del usuario
 * @param code - Código a sanitizar
 * @returns Código limpio
 */
export function sanitizeCode(code: string): string {
  if (!code) return '';
  
  // Remover espacios, guiones, etc.
  return code.replace(/\D/g, '').trim();
}

