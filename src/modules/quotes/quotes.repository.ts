import { PoolConnection } from 'mysql2/promise';
import DatabaseConnection from '../../shared/database/connection';
import { Logger } from '../../shared/utils/logger.util';
import {
  QuoteAttachmentRecord,
  QuoteBucket,
  QuoteDetailRecord,
  QuoteEventRecord,
  QuoteEventType,
  QuoteListRecord,
  QuoteMessageRecord,
  QuoteItemRecord,
  QuoteProposalPayload,
  QuoteStatus
} from './quotes.types';

const MODULE = 'QuotesRepository';

const HISTORY_STATUSES: QuoteStatus[] = ['rejected', 'expired'];

interface ListOptions {
  limit?: number;
  offset?: number;
}

export class QuotesRepository {
  static async listProviderQuotes(providerId: number, bucket: QuoteBucket, options: ListOptions = {}): Promise<QuoteListRecord[]> {
    const pool = DatabaseConnection.getPool();
    const limit = Math.min(Math.max(Number(options.limit) || 25, 1), 100);
    const offset = Math.max(Number(options.offset) || 0, 0);

    let statuses = bucket === 'history' ? HISTORY_STATUSES : [bucket as QuoteStatus];
    if (bucket === 'new') {
      statuses = ['new', 'draft'];
    }

    const [rows] = await pool.query(
      `
        SELECT
          q.id,
          q.provider_id,
          q.client_id,
          q.appointment_id,
          q.status,
          q.client_message,
          q.service_summary,
          q.currency,
          q.proposal_amount,
          q.proposal_details,
          q.proposal_valid_until,
          q.sent_at,
          q.accepted_at,
          q.rejected_at,
          q.expires_at,
          q.created_at,
          q.updated_at,
          cp.full_name AS client_name,
          cp.profile_photo_url AS client_avatar_url,
          c.created_at AS client_since,
          a.date AS appointment_date,
          a.start_time AS appointment_time
        FROM quotes q
        JOIN users c ON c.id = q.client_id
        LEFT JOIN client_profiles cp ON cp.client_id = q.client_id
        LEFT JOIN appointments a ON a.id = q.appointment_id
        WHERE q.provider_id = ?
          AND q.deleted_at IS NULL
          AND q.status IN (${statuses.map(() => '?').join(',') || "'new'"})
        ORDER BY q.updated_at DESC
        LIMIT ?
        OFFSET ?
      `,
      [providerId, ...statuses, limit, offset]
    );

    Logger.info(MODULE, '[PROVIDER_QUOTES][listProviderQuotes] raw rows', {
      providerId,
      bucket,
      limit,
      offset,
      count: (rows as any[]).length,
      statuses,
      sample:
        (rows as any[]).length > 0
          ? {
              id: (rows as any[])[0].id,
              status: (rows as any[])[0].status,
              proposal_amount: (rows as any[])[0].proposal_amount,
              proposal_valid_until: (rows as any[])[0].proposal_valid_until
            }
          : null
    });

    return (rows as any[]).map((row) => QuotesRepository.mapListRow(row));
  }

  static async countProviderQuotes(providerId: number): Promise<Record<QuoteStatus, number>> {
    const pool = DatabaseConnection.getPool();
    const [rows] = await pool.query(
      `
        SELECT status, COUNT(*) AS total
        FROM quotes
        WHERE provider_id = ? AND deleted_at IS NULL
        GROUP BY status
      `,
      [providerId]
    );

    const counters: Record<QuoteStatus, number> = {
      new: 0,
      draft: 0,
      sent: 0,
      accepted: 0,
      rejected: 0,
      expired: 0
    };

    for (const row of rows as any[]) {
      const status = row.status as QuoteStatus;
      if (status in counters) {
        counters[status] = Number(row.total) || 0;
      }
    }
    return counters;
  }

