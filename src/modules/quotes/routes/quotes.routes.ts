import fs from 'fs';
import path from 'path';
import multer from 'multer';
import { Router, Request, Response } from 'express';
import { authenticateToken, AuthUser } from '../../../shared/middleware/auth.middleware';
import { Logger } from '../../../shared/utils/logger.util';
import { QuotesService } from '../quotes.service';
import { QuoteBucket } from '../quotes.types';

const MODULE = 'QuotesRoutes';

const upload = multer({
  storage: multer.diskStorage({
    destination: (_req, file, cb) => {
      const target = path.join('uploads', 'quotes');
      if (!fs.existsSync(target)) {
        fs.mkdirSync(target, { recursive: true });
      }
      cb(null, target);
    },
    filename: (_req, file, cb) => {
      const unique = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
      const ext = path.extname(file.originalname) || '';
      cb(null, `${unique}${ext}`);
    }
  }),
  limits: {
    fileSize: 10 * 1024 * 1024 // 10MB
  }
});

export class QuotesRoutes {
  public readonly router: Router;
  private readonly service = new QuotesService();

  constructor() {
    this.router = Router();
    this.mountProviderRoutes();
    this.mountClientRoutes();
  }

  private mountProviderRoutes() {
    this.router.get('/provider/quotes', authenticateToken, async (req: Request, res: Response) => {
      try {
        const user = (req as any).user as AuthUser;
        if (user.role !== 'provider') {
          return res.status(403).json({ success: false, error: 'Solo los profesionales pueden acceder a cotizaciones.' });
        }
        const status = (String(req.query.status || 'new').toLowerCase() as any) ?? 'new';
        const limit = req.query.limit ? Number(req.query.limit) : undefined;
        const offset = req.query.offset ? Number(req.query.offset) : undefined;

        Logger.info(MODULE, '[PROVIDER_QUOTES] listing quotes', {
          providerId: user.id,
          status,
          limit,
          offset
        });

        const quotes = await this.service.listProviderQuotes(user.id, status, limit, offset);
        const counters = await this.service.getProviderCounters(user.id);

        Logger.info(MODULE, '[PROVIDER_QUOTES] response summary', {
          providerId: user.id,
          status,
          count: quotes.length,
          counters
        });

        return res.json({ success: true, quotes, counters });
      } catch (error: any) {
        Logger.error(MODULE, 'Error listing provider quotes', error);
        const status = error?.statusCode || 500;
        return res.status(status).json({ success: false, error: error?.message || 'Error al obtener cotizaciones.' });
      }
    });

    this.router.get('/provider/quotes/:id', authenticateToken, async (req: Request, res: Response) => {
      try {
        const user = (req as any).user as AuthUser;
        if (user.role !== 'provider') {
          return res.status(403).json({ success: false, error: 'Solo los profesionales pueden acceder a cotizaciones.' });
        }
        const quoteId = Number(req.params.id);
        const quote = await this.service.getProviderQuote(user.id, quoteId);
        if (!quote) {
          return res.status(404).json({ success: false, error: 'Cotización no encontrada.' });
        }
        Logger.info(MODULE, '[PROVIDER_QUOTES] detail delivered', {
          providerId: user.id,
          quoteId,
          status: quote.status,
          amount: quote.amount,
          validUntil: quote.validUntil
        });
        return res.json({ success: true, quote });
      } catch (error: any) {
        Logger.error(MODULE, 'Error retrieving provider quote', error);
        const status = error?.statusCode || 500;
        return res.status(status).json({ success: false, error: error?.message || 'Error al obtener la cotización.' });
      }
    });

    this.router.post('/provider/quotes/:id/proposal', authenticateToken, async (req: Request, res: Response) => {
      try {
        const user = (req as any).user as AuthUser;
        if (user.role !== 'provider') {
          return res.status(403).json({ success: false, error: 'Solo los profesionales pueden enviar cotizaciones.' });
        }
        const quoteId = Number(req.params.id);
        Logger.info(MODULE, '[PROVIDER_QUOTES] saveProposal.request', {
          providerId: user.id,
          quoteId,
          submit: req.body?.submit ?? req.body?.send ?? false,
          amount: req.body?.amount,
          validity: req.body?.validity,
          detailsLength: typeof req.body?.details === 'string' ? req.body.details.length : null
        });
        await this.service.saveProposal(user.id, quoteId, {
          amount: req.body?.amount,
          details: req.body?.details,
          validityLabel: req.body?.validity,
          submit: req.body?.submit ?? req.body?.send ?? false
        });
        Logger.info(MODULE, '[PROVIDER_QUOTES] saveProposal.success', {
          providerId: user.id,
          quoteId
        });
        return res.json({ success: true });
      } catch (error: any) {
        Logger.error(MODULE, 'Error saving proposal', error);
        const status = error?.statusCode || 500;
        return res.status(status).json({ success: false, error: error?.message || 'Error al guardar la cotización.' });
      }
    });

    this.router.post(
      '/provider/quotes/:id/attachments',
      authenticateToken,
      upload.single('file'),
      async (req: Request, res: Response) => {
        const user = (req as any).user as AuthUser;
        if (user.role !== 'provider') {
          if (req.file?.path) {
            fs.unlink(req.file.path, () => {});
          }
          return res.status(403).json({ success: false, error: 'Solo los profesionales pueden adjuntar archivos.' });
        }
        const file = req.file;
        if (!file) {
          return res.status(400).json({ success: false, error: 'No se recibió archivo.' });
        }
        try {
          const attachmentId = await this.service.uploadAttachment({
            quoteId: Number(req.params.id),
            providerId: user.id,
            fileName: file.originalname,
            filePath: `/uploads/quotes/${file.filename}`,
            mimeType: file.mimetype,
            fileSize: file.size,
            category: (req.body?.category as any) ?? 'provider_proposal'
          });
          return res.status(201).json({
            success: true,
            attachment: {
              id: attachmentId,
              name: file.originalname,
              url: `/uploads/quotes/${file.filename}`,
              size: file.size,
              type: file.mimetype
            }
          });
        } catch (error: any) {
          Logger.error(MODULE, 'Error uploading attachment', error);
          if (file?.path) {
            fs.unlink(file.path, () => {});
          }
          const status = error?.statusCode || 500;
          return res.status(status).json({ success: false, error: error?.message || 'No pudimos adjuntar el archivo.' });
        }
      }
    );

    this.router.delete('/provider/quotes/:id/attachments/:attachmentId', authenticateToken, async (req: Request, res: Response) => {
      try {
        const user = (req as any).user as AuthUser;
        if (user.role !== 'provider') {
          return res.status(403).json({ success: false, error: 'Solo los profesionales pueden gestionar adjuntos.' });
        }
        await this.service.deleteAttachment(user.id, Number(req.params.id), Number(req.params.attachmentId));
        return res.json({ success: true });
      } catch (error: any) {
        Logger.error(MODULE, 'Error deleting attachment', error);
        const status = error?.statusCode || 500;
        return res.status(status).json({ success: false, error: error?.message || 'No pudimos eliminar el adjunto.' });
      }
    });
  }

