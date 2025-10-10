/**
 * Common Types
 * Shared type definitions across modules
 */

export interface PaginationParams {
  page: number;
  limit: number;
  offset?: number;
}

export interface DateRange {
  startDate: Date;
  endDate: Date;
}

export interface Timestamps {
  created_at: Date;
  updated_at: Date;
}

export interface SoftDelete extends Timestamps {
  deleted_at?: Date | null;
}

export type Maybe<T> = T | null;

export type Result<T, E = Error> = 
  | { success: true; data: T }
  | { success: false; error: E };