  static async listClientQuotes(clientId: number, bucket: QuoteBucket, options: ListOptions = {}): Promise<QuoteListRecord[]> {
    const pool = DatabaseConnection.getPool();
    const limit = Math.min(Math.max(Number(options.limit) || 25, 1), 100);
    const offset = Math.max(Number(options.offset) || 0, 0);
    let statuses = bucket === 'history' ? HISTORY_STATUSES : [bucket as QuoteStatus];
    if (bucket === 'new') {
      statuses = ['new', 'draft'];
    }

    const [rows] = await pool.query(
      `
        SELECT
          q.id,
          q.provider_id,
          q.client_id,
          q.appointment_id,
          q.status,
          q.client_message,
          q.service_summary,
          q.currency,
          q.proposal_amount,
          q.proposal_details,
          q.proposal_valid_until,
          q.sent_at,
          q.accepted_at,
          q.rejected_at,
          q.expires_at,
          q.created_at,
          q.updated_at,
          cp.full_name AS client_name,
          cp.profile_photo_url AS client_avatar_url,
          c.created_at AS client_since,
          COALESCE(pp.full_name, p.name) AS provider_name,
          pp.profile_photo_url AS provider_avatar_url,
          pp.main_commune AS provider_city,
          pp.main_region AS provider_country,
          p.created_at AS provider_since,
          a.date AS appointment_date,
          a.start_time AS appointment_time
        FROM quotes q
        JOIN users c ON c.id = q.client_id
        LEFT JOIN client_profiles cp ON cp.client_id = q.client_id
        JOIN users p ON p.id = q.provider_id
        LEFT JOIN provider_profiles pp ON pp.provider_id = q.provider_id
        LEFT JOIN appointments a ON a.id = q.appointment_id
        WHERE q.client_id = ?
          AND q.deleted_at IS NULL
          AND q.status IN (${statuses.map(() => '?').join(',') || "'new'"})
        ORDER BY q.updated_at DESC
        LIMIT ?
        OFFSET ?
      `,
      [clientId, ...statuses, limit, offset]
    );

    Logger.info(MODULE, '[CLIENT_QUOTES][listClientQuotes] raw rows', {
      clientId,
      bucket,
      limit,
      offset,
      count: (rows as any[]).length,
      sample: rows[0]
        ? {
            id: rows[0].id,
            status: rows[0].status,
            proposal_amount: rows[0].proposal_amount,
            proposal_valid_until: rows[0].proposal_valid_until,
            proposal_details: rows[0].proposal_details
          }
        : null
    });

    return (rows as any[]).map((row) => QuotesRepository.mapListRow(row));
  }

  static async countClientQuotes(clientId: number): Promise<Record<QuoteStatus, number>> {
    const pool = DatabaseConnection.getPool();
    const [rows] = await pool.query(
      `
        SELECT status, COUNT(*) AS total
        FROM quotes
        WHERE client_id = ? AND deleted_at IS NULL
        GROUP BY status
      `,
      [clientId]
    );

    const counters: Record<QuoteStatus, number> = {
      new: 0,
      draft: 0,
      sent: 0,
      accepted: 0,
      rejected: 0,
      expired: 0
    };

    for (const row of rows as any[]) {
      const status = row.status as QuoteStatus;
      if (status in counters) {
        counters[status] = Number(row.total) || 0;
      }
    }
    return counters;
  }

  static async findProviderQuote(providerId: number, quoteId: number): Promise<QuoteDetailRecord | null> {
    const pool = DatabaseConnection.getPool();
    const [rows] = await pool.query(
      `
        SELECT
          q.id,
          q.provider_id,
          q.client_id,
          q.appointment_id,
          q.status,
          q.client_message,
          q.service_summary,
          q.currency,
          q.proposal_amount,
          q.proposal_details,
          q.proposal_valid_until,
          q.sent_at,
          q.accepted_at,
          q.rejected_at,
          q.expires_at,
          q.created_at,
          q.updated_at,
          cp.full_name AS client_name,
          cp.profile_photo_url AS client_avatar_url,
          c.created_at AS client_since,
          a.date AS appointment_date,
          a.start_time AS appointment_time
        FROM quotes q
        JOIN users c ON c.id = q.client_id
        LEFT JOIN client_profiles cp ON cp.client_id = q.client_id
        LEFT JOIN appointments a ON a.id = q.appointment_id
        WHERE q.provider_id = ? AND q.id = ? AND q.deleted_at IS NULL
        LIMIT 1
      `,
      [providerId, quoteId]
    );

    if (!(rows as any[]).length) {
      return null;
    }

    const base = QuotesRepository.mapListRow((rows as any[])[0]);

    const [items] = await pool.query(
      `SELECT id, quote_id, position, title, description, quantity, unit_price, total_price
         FROM quote_items
        WHERE quote_id = ?
        ORDER BY position ASC, id ASC`,
      [quoteId]
    );

    const [attachments] = await pool.query(
      `SELECT id, quote_id, file_name, file_path, mime_type, file_size, category, uploaded_at
         FROM quote_attachments
        WHERE quote_id = ?
        ORDER BY uploaded_at DESC`,
      [quoteId]
    );

    const [events] = await pool.query(
      `SELECT id, quote_id, actor_type, actor_id, event_type, metadata, created_at
         FROM quote_events
        WHERE quote_id = ?
        ORDER BY created_at ASC`,
      [quoteId]
    );

    const [messages] = await pool.query(
      `SELECT id, quote_id, sender_id, sender_role, message, read_at, created_at
         FROM quote_messages
        WHERE quote_id = ?
        ORDER BY created_at ASC`,
      [quoteId]
    );

    return {
      ...base,
      items: items as QuoteItemRecord[],
      attachments: attachments as QuoteAttachmentRecord[],
      events: (events as any[]).map((event) => ({
        ...event,
        metadata: QuotesRepository.parseJson(event.metadata)
      })) as QuoteEventRecord[],
      messages: messages as QuoteMessageRecord[]
    };
  }

