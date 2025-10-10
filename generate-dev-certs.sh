#!/bin/bash

# Script para generar certificados SSL auto-firmados para desarrollo local
# Basado en la guía de implementación HTTPS para Adomi Backend

echo "🔐 Generando certificados SSL para desarrollo local..."

# Crear directorio para certificados si no existe
mkdir -p ssl

# Generar certificado auto-firmado
openssl req -x509 -newkey rsa:4096 -keyout ssl/key.pem -out ssl/cert.pem -days 365 -nodes \
  -subj "/C=CL/ST=Region/L=Ciudad/O=Adomi/OU=Development/CN=localhost"

echo "✅ Certificados generados exitosamente:"
echo "   - ssl/key.pem (clave privada)"
echo "   - ssl/cert.pem (certificado público)"

echo ""
echo "📝 Configuración para .env de desarrollo:"
echo "HTTPS_PORT=3443"
echo "KEY_PATH=./ssl/key.pem"
echo "CERT_PATH=./ssl/cert.pem"
echo "HTTP_PORT=3000"

echo ""
echo "🚀 Para usar en desarrollo:"
echo "   1. Agrega las líneas anteriores a tu .env"
echo "   2. Reinicia el servidor con: npm run dev"
echo "   3. Accede a: https://localhost:3443"
echo ""
echo "⚠️  Nota: Los navegadores mostrarán advertencia de certificado no confiable"
echo "    Para desarrollo local, acepta la excepción de seguridad"




