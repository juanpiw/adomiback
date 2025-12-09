import path from 'path';
import { Logger } from '../shared/utils/logger.util';
import {
  DEFAULT_QR_ECC,
  DEFAULT_QR_MARGIN,
  DEFAULT_QR_SIZE,
  QrErrorCorrectionLevel,
  QrFormat,
  QrService
} from '../modules/qr/qr.service';

const MODULE = 'QrBuildScript';
const DEFAULT_FORMATS: ReadonlyArray<QrFormat> = ['svg', 'png'];
const OUTPUT_FILENAME = process.env.QR_FILENAME_PREFIX || 'adomi-qr';

const parseFormats = (value?: string): QrFormat[] => {
  if (!value) {
    return [...DEFAULT_FORMATS];
  }
  return value
    .split(',')
    .map((token) => token.trim().toLowerCase())
    .filter((token): token is QrFormat => token === 'svg' || token === 'png');
};

const parseNumberEnv = (name: string, fallback: number): number => {
  const value = process.env[name];
  if (!value) return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

async function run() {
  const service = new QrService();
  const projectRoot = path.resolve(__dirname, '../../..');
  const defaultOutput = path.join(projectRoot, 'adomi-app', 'public', 'assets', 'qr');
  const outputDir = process.env.QR_BUILD_OUTPUT_DIR || defaultOutput;

  const url = process.env.QR_BUILD_URL || service.getDefaultUrl();
  const size = parseNumberEnv('QR_BUILD_SIZE', DEFAULT_QR_SIZE);
  const margin = parseNumberEnv('QR_BUILD_MARGIN', DEFAULT_QR_MARGIN);
  const ecc = (process.env.QR_BUILD_ECC || DEFAULT_QR_ECC) as QrErrorCorrectionLevel;
  const formats = parseFormats(process.env.QR_BUILD_FORMATS);

  Logger.info(MODULE, 'Generando assets QR', {
    urlLength: url.length,
    size,
    margin,
    ecc,
    formats,
    outputDir
  });

  for (const format of formats) {
    const filePath = path.join(outputDir, `${OUTPUT_FILENAME}.${format}`);
    await service.generateToFile(format, filePath, { data: url, size, margin, ecc });
    Logger.info(MODULE, `Archivo generado`, { format, filePath });
  }

  Logger.info(MODULE, 'Assets QR listos');
}

run().catch((error) => {
  Logger.error(MODULE, 'Error generando assets QR', error);
  process.exit(1);
});




