import express from 'express';
import request from 'supertest';
import { strict as assert } from 'assert';
import { setupQrModule } from '../../modules/qr';

async function runQrRoutesTests() {
  console.log('🧪 Ejecutando pruebas de integración para /qr...');
  const app = express();
  app.use(express.json());
  setupQrModule(app);

  const svgResponse = await request(app)
    .get('/qr/svg')
    .query({ url: 'https://integration.adomiapp.cl', size: 512, ecc: 'H' });

  const svgPayload = svgResponse.text ?? svgResponse.body?.toString?.('utf8') ?? '';
  assert.equal(svgResponse.status, 200, 'El endpoint /qr/svg debe responder 200');
  assert.equal(svgResponse.headers['content-type'], 'image/svg+xml; charset=utf-8');
  assert.ok(svgPayload.startsWith('<svg'), 'El cuerpo debe contener un SVG válido');

  const pngResponse = await request(app)
    .get('/qr/png')
    .query({ size: 256, margin: 1, download: '1' })
    .buffer()
    .parse((res, callback) => {
      const chunks: Buffer[] = [];
      res.on('data', (chunk: Buffer) => chunks.push(chunk));
      res.on('end', () => callback(null, Buffer.concat(chunks)));
    });

  assert.equal(pngResponse.status, 200, 'El endpoint /qr/png debe responder 200');
  assert.equal(pngResponse.headers['content-type'], 'image/png');
  assert.ok(Buffer.isBuffer(pngResponse.body), 'La respuesta PNG debe ser binaria');
  assert.equal(
    pngResponse.headers['content-disposition'],
    'attachment; filename="adomi-qr.png"',
    'Debe exponer encabezado de descarga cuando download=1'
  );

  const invalidFormat = await request(app).get('/qr/pdf');
  assert.equal(invalidFormat.status, 400, 'Formatos inválidos deben responder 400');
  assert.equal(invalidFormat.body?.error, 'FORMAT_NOT_SUPPORTED');

  const metaResponse = await request(app).get('/qr/meta');
  assert.equal(metaResponse.status, 200, 'El endpoint /qr/meta debe responder 200');
  assert.equal(metaResponse.body?.success, true);
  assert.ok(metaResponse.body?.defaults?.url, 'Meta debe incluir URL por defecto');

  console.log('✅ Pruebas de integración de /qr completadas.');
}

if (require.main === module) {
  runQrRoutesTests()
    .then(() => process.exit(0))
    .catch((error) => {
      console.error('❌ Pruebas de integración de /qr fallaron:', error);
      process.exit(1);
    });
}


