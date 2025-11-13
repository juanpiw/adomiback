import { PoolConnection } from 'mysql2/promise';
import DatabaseConnection from '../database/connection';
import { Logger } from '../utils/logger.util';

const MODULE = 'MANUAL_CASH_HISTORY';

export type ManualCashHistoryAction =
  | 'submitted'
  | 'under_review'
  | 'approved'
  | 'rejected'
  | 'resubmission_requested';

export type ManualCashHistoryActor = 'provider' | 'admin' | 'system';

export interface ManualCashHistoryRecord {
  id: number;
  payment_id: number;
  action: ManualCashHistoryAction;
  actor_type: ManualCashHistoryActor;
  actor_id: number | null;
  notes: string | null;
  metadata: any;
  created_at: string;
}

interface RecordInput {
  paymentId: number;
  action: ManualCashHistoryAction;
  actorType: ManualCashHistoryActor;
  actorId?: number | null;
  notes?: string | null;
  metadata?: any;
}

export class ManualCashHistoryService {
  static async record(
    conn: PoolConnection | null,
    { paymentId, action, actorType, actorId = null, notes = null, metadata = null }: RecordInput
  ): Promise<void> {
    try {
      const payload = [
        paymentId,
        action,
        actorType,
        actorId,
        notes,
        metadata ? JSON.stringify(metadata) : null
      ];
      if (conn) {
        await conn.query(
          `INSERT INTO cash_manual_payments_history
            (payment_id, action, actor_type, actor_id, notes, metadata)
           VALUES (?, ?, ?, ?, ?, ?)`,
          payload
        );
        return;
      }

      const pool = DatabaseConnection.getPool();
      await pool.query(
        `INSERT INTO cash_manual_payments_history
          (payment_id, action, actor_type, actor_id, notes, metadata)
         VALUES (?, ?, ?, ?, ?, ?)`,
        payload
      );
    } catch (error) {
      Logger.error(MODULE, 'Error recording manual cash history', {
        paymentId,
        action,
        actorType,
        error: (error as any)?.message || error
      });
    }
  }

  static async list(paymentId: number): Promise<ManualCashHistoryRecord[]> {
    try {
      const pool = DatabaseConnection.getPool();
      const [rows] = await pool.query(
        `SELECT id,
                payment_id,
                action,
                actor_type,
                actor_id,
                notes,
                metadata,
                created_at
           FROM cash_manual_payments_history
          WHERE payment_id = ?
          ORDER BY created_at ASC, id ASC`,
        [paymentId]
      );
      return (rows as any[]).map((row) => ({
        id: Number(row.id),
        payment_id: Number(row.payment_id),
        action: row.action as ManualCashHistoryAction,
        actor_type: row.actor_type as ManualCashHistoryActor,
        actor_id: row.actor_id !== null ? Number(row.actor_id) : null,
        notes: row.notes || null,
        metadata: this.parseJson(row.metadata),
        created_at: row.created_at
      }));
    } catch (error) {
      Logger.error(MODULE, 'Error fetching manual cash history', {
        paymentId,
        error: (error as any)?.message || error
      });
      return [];
    }
  }

  private static parseJson(value: any) {
    if (!value) return null;
    if (typeof value === 'object') return value;
    try {
      return JSON.parse(String(value));
    } catch {
      return value;
    }
  }
}




