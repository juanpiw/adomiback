import { strict as assert } from 'assert';
import fs from 'fs/promises';
import path from 'path';
import {
  DEFAULT_QR_ECC,
  DEFAULT_QR_MARGIN,
  DEFAULT_QR_SIZE,
  QrService,
  QR_MARGIN_LIMITS,
  QR_SIZE_LIMITS
} from '../../modules/qr/qr.service';

const TMP_DIR = path.resolve(__dirname, '../../../tmp/qr-tests');

async function ensureTmpDir() {
  await fs.mkdir(TMP_DIR, { recursive: true });
}

async function cleanupTmpDir() {
  try {
    await fs.rm(TMP_DIR, { recursive: true, force: true });
  } catch {
    // ignore
  }
}

async function runQrServiceTests() {
  console.log('🧪 Ejecutando pruebas de QrService...');
  const service = new QrService();

  const svg = await service.generateSvg({ data: 'https://test.adomiapp.cl', size: 256, margin: 1, ecc: 'M' });
  assert.ok(svg.startsWith('<svg'), 'El SVG debe comenzar con <svg');
  assert.ok(svg.includes('width="256"'), 'El SVG debe respetar el tamaño solicitado');

  const png = await service.generatePng({ data: 'https://test.adomiapp.cl', size: 512 });
  assert.ok(Buffer.isBuffer(png), 'El PNG debe ser un Buffer');
  assert.ok(png.length > 0, 'El PNG no debe estar vacío');

  await ensureTmpDir();
  const svgPath = path.join(TMP_DIR, 'qr-test.svg');
  const pngPath = path.join(TMP_DIR, 'qr-test.png');

  const savedSvg = await service.generateToFile('svg', svgPath, { data: 'https://test-save.adomiapp.cl' });
  const savedPng = await service.generateToFile('png', pngPath, { data: 'https://test-save.adomiapp.cl' });

  const svgStats = await fs.stat(savedSvg);
  const pngStats = await fs.stat(savedPng);
  assert.ok(svgStats.size > 0, 'El archivo SVG generado debe tener contenido');
  assert.ok(pngStats.size > 0, 'El archivo PNG generado debe tener contenido');

  const fallbackSvg = await service.generateSvg({ size: 0, margin: -2, ecc: 'x' as any });
  assert.ok(fallbackSvg.includes(`width="${DEFAULT_QR_SIZE}"`), 'Tamaño inválido debe usar el default');

  const fallbackService = new QrService();
  const fallbackPng = await fallbackService.generatePng({});
  assert.ok(fallbackPng.length > 0, 'Debe generar PNG con defaults sin opciones');

  assert.equal(service.getDefaultUrl().length > 0, true, 'URL por defecto no debe estar vacía');
  assert.deepEqual(QR_SIZE_LIMITS, { min: 128, max: 4096 }, 'Los límites de tamaño esperados deben coincidir');
  assert.deepEqual(QR_MARGIN_LIMITS, { min: 0, max: 16 }, 'Los límites de margen esperados deben coincidir');
  assert.equal(DEFAULT_QR_MARGIN, 2, 'Margen default debe ser 2');
  assert.equal(DEFAULT_QR_ECC, 'H', 'ECC default debe ser H');

  console.log('✅ Pruebas de QrService completadas correctamente.');
}

if (require.main === module) {
  runQrServiceTests()
    .then(() => cleanupTmpDir())
    .then(() => process.exit(0))
    .catch(async (error) => {
      console.error('❌ Pruebas de QrService fallaron:', error);
      await cleanupTmpDir();
      process.exit(1);
    });
}