  static async findClientQuote(clientId: number, quoteId: number): Promise<QuoteDetailRecord | null> {
    const pool = DatabaseConnection.getPool();
    const [rows] = await pool.query(
      `
        SELECT
          q.id,
          q.provider_id,
          q.client_id,
          q.appointment_id,
          q.status,
          q.client_message,
          q.service_summary,
          q.currency,
          q.proposal_amount,
          q.proposal_details,
          q.proposal_valid_until,
          q.sent_at,
          q.accepted_at,
          q.rejected_at,
          q.expires_at,
          q.created_at,
          q.updated_at,
          cp.full_name AS client_name,
          cp.profile_photo_url AS client_avatar_url,
          c.created_at AS client_since,
          COALESCE(pp.full_name, p.name) AS provider_name,
          pp.profile_photo_url AS provider_avatar_url,
          pp.main_commune AS provider_city,
          pp.main_region AS provider_country,
          p.created_at AS provider_since,
          a.date AS appointment_date,
          a.start_time AS appointment_time
        FROM quotes q
        JOIN users c ON c.id = q.client_id
        LEFT JOIN client_profiles cp ON cp.client_id = q.client_id
        JOIN users p ON p.id = q.provider_id
        LEFT JOIN provider_profiles pp ON pp.provider_id = q.provider_id
        LEFT JOIN appointments a ON a.id = q.appointment_id
        WHERE q.client_id = ? AND q.id = ? AND q.deleted_at IS NULL
        LIMIT 1
      `,
      [clientId, quoteId]
    );

    if (!(rows as any[]).length) {
      return null;
    }

    const base = QuotesRepository.mapListRow((rows as any[])[0]);

    const [items] = await pool.query(
      `SELECT id, quote_id, position, title, description, quantity, unit_price, total_price
         FROM quote_items
        WHERE quote_id = ?
        ORDER BY position ASC, id ASC`,
      [quoteId]
    );

    const [attachments] = await pool.query(
      `SELECT id, quote_id, file_name, file_path, mime_type, file_size, category, uploaded_at
         FROM quote_attachments
        WHERE quote_id = ?
        ORDER BY uploaded_at DESC`,
      [quoteId]
    );

    const [events] = await pool.query(
      `SELECT id, quote_id, actor_type, actor_id, event_type, metadata, created_at
         FROM quote_events
        WHERE quote_id = ?
        ORDER BY created_at ASC`,
      [quoteId]
    );

    const [messages] = await pool.query(
      `SELECT id, quote_id, sender_id, sender_role, message, read_at, created_at
         FROM quote_messages
        WHERE quote_id = ?
        ORDER BY created_at ASC`,
      [quoteId]
    );

    return {
      ...base,
      items: items as QuoteItemRecord[],
      attachments: attachments as QuoteAttachmentRecord[],
      events: (events as any[]).map((event) => ({
        ...event,
        metadata: QuotesRepository.parseJson(event.metadata)
      })) as QuoteEventRecord[],
      messages: messages as QuoteMessageRecord[]
    };
  }

  static async ensureQuoteForClient(quoteId: number, clientId: number): Promise<QuoteListRecord | null> {
    const pool = DatabaseConnection.getPool();
    const [rows] = await pool.query(
      `
        SELECT
          q.id,
          q.provider_id,
          q.client_id,
          q.appointment_id,
          q.status,
          q.client_message,
          q.service_summary,
          q.currency,
          q.proposal_amount,
          q.proposal_details,
          q.proposal_valid_until,
          q.sent_at,
          q.accepted_at,
          q.rejected_at,
          q.expires_at,
          q.created_at,
          q.updated_at,
          cp.full_name AS client_name,
          cp.profile_photo_url AS client_avatar_url,
          c.created_at AS client_since,
          a.date AS appointment_date,
          a.start_time AS appointment_time
        FROM quotes q
        JOIN users c ON c.id = q.client_id
        LEFT JOIN client_profiles cp ON cp.client_id = q.client_id
        LEFT JOIN appointments a ON a.id = q.appointment_id
        WHERE q.client_id = ? AND q.id = ? AND q.deleted_at IS NULL
        LIMIT 1
      `,
      [clientId, quoteId]
    );
    if (!(rows as any[]).length) {
      return null;
    }
    return QuotesRepository.mapListRow((rows as any[])[0]);
  }

