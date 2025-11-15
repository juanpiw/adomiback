import DatabaseConnection from '../../shared/database/connection';
import { Logger } from '../../shared/utils/logger.util';
import { PushService } from '../notifications/services/push.service';
import { EmailService } from '../../shared/services/email.service';
import { ensureQuotesFeature } from './quotes.policy';
import { QuotesRepository } from './quotes.repository';
import { QuoteBucket, QuoteDetailRecord, QuoteListRecord, QuoteProposalPayload, QuoteStatus } from './quotes.types';

const MODULE = 'QuotesService';

interface ProposalInput {
  amount: number;
  details: string;
  validityLabel?: string;
  submit?: boolean;
}

interface AttachmentPayload {
  quoteId: number;
  providerId: number;
  fileName: string;
  filePath: string;
  mimeType?: string | null;
  fileSize?: number | null;
  category?: 'client_request' | 'provider_proposal' | 'support';
}

interface ClientRequestPayload {
  clientId: number;
  providerId: number;
  serviceSummary: string;
  clientMessage: string;
  preferredDate?: string | null;
  preferredTimeRange?: string | null;
  attachments?: Array<{
    fileName: string;
    filePath: string;
    mimeType?: string | null;
    fileSize?: number | null;
  }>;
}

export class QuotesService {
  async listProviderQuotes(providerId: number, bucket: QuoteBucket, limit?: number, offset?: number) {
    await ensureQuotesFeature(providerId);
    const records = await QuotesRepository.listProviderQuotes(providerId, bucket, { limit, offset });
    Logger.info(MODULE, '[PROVIDER_QUOTES] listProviderQuotes', {
      providerId,
      bucket,
      limit,
      offset,
      count: records.length,
      statuses: records.map((record) => record.status),
      sample:
        records.length > 0
          ? {
              id: records[0].id,
              status: records[0].status,
              proposalAmount: records[0].proposal_amount,
              proposalValidUntil: records[0].proposal_valid_until
            }
          : null
    });
    return records.map((record) => this.mapListRecord(record));
  }

  async listClientQuotes(clientId: number, bucket: QuoteBucket, limit?: number, offset?: number) {
    const records = await QuotesRepository.listClientQuotes(clientId, bucket, { limit, offset });
    Logger.info(MODULE, '[CLIENT_QUOTES] listClientQuotes', {
      clientId,
      bucket,
      limit,
      offset,
      count: records.length,
      statuses: records.map((r) => r.status),
      sample: records[0]
        ? {
            id: records[0].id,
            status: records[0].status,
            proposal_amount: records[0].proposal_amount,
            proposal_valid_until: records[0].proposal_valid_until,
            provider_id: records[0].provider_id
          }
        : null
    });
    return records.map((record) => this.mapClientListRecord(record));
  }

