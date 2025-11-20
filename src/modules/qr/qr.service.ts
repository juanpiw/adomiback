import path from 'path';
import { promises as fs } from 'fs';
import QRCode, { QRCodeToBufferOptions, QRCodeToStringOptions } from 'qrcode';

export type QrFormat = 'svg' | 'png';
export type QrErrorCorrectionLevel = 'L' | 'M' | 'Q' | 'H';

export interface GenerateQrOptions {
  data?: string;
  size?: number;
  margin?: number;
  ecc?: QrErrorCorrectionLevel | string;
}

const DEFAULT_URL = process.env.QR_MARKETING_URL || 'https://www.adomiapp.cl';
const DEFAULT_SIZE = 1024;
const DEFAULT_MARGIN = 2;
const MIN_SIZE = 128;
const MAX_SIZE = 4096;
const MIN_MARGIN = 0;
const MAX_MARGIN = 16;
const DEFAULT_ECC: QrErrorCorrectionLevel = 'H';

const ECC_VALUES: ReadonlyArray<QrErrorCorrectionLevel> = ['L', 'M', 'Q', 'H'];

interface NormalizedOptions {
  data: string;
  width: number;
  margin: number;
  errorCorrectionLevel: QrErrorCorrectionLevel;
}

export const DEFAULT_QR_URL = DEFAULT_URL;
export const DEFAULT_QR_SIZE = DEFAULT_SIZE;
export const DEFAULT_QR_MARGIN = DEFAULT_MARGIN;
export const DEFAULT_QR_ECC = DEFAULT_ECC;
export const QR_ERROR_CORRECTION_VALUES = ECC_VALUES;
export const QR_SIZE_LIMITS = { min: MIN_SIZE, max: MAX_SIZE };
export const QR_MARGIN_LIMITS = { min: MIN_MARGIN, max: MAX_MARGIN };

export class QrService {
  getDefaultUrl(): string {
    return DEFAULT_URL;
  }

  private normalizeOptions(options?: GenerateQrOptions): NormalizedOptions {
    return {
      data: this.normalizeData(options?.data),
      width: this.normalizeSize(options?.size),
      margin: this.normalizeMargin(options?.margin),
      errorCorrectionLevel: this.normalizeEcc(options?.ecc)
    };
  }

  private normalizeData(data?: string): string {
    if (!data || typeof data !== 'string') {
      return DEFAULT_URL;
    }

    const trimmed = data.trim();
    if (!trimmed) {
      return DEFAULT_URL;
    }

    // Limit to 1024 chars to avoid generating unnecessarily large SVGs.
    return trimmed.slice(0, 1024);
  }

  private normalizeSize(size?: number): number {
    if (!size || Number.isNaN(size)) {
      return DEFAULT_SIZE;
    }

    const rounded = Math.round(size);
    return Math.min(Math.max(rounded, MIN_SIZE), MAX_SIZE);
  }

  private normalizeMargin(margin?: number): number {
    if (typeof margin !== 'number' || Number.isNaN(margin)) {
      return DEFAULT_MARGIN;
    }

    const clamped = Math.min(Math.max(Math.round(margin), MIN_MARGIN), MAX_MARGIN);
    return clamped;
  }

  private normalizeEcc(ecc?: QrErrorCorrectionLevel | string): QrErrorCorrectionLevel {
    if (!ecc) {
      return DEFAULT_ECC;
    }

    const normalized = String(ecc).toUpperCase() as QrErrorCorrectionLevel;
    if ((ECC_VALUES as readonly string[]).includes(normalized)) {
      return normalized;
    }

    return DEFAULT_ECC;
  }

  async generateSvg(options?: GenerateQrOptions): Promise<string> {
    const normalized = this.normalizeOptions(options);
    const qrOptions: QRCodeToStringOptions = {
      type: 'svg',
      width: normalized.width,
      margin: normalized.margin,
      errorCorrectionLevel: normalized.errorCorrectionLevel
    };

    return QRCode.toString(normalized.data, qrOptions);
  }

  async generatePng(options?: GenerateQrOptions): Promise<Buffer> {
    const normalized = this.normalizeOptions(options);
    const qrOptions: QRCodeToBufferOptions = {
      type: 'png',
      width: normalized.width,
      margin: normalized.margin,
      errorCorrectionLevel: normalized.errorCorrectionLevel
    };

    return QRCode.toBuffer(normalized.data, qrOptions);
  }

  async generateToFile(format: QrFormat, outputPath: string, options?: GenerateQrOptions): Promise<string> {
    const absolutePath = path.resolve(outputPath);
    const dir = path.dirname(absolutePath);
    await fs.mkdir(dir, { recursive: true });

    if (format === 'svg') {
      const svg = await this.generateSvg(options);
      await fs.writeFile(absolutePath, svg, 'utf8');
      return absolutePath;
    }

    const png = await this.generatePng(options);
    await fs.writeFile(absolutePath, png);
    return absolutePath;
  }
}