  static async createClientRequest(
    connection: PoolConnection,
    payload: {
      clientId: number;
      providerId: number;
      serviceSummary: string;
      clientMessage?: string | null;
      appointmentId?: number | null;
    }
  ): Promise<number> {
    const [result] = await connection.execute(
      `INSERT INTO quotes (
        provider_id,
        client_id,
        appointment_id,
        status,
        client_message,
        service_summary
      ) VALUES (?, ?, ?, 'new', ?, ?)`,
      [
        payload.providerId,
        payload.clientId,
        payload.appointmentId ?? null,
        payload.clientMessage ?? null,
        payload.serviceSummary
      ]
    );
    return Number((result as any).insertId);
  }

  static async updateProposal(
    connection: PoolConnection,
    quoteId: number,
    providerId: number,
    payload: QuoteProposalPayload,
    status: QuoteStatus,
    validityLimit: Date | null
  ): Promise<boolean> {
    const now = new Date();
    const sentAt = status === 'sent' ? now : null;
    const expiresAt = status === 'sent' ? validityLimit : null;
    const [result] = await connection.execute(
      `
        UPDATE quotes
           SET proposal_amount = ?,
               proposal_details = ?,
               proposal_valid_until = ?,
               currency = COALESCE(?, currency),
               status = ?,
               sent_at = ?,
               expires_at = ?,
               updated_at = CURRENT_TIMESTAMP
         WHERE id = ?
           AND provider_id = ?
           AND deleted_at IS NULL
           AND status IN ('new','draft','sent')
      `,
      [
        payload.amount,
        payload.details,
        validityLimit ? QuotesRepository.dateToSql(validityLimit) : null,
        payload.currency || null,
        status,
        sentAt ? QuotesRepository.dateToSql(sentAt) : null,
        expiresAt ? QuotesRepository.dateToSql(expiresAt) : null,
        quoteId,
        providerId
      ]
    );
    return (result as any).affectedRows > 0;
  }

  static async updateQuoteStatus(
    connection: PoolConnection,
    quoteId: number,
    expectedStatus: QuoteStatus[],
    nextStatus: QuoteStatus,
    timestamps: Partial<Record<'accepted_at' | 'rejected_at' | 'expires_at', Date>>
  ): Promise<boolean> {
    const setFragments: string[] = [`status = ?`, `updated_at = CURRENT_TIMESTAMP`];
    const values: any[] = [nextStatus];

    if (timestamps.accepted_at) {
      setFragments.push('accepted_at = ?');
      values.push(QuotesRepository.dateToSql(timestamps.accepted_at));
    }
    if (timestamps.rejected_at) {
      setFragments.push('rejected_at = ?');
      values.push(QuotesRepository.dateToSql(timestamps.rejected_at));
    }
    if (timestamps.expires_at) {
      setFragments.push('expires_at = ?');
      values.push(QuotesRepository.dateToSql(timestamps.expires_at));
    }

    values.push(quoteId);

    const [result] = await connection.execute(
      `
        UPDATE quotes
           SET ${setFragments.join(', ')}
         WHERE id = ?
           AND status IN (${expectedStatus.map(() => '?').join(', ')})
      `,
      [...values, ...expectedStatus]
    );

    return (result as any).affectedRows > 0;
  }

  static async insertEvent(
    connection: PoolConnection,
    quoteId: number,
    actorType: string,
    actorId: number | null,
    eventType: QuoteEventType,
    metadata?: Record<string, unknown> | null
  ): Promise<void> {
    await connection.execute(
      `
        INSERT INTO quote_events (quote_id, actor_type, actor_id, event_type, metadata)
        VALUES (?, ?, ?, ?, ?)
      `,
      [
        quoteId,
        actorType,
        actorId ?? null,
        eventType,
        metadata ? JSON.stringify(metadata) : null
      ]
    );
  }

