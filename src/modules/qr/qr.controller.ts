import { Request, Response, Router } from 'express';
import { Logger } from '../../shared/utils/logger.util';
import {
  DEFAULT_QR_ECC,
  DEFAULT_QR_MARGIN,
  DEFAULT_QR_SIZE,
  QrService,
  QR_ERROR_CORRECTION_VALUES,
  QR_MARGIN_LIMITS,
  QR_SIZE_LIMITS,
  QrErrorCorrectionLevel,
  QrFormat
} from './qr.service';

const MODULE = 'QrController';
const CACHE_SECONDS = Number(process.env.QR_CACHE_SECONDS || 60 * 60 * 24); // 24h
const CACHE_CONTROL = `public, max-age=${CACHE_SECONDS}, immutable`;
const FILENAME_PREFIX = process.env.QR_FILENAME_PREFIX || 'adomi-qr';

interface GenerateQuery {
  data?: string;
  url?: string;
  size?: string;
  margin?: string;
  ecc?: string;
  download?: string;
}

const asNumber = (value?: string): number | undefined => {
  if (!value) return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
};

const asString = (value?: string): string | undefined => {
  if (typeof value !== 'string') {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed.length ? trimmed : undefined;
};

const normalizeFormat = (format?: string): QrFormat | undefined => {
  if (!format) return undefined;
  const normalized = format.toLowerCase();
  if (normalized === 'svg' || normalized === 'png') {
    return normalized;
  }
  return undefined;
};

export class QrController {
  public readonly router = Router();
  private readonly service = new QrService();

  constructor() {
    this.router.get('/qr/meta', this.handleMeta);
    this.router.get('/qr/:format', this.handleGenerate);
  }

  private handleMeta = (_req: Request, res: Response) => {
    return res.json({
      success: true,
      defaults: {
        url: this.service.getDefaultUrl(),
        size: DEFAULT_QR_SIZE,
        margin: DEFAULT_QR_MARGIN,
        ecc: DEFAULT_QR_ECC
      },
      ranges: {
        size: QR_SIZE_LIMITS,
        margin: QR_MARGIN_LIMITS
      },
      eccValues: QR_ERROR_CORRECTION_VALUES
    });
  };

  private handleGenerate = async (req: Request, res: Response) => {
    const query = req.query as GenerateQuery;
    const format = normalizeFormat(req.params.format);

    if (!format) {
      return res.status(400).json({
        success: false,
        error: 'FORMAT_NOT_SUPPORTED',
        allowed: ['svg', 'png']
      });
    }

    const options = {
      data: asString(query.url) || asString(query.data),
      size: asNumber(query.size),
      margin: asNumber(query.margin),
      ecc: asString(query.ecc) as QrErrorCorrectionLevel | undefined
    };

    const asAttachment =
      query.download === '1' ||
      query.download === 'true' ||
      query.download === 'yes';

    Logger.info(MODULE, 'QR request', {
      format,
      size: options.size,
      margin: options.margin,
      ecc: options.ecc,
      asAttachment
    });

    try {
      res.setHeader('Cache-Control', CACHE_CONTROL);

      if (format === 'svg') {
        const svg = await this.service.generateSvg(options);
        res.setHeader('Content-Type', 'image/svg+xml; charset=utf-8');
        if (asAttachment) {
          res.setHeader('Content-Disposition', `attachment; filename="${FILENAME_PREFIX}.svg"`);
        }
        return res.status(200).send(svg);
      }

      const png = await this.service.generatePng(options);
      res.setHeader('Content-Type', 'image/png');
      if (asAttachment) {
        res.setHeader('Content-Disposition', `attachment; filename="${FILENAME_PREFIX}.png"`);
      }
      return res.status(200).send(png);
    } catch (error: any) {
      Logger.error(MODULE, 'QR generation failed', error);
      return res.status(500).json({
        success: false,
        error: 'QR_GENERATION_FAILED'
      });
    }
  };
}