  async createClientRequest(payload: ClientRequestPayload): Promise<number> {
    const serviceSummary = (payload.serviceSummary || '').trim().slice(0, 255);
    const message = (payload.clientMessage || '').trim();

    if (!message || message.length < 20) {
      const error: any = new Error('Describe tu necesidad con al menos 20 caracteres para que el profesional tenga contexto.');
      error.statusCode = 400;
      throw error;
    }

    const pool = DatabaseConnection.getPool();
    const connection = await pool.getConnection();

    try {
      await connection.beginTransaction();

      const quoteId = await QuotesRepository.createClientRequest(connection, {
        clientId: payload.clientId,
        providerId: payload.providerId,
        serviceSummary: serviceSummary || 'Solicitud de servicio',
        clientMessage: message,
        appointmentId: null
      });

      await QuotesRepository.insertEvent(connection, quoteId, 'client', payload.clientId, 'request_created', {
        service_summary: serviceSummary || null,
        preferred_date: payload.preferredDate || null,
        preferred_time_range: payload.preferredTimeRange || null
      });

      if (payload.attachments?.length) {
        for (const attachment of payload.attachments) {
          await QuotesRepository.insertAttachment(connection, {
            quoteId,
            uploadedBy: payload.clientId,
            role: 'client',
            fileName: attachment.fileName,
            filePath: attachment.filePath,
            mimeType: attachment.mimeType,
            fileSize: attachment.fileSize ?? null,
            category: 'client_request'
          });
        }
      }

      await connection.commit();

      void this.notifyProviderNewRequest(payload.providerId, payload.clientId, quoteId, serviceSummary, message).catch((err) => {
        Logger.error(MODULE, 'Error notifying provider about new request', err);
      });

      return quoteId;
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  }

  async getProviderQuote(providerId: number, quoteId: number): Promise<any | null> {
    await ensureQuotesFeature(providerId);
    const record = await QuotesRepository.findProviderQuote(providerId, quoteId);
    if (!record) {
      Logger.warn(MODULE, '[PROVIDER_QUOTES] getProviderQuote.miss', { providerId, quoteId });
      return null;
    }
    Logger.info(MODULE, '[PROVIDER_QUOTES] getProviderQuote.raw', {
      providerId,
      quoteId,
      status: record.status,
      proposalAmount: record.proposal_amount,
      proposalValidUntil: record.proposal_valid_until,
      clientId: record.client_id,
      attachments: record.attachments?.length ?? 0,
      items: record.items?.length ?? 0
    });
    const mapped = this.mapDetailRecord(record);
    Logger.info(MODULE, '[PROVIDER_QUOTES] getProviderQuote.mapped', {
      providerId,
      quoteId,
      status: mapped.status,
      amount: mapped.amount,
      validUntil: mapped.validUntil,
      proposal: mapped.proposal,
      hasItems: (mapped.items ?? []).length,
      hasAttachments: (mapped.attachments ?? []).length
    });
    return mapped;
  }

  async getClientQuote(clientId: number, quoteId: number): Promise<any | null> {
    const record = await QuotesRepository.findClientQuote(clientId, quoteId);
    if (!record) {
      Logger.warn(MODULE, '[CLIENT_QUOTES] getClientQuote.miss', { clientId, quoteId });
      return null;
    }
    Logger.info(MODULE, '[CLIENT_QUOTES] getClientQuote.raw', {
      clientId,
      quoteId,
      status: record.status,
      proposalAmount: record.proposal_amount,
      proposalValidUntil: record.proposal_valid_until,
      providerId: record.provider_id,
      attachments: record.attachments?.length ?? 0,
      items: record.items?.length ?? 0
    });
    const mapped = this.mapClientDetailRecord(record);
    Logger.info(MODULE, '[CLIENT_QUOTES] getClientQuote.mapped', {
      clientId,
      quoteId,
      status: mapped.status,
      proposal: mapped.proposal,
      provider: mapped.provider,
      hasItems: (mapped.items ?? []).length,
      hasAttachments: (mapped.attachments ?? []).length
    });
    return mapped;
  }

  async getProviderCounters(providerId: number) {
    await ensureQuotesFeature(providerId);
    const counters = await QuotesRepository.countProviderQuotes(providerId);
    return {
      new: counters.new,
      sent: counters.sent,
      accepted: counters.accepted,
      history: counters.rejected + counters.expired
    };
  }

  async getClientCounters(clientId: number) {
    const counters = await QuotesRepository.countClientQuotes(clientId);
    return {
      new: (counters.new || 0) + (counters.draft || 0),
      sent: counters.sent || 0,
      accepted: counters.accepted || 0,
      history: (counters.rejected || 0) + (counters.expired || 0)
    };
  }

  async acceptClientQuote(clientId: number, quoteId: number) {
    const summary = await QuotesRepository.ensureQuoteForClient(quoteId, clientId);
    if (!summary) {
      throw this.buildNotFoundError('No encontramos la cotización que intentas aceptar.');
    }
    if (summary.status === 'accepted') {
      Logger.info(MODULE, '[CLIENT_QUOTES] Quote already accepted', { clientId, quoteId });
      return QuotesRepository.findClientQuote(clientId, quoteId);
    }
    if (summary.status !== 'sent') {
      throw this.buildValidationError('Esta cotización todavía no está lista para ser aceptada.');
    }
    if (summary.proposal_amount === null) {
      throw this.buildValidationError('El profesional debe enviar un monto antes de que puedas aceptar la cotización.');
    }

    const pool = DatabaseConnection.getPool();
    const connection = await pool.getConnection();

    try {
      await connection.beginTransaction();
      const acceptedAt = new Date();
      const updated = await QuotesRepository.updateQuoteStatus(connection, quoteId, ['sent'], 'accepted', {
        accepted_at: acceptedAt
      });

      if (!updated) {
        throw this.buildValidationError('No pudimos aceptar la cotización. Intenta nuevamente en unos segundos.');
      }

      await QuotesRepository.insertEvent(connection, quoteId, 'client', clientId, 'accepted', {
        amount: summary.proposal_amount,
        currency: summary.currency || 'CLP'
      });

      await connection.commit();
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }

    void this.notifyProviderQuoteAccepted(summary.provider_id, clientId, quoteId, summary.service_summary).catch((err) => {
      Logger.error(MODULE, 'Error notifying provider about accepted quote', err);
    });

    return QuotesRepository.findClientQuote(clientId, quoteId);
  }

  async saveProposal(providerId: number, quoteId: number, input: ProposalInput) {
    await ensureQuotesFeature(providerId);

    const existing = await QuotesRepository.findProviderQuote(providerId, quoteId);
    if (!existing) {
      throw this.buildNotFoundError('No encontramos la cotización que quieres actualizar.');
    }

    const payload = this.normalizeProposalPayload(input);
    const normalizedPayload: QuoteProposalPayload = {
      ...payload,
      currency: payload.currency || existing.currency || 'CLP'
    };
    const validityLimit = payload.validityDays > 0 ? this.calculateValidityDate(payload.validityDays) : null;
    const nextStatus: QuoteStatus = payload.submit ? 'sent' : 'draft';

    const pool = DatabaseConnection.getPool();
    const connection = await pool.getConnection();

    let shouldNotify = false;

    try {
      await connection.beginTransaction();

      const updated = await QuotesRepository.updateProposal(
        connection,
        quoteId,
        providerId,
        normalizedPayload,
        nextStatus,
        validityLimit
      );
      if (!updated) {
        throw this.buildNotFoundError('No encontramos la cotización para actualizar. Verifica el estado.');
      }

      await QuotesRepository.insertEvent(
        connection,
        quoteId,
        'provider',
        providerId,
        payload.submit ? 'proposal_sent' : 'draft_saved',
        {
          amount: payload.amount,
          currency: 'CLP',
          validity_days: payload.validityDays
        }
      );

      shouldNotify = payload.submit;

      await connection.commit();
      Logger.info(MODULE, 'Quote proposal saved', {
        quoteId,
        providerId,
        status: nextStatus,
        amount: normalizedPayload.amount,
        validityLimit,
        currency: normalizedPayload.currency
      });
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }

    if (shouldNotify) {
      await this.notifyClientNewProposal({
        ...existing,
        proposal_amount: normalizedPayload.amount,
        proposal_valid_until: validityLimit ? validityLimit.toISOString() : existing.proposal_valid_until,
        currency: normalizedPayload.currency || existing.currency
      } as QuoteDetailRecord);
    }
  }

  async uploadAttachment(payload: AttachmentPayload) {
    await ensureQuotesFeature(payload.providerId);
    const pool = DatabaseConnection.getPool();
    const connection = await pool.getConnection();

    try {
      await connection.beginTransaction();

      const quote = await QuotesRepository.findProviderQuote(payload.providerId, payload.quoteId);
      if (!quote) {
        throw this.buildNotFoundError('No encontramos la cotización para adjuntar archivos.');
      }

      const attachmentId = await QuotesRepository.insertAttachment(connection, {
        quoteId: payload.quoteId,
        uploadedBy: payload.providerId,
        role: 'provider',
        fileName: payload.fileName,
        filePath: payload.filePath,
        mimeType: payload.mimeType,
        fileSize: payload.fileSize ?? null,
        category: payload.category ?? 'provider_proposal'
      });

      await QuotesRepository.insertEvent(connection, payload.quoteId, 'provider', payload.providerId, 'attachment_uploaded', {
        attachment_id: attachmentId,
        file_name: payload.fileName
      });

      await connection.commit();
      return attachmentId;
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  }

  async deleteAttachment(providerId: number, quoteId: number, attachmentId: number) {
    await ensureQuotesFeature(providerId);
    const pool = DatabaseConnection.getPool();
    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();
      const deleted = await QuotesRepository.deleteAttachment(connection, quoteId, attachmentId, providerId);
      if (!deleted) {
        throw this.buildNotFoundError('No encontramos el adjunto que intentas eliminar.');
      }
      await QuotesRepository.insertEvent(connection, quoteId, 'provider', providerId, 'attachment_removed', {
        attachment_id: attachmentId
      });
      await connection.commit();
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  }

  private mapListRecord(record: QuoteListRecord) {
    return {
      id: record.id,
      status: record.status === 'draft' ? 'new' : record.status,
      serviceName: record.service_summary || 'Servicio solicitado',
      requestedAt: record.created_at,
      client: {
        id: record.client_id,
        name: record.client_name,
        avatarUrl: record.client_avatar_url,
        memberSince: record.client_since
      },
      message: record.client_message,
      amount: record.proposal_amount,
      currency: record.currency || 'CLP',
      validUntil: record.proposal_valid_until,
      preferredDate: record.preferred_service_date,
      preferredTimeRange: record.preferred_time_range,
      appointment: record.appointment_id
        ? {
            appointmentId: record.appointment_id,
            date: record.appointment_date,
            time: record.appointment_time
          }
        : null
    };
  }

  private mapDetailRecord(record: QuoteDetailRecord) {
    return {
      ...this.mapListRecord(record),
      status: record.status,
      proposal: {
        amount: record.proposal_amount,
        currency: record.currency,
        details: record.proposal_details,
        validUntil: record.proposal_valid_until
      },
      items: record.items,
      attachments: record.attachments.map((attachment) => ({
        id: attachment.id,
        name: attachment.file_name,
        url: attachment.file_path,
        size: attachment.file_size,
        type: attachment.mime_type,
        category: attachment.category
      })),
      events: record.events,
      messages: record.messages
    };
  }

  private mapClientListRecord(record: QuoteListRecord) {
    return {
      id: record.id,
      status: record.status === 'draft' ? 'new' : record.status,
      serviceName: record.service_summary || 'Solicitud enviada',
      requestedAt: record.created_at,
      provider: {
        id: record.provider_id,
        name: record.provider_name || 'Profesional Adomi',
        avatarUrl: record.provider_avatar_url,
        memberSince: record.provider_since,
        city: record.provider_city,
        country: record.provider_country
      },
      message: record.client_message,
      amount: record.proposal_amount,
      currency: record.currency || 'CLP',
      validUntil: record.proposal_valid_until,
      preferredDate: record.preferred_service_date,
      preferredTimeRange: record.preferred_time_range,
      appointment: record.appointment_id
        ? {
            appointmentId: record.appointment_id,
            date: record.appointment_date,
            time: record.appointment_time
          }
        : null
    };
  }

  private mapClientDetailRecord(record: QuoteDetailRecord) {
    return {
      ...this.mapClientListRecord(record),
      status: record.status,
      proposal: {
        amount: record.proposal_amount,
        currency: record.currency,
        details: record.proposal_details,
        validUntil: record.proposal_valid_until
      },
      items: record.items,
      attachments: record.attachments.map((attachment) => ({
        id: attachment.id,
        name: attachment.file_name,
        url: attachment.file_path,
        size: attachment.file_size,
        type: attachment.mime_type,
        category: attachment.category
      })),
      events: record.events,
      messages: record.messages
    };
  }

  private normalizeProposalPayload(input: ProposalInput): QuoteProposalPayload {
    const amount = Number(input.amount);
    if (Number.isNaN(amount) || amount <= 0) {
      const error: any = new Error('El monto de la cotización debe ser un número positivo.');
      error.statusCode = 400;
      throw error;
    }
    const details = (input.details || '').trim();
    if (!details || details.length < 20) {
      const error: any = new Error('Describe el trabajo con al menos 20 caracteres para que el cliente tenga claridad.');
      error.statusCode = 400;
      throw error;
    }
    const validityDays = this.resolveValidityDays(input.validityLabel);
    return {
      amount: Math.round(amount),
      details,
      validityDays,
      submit: !!input.submit,
      currency: (input as any)?.currency?.toString()?.trim().toUpperCase() || null
    };
  }

  private resolveValidityDays(label?: string): number {
    if (!label) return 15;
    const normalized = label.toLowerCase().replace(/[^0-9]/g, '');
    const parsed = Number(normalized);
    if (!Number.isNaN(parsed) && parsed > 0) {
      return parsed;
    }
    return 15;
  }

  private calculateValidityDate(days: number): Date {
    const date = new Date();
    date.setDate(date.getDate() + days);
    date.setHours(23, 59, 59, 0);
    return date;
  }

  private async notifyClientNewProposal(quote: QuoteDetailRecord) {
    try {
      const pool = DatabaseConnection.getPool();
      const [[client]]: any = await pool.query('SELECT id, email, name FROM users WHERE id = ? LIMIT 1', [quote.client_id]);
      const [[provider]]: any = await pool.query('SELECT name FROM users WHERE id = ? LIMIT 1', [quote.provider_id]);

      const clientQuotesUrl = `${process.env.CLIENT_APP_URL || 'https://adomiapp.com/client'}/cotizaciones`;
      const appName = process.env.APP_NAME || 'Adomi';
      const providerName = provider?.name || 'El profesional';

      if (client?.email) {
        await EmailService.sendQuoteProposalClient(client.email, {
          appName,
          clientName: client?.name,
          providerName,
          serviceSummary: quote.service_summary,
          amount: quote.proposal_amount ?? undefined,
          currency: quote.currency || 'CLP',
          validityLabel: quote.proposal_valid_until ? `hasta ${new Date(quote.proposal_valid_until).toLocaleDateString('es-CL')}` : null,
          dashboardUrl: clientQuotesUrl
        });
      }

      if (client?.id) {
        await PushService.notifyUser(
          client.id,
          '¡Tu cotización está lista!',
          `${providerName} envió una propuesta. Revísala para continuar.`,
          {
            type: 'quote_proposal',
            quoteId: String(quote.id)
          }
        );
      }
    } catch (err) {
      Logger.error(MODULE, 'Error notifying client about proposal', err as any);
    }
  }

  private async notifyProviderNewRequest(
    providerId: number,
    clientId: number,
    quoteId: number,
    serviceSummary: string,
    clientMessage: string
  ) {
    try {
      const pool = DatabaseConnection.getPool();
      const [[provider]]: any = await pool.query('SELECT id, email, name FROM users WHERE id = ? LIMIT 1', [providerId]);
      const [[client]]: any = await pool.query('SELECT id, email, name FROM users WHERE id = ? LIMIT 1', [clientId]);

      const providerName = provider?.name || 'Profesional';
      const clientName = client?.name || 'Cliente';
      const appName = process.env.APP_NAME || 'Adomi';
      const providerQuotesUrl = `${process.env.PROVIDER_APP_URL || 'https://adomiapp.com/dash'}/cotizaciones`;
      const clientQuotesUrl = `${process.env.CLIENT_APP_URL || 'https://adomiapp.com/client'}/cotizaciones`;

      if (provider?.id) {
        await PushService.notifyUser(
          provider.id,
          'Tienes una nueva solicitud de cotización',
          `${clientName} necesita ${serviceSummary || 'un servicio'}. Responde para concretar.`,
          {
            type: 'quote_request',
            quoteId: String(quoteId)
          }
        );
      }

      if (provider?.email) {
        await EmailService.sendQuoteRequestProvider(provider.email, {
          appName,
          clientName,
          providerName,
          serviceSummary,
          clientMessage,
          dashboardUrl: providerQuotesUrl
        });
      }

      if (client?.email) {
        await EmailService.sendQuoteRequestClient(client.email, {
          appName,
          clientName,
          providerName,
          serviceSummary,
          dashboardUrl: clientQuotesUrl
        });
      }

      if (client?.id) {
        await PushService.notifyUser(
          client.id,
          'Solicitud enviada',
          `Te avisaremos cuando ${providerName} responda tu cotización.`,
          {
            type: 'quote_request_ack',
            quoteId: String(quoteId)
          }
        );
      }
    } catch (err) {
      Logger.error(MODULE, 'Error notifying provider about new request', err as any);
    }
  }

  private async notifyProviderQuoteAccepted(providerId: number, clientId: number, quoteId: number, serviceSummary?: string | null) {
    try {
      const pool = DatabaseConnection.getPool();
      const [[provider]]: any = await pool.query('SELECT id, email, name FROM users WHERE id = ? LIMIT 1', [providerId]);
      const [[client]]: any = await pool.query('SELECT id, name FROM users WHERE id = ? LIMIT 1', [clientId]);

      const providerQuotesUrl = `${process.env.PROVIDER_APP_URL || 'https://adomiapp.com/dash'}/cotizaciones`;
      const clientName = client?.name || 'Un cliente';
      const providerName = provider?.name || 'Profesional';
      const summary = serviceSummary || 'una solicitud';

      if (provider?.id) {
        await PushService.notifyUser(
          provider.id,
          'Una cotización fue aceptada',
          `${clientName} aceptó la cotización de ${summary}.`,
          {
            type: 'quote_accepted',
            quoteId: String(quoteId),
            url: providerQuotesUrl
          }
        );
      }
    } catch (err) {
      Logger.error(MODULE, 'Error notifying provider about accepted quote', err as any);
    }
  }

  private buildNotFoundError(message: string) {
    const error: any = new Error(message);
    error.statusCode = 404;
    return error;
  }

  private buildValidationError(message: string) {
    const error: any = new Error(message);
    error.statusCode = 400;
    return error;
  }
}