  static async insertMessage(
    connection: PoolConnection,
    quoteId: number,
    senderId: number,
    senderRole: 'client' | 'provider',
    message: string
  ): Promise<number> {
    const [result] = await connection.execute(
      `
        INSERT INTO quote_messages (quote_id, sender_id, sender_role, message)
        VALUES (?, ?, ?, ?)
      `,
      [quoteId, senderId, senderRole, message]
    );
    return Number((result as any).insertId);
  }

  static async insertAttachment(
    connection: PoolConnection,
    payload: {
      quoteId: number;
      uploadedBy: number;
      role: 'client' | 'provider' | 'system';
      fileName: string;
      filePath: string;
      mimeType?: string | null;
      fileSize?: number | null;
      category?: 'client_request' | 'provider_proposal' | 'support';
    }
  ): Promise<number> {
    const [result] = await connection.execute(
      `
        INSERT INTO quote_attachments (
          quote_id,
          uploaded_by,
          uploaded_by_role,
          category,
          file_name,
          file_path,
          mime_type,
          file_size
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `,
      [
        payload.quoteId,
        payload.uploadedBy,
        payload.role,
        payload.category ?? 'provider_proposal',
        payload.fileName,
        payload.filePath,
        payload.mimeType ?? null,
        payload.fileSize ?? null
      ]
    );
    return Number((result as any).insertId);
  }

  static async deleteAttachment(connection: PoolConnection, quoteId: number, attachmentId: number, providerId: number): Promise<boolean> {
    const [result] = await connection.execute(
      `
        DELETE qa FROM quote_attachments qa
        JOIN quotes q ON q.id = qa.quote_id
       WHERE qa.id = ?
         AND qa.quote_id = ?
         AND q.provider_id = ?
      `,
      [attachmentId, quoteId, providerId]
    );
    return (result as any).affectedRows > 0;
  }

  static async markQuoteViewed(connection: PoolConnection, quoteId: number, field: 'last_client_view_at' | 'last_provider_view_at'): Promise<void> {
    await connection.execute(
      `
        UPDATE quotes
           SET ${field} = CURRENT_TIMESTAMP,
               updated_at = CURRENT_TIMESTAMP
         WHERE id = ?
      `,
      [quoteId]
    );
  }

  private static mapListRow(row: any): QuoteListRecord {
    return {
      id: Number(row.id),
      provider_id: Number(row.provider_id),
      client_id: Number(row.client_id),
      appointment_id: row.appointment_id !== null ? Number(row.appointment_id) : null,
      status: row.status as QuoteStatus,
      client_message: row.client_message ?? null,
      service_summary: row.service_summary ?? null,
      currency: row.currency || 'CLP',
      proposal_amount: row.proposal_amount !== null ? Number(row.proposal_amount) : null,
      proposal_details: row.proposal_details ?? null,
      proposal_valid_until: QuotesRepository.normalizeDate(row.proposal_valid_until),
      sent_at: QuotesRepository.normalizeDate(row.sent_at),
      accepted_at: QuotesRepository.normalizeDate(row.accepted_at),
      rejected_at: QuotesRepository.normalizeDate(row.rejected_at),
      expires_at: QuotesRepository.normalizeDate(row.expires_at),
      created_at: QuotesRepository.normalizeDate(row.created_at) ?? new Date().toISOString(),
      updated_at: QuotesRepository.normalizeDate(row.updated_at) ?? new Date().toISOString(),
      client_name: row.client_name || 'Cliente Adomi',
      client_avatar_url: row.client_avatar_url ?? null,
      client_since: QuotesRepository.normalizeDate(row.client_since),
      provider_name: row.provider_name ?? null,
      provider_avatar_url: row.provider_avatar_url ?? null,
      provider_since: QuotesRepository.normalizeDate(row.provider_since),
      provider_city: row.provider_city ?? null,
      provider_country: row.provider_country ?? null,
      appointment_date: QuotesRepository.normalizeDate(row.appointment_date),
      appointment_time: row.appointment_time ? String(row.appointment_time).slice(0, 5) : null
    };
  }

  private static parseJson(value: any): any {
    if (!value) return null;
    try {
      return typeof value === 'string' ? JSON.parse(value) : value;
    } catch (err) {
      Logger.warn(MODULE, 'Cannot parse JSON metadata, returning raw value', { value });
      return value;
    }
  }

  private static normalizeDate(value: any): string | null {
    if (!value) return null;
    if (value instanceof Date) return value.toISOString();
    if (typeof value === 'string') {
      return value.includes('T') ? value : new Date(value).toISOString();
    }
    return null;
  }

  private static dateToSql(date: Date): string {
    return date.toISOString().slice(0, 19).replace('T', ' ');
  }
}