  private mountClientRoutes() {
    this.router.post(
      '/client/quotes',
      authenticateToken,
      upload.array('attachments', 5),
      async (req: Request, res: Response) => {
        const user = (req as any).user as AuthUser;
        const files = (req.files as Express.Multer.File[]) ?? [];
        const cleanupUploads = () => {
          files.forEach((file) => {
            if (file?.path && fs.existsSync(file.path)) {
              fs.unlink(file.path, () => {});
            }
          });
        };

        if (!user || user.role !== 'client') {
          cleanupUploads();
          return res.status(403).json({ success: false, error: 'Solo los clientes autenticados pueden solicitar cotizaciones.' });
        }

        const providerId = Number(
          req.body?.providerId ?? req.body?.provider_id ?? req.body?.provider ?? req.query?.providerId
        );
        if (!providerId || Number.isNaN(providerId)) {
          cleanupUploads();
          return res.status(400).json({ success: false, error: 'Debes indicar un profesional válido para solicitar cotización.' });
        }

        const message = String(req.body?.message ?? req.body?.clientMessage ?? '').trim();
        if (!message || message.length < 20) {
          cleanupUploads();
          return res.status(400).json({
            success: false,
            error: 'Cuéntanos con al menos 20 caracteres qué necesitas para que el profesional pueda ayudarte.'
          });
        }

        const serviceSummary = String(req.body?.service ?? req.body?.serviceSummary ?? '').trim();
        const preferredDate = req.body?.preferredDate ?? req.body?.fechaDeseada ?? null;
        const preferredTimeRange = req.body?.preferredTimeRange ?? req.body?.rangoHorario ?? null;

        try {
          const quoteId = await this.service.createClientRequest({
            clientId: user.id,
            providerId,
            serviceSummary,
            clientMessage: message,
            preferredDate: preferredDate ? String(preferredDate) : null,
            preferredTimeRange: preferredTimeRange ? String(preferredTimeRange) : null,
            attachments: files.map((file) => ({
              fileName: file.originalname,
              filePath: `/uploads/quotes/${file.filename}`,
              mimeType: file.mimetype,
              fileSize: file.size
            }))
          });

          return res.status(201).json({ success: true, quoteId });
        } catch (error: any) {
          cleanupUploads();
          Logger.error(MODULE, 'Error creating client quote request', error);
          const status = error?.statusCode || 500;
          return res.status(status).json({
            success: false,
            error: error?.message || 'No pudimos enviar tu solicitud de cotización. Intenta nuevamente más tarde.'
          });
        }
      }
    );

    this.router.get('/client/quotes', authenticateToken, async (req: Request, res: Response) => {
      try {
        const user = (req as any).user as AuthUser;
        if (!user || user.role !== 'client') {
          return res.status(403).json({ success: false, error: 'Solo los clientes autenticados pueden ver sus cotizaciones.' });
        }
        const status = (String(req.query.status || 'new').toLowerCase() as QuoteBucket) || 'new';
        const limit = req.query.limit ? Number(req.query.limit) : undefined;
        const offset = req.query.offset ? Number(req.query.offset) : undefined;
        Logger.info(MODULE, '[CLIENT_QUOTES] listing quotes', { clientId: user.id, status, limit, offset });
        const quotes = await this.service.listClientQuotes(user.id, status, limit, offset);
        const counters = await this.service.getClientCounters(user.id);
        Logger.info(MODULE, '[CLIENT_QUOTES] response summary', { count: quotes.length, counters });
        return res.json({ success: true, quotes, counters });
      } catch (error: any) {
        Logger.error(MODULE, '[CLIENT_QUOTES] Error listing client quotes', error);
        const status = error?.statusCode || 500;
        return res.status(status).json({ success: false, error: error?.message || 'Error al obtener tus cotizaciones.' });
      }
    });

    this.router.get('/client/quotes/:id', authenticateToken, async (req: Request, res: Response) => {
      try {
        const user = (req as any).user as AuthUser;
        if (!user || user.role !== 'client') {
          return res.status(403).json({ success: false, error: 'Solo los clientes autenticados pueden ver sus cotizaciones.' });
        }
        const quoteId = Number(req.params.id);
        const quote = await this.service.getClientQuote(user.id, quoteId);
        if (!quote) {
          return res.status(404).json({ success: false, error: 'Cotización no encontrada.' });
        }
        Logger.info(MODULE, '[CLIENT_QUOTES] detail delivered', {
          clientId: user.id,
          quoteId,
          status: quote.status,
          proposalAmount: quote.proposal?.amount ?? quote.amount ?? null,
          proposalValidUntil: quote.proposal?.validUntil ?? quote.validUntil ?? null,
          attachments: quote.attachments?.length ?? 0
        });
        return res.json({ success: true, quote });
      } catch (error: any) {
        Logger.error(MODULE, 'Error retrieving client quote', error);
        const status = error?.statusCode || 500;
        return res.status(status).json({ success: false, error: error?.message || 'Error al obtener la cotización.' });
      }
    });
  }
}


