import DatabaseConnection from '../../shared/database/connection';
import { Logger } from '../../shared/utils/logger.util';
import { PushService } from '../notifications/services/push.service';
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

export class QuotesService {
  async listProviderQuotes(providerId: number, bucket: QuoteBucket, limit?: number, offset?: number) {
    await ensureQuotesFeature(providerId);
    const records = await QuotesRepository.listProviderQuotes(providerId, bucket, { limit, offset });
    return records.map((record) => this.mapListRecord(record));
  }

  async getProviderQuote(providerId: number, quoteId: number): Promise<any | null> {
    await ensureQuotesFeature(providerId);
    const record = await QuotesRepository.findProviderQuote(providerId, quoteId);
    if (!record) return null;
    return this.mapDetailRecord(record);
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

  async saveProposal(providerId: number, quoteId: number, input: ProposalInput) {
    await ensureQuotesFeature(providerId);

    const existing = await QuotesRepository.findProviderQuote(providerId, quoteId);
    if (!existing) {
      throw this.buildNotFoundError('No encontramos la cotización que quieres actualizar.');
    }

    const payload = this.normalizeProposalPayload(input);
    const validityLimit = payload.validityDays > 0 ? this.calculateValidityDate(payload.validityDays) : null;
    const nextStatus: QuoteStatus = payload.submit ? 'sent' : 'draft';

    const pool = DatabaseConnection.getPool();
    const connection = await pool.getConnection();

    let shouldNotify = false;

    try {
      await connection.beginTransaction();

      const updated = await QuotesRepository.updateProposal(connection, quoteId, providerId, payload, nextStatus, validityLimit);
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
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }

    if (shouldNotify) {
      await this.notifyClientNewProposal(existing);
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
      submit: !!input.submit
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
      await PushService.notifyUser(quote.client_id, '¡Tu cotización está lista!', 'El profesional envió una propuesta. Revísala y decide si continuar.', {
        type: 'quote_proposal',
        quoteId: String(quote.id)
      });
    } catch (err) {
      Logger.error(MODULE, 'Error notifying client about proposal', err as any);
    }
  }

  private buildNotFoundError(message: string) {
    const error: any = new Error(message);
    error.statusCode = 404;
    return error;
  }
}

