/**
 * Response Utility
 * Standardized API response formats
 */

export interface SuccessResponse<T = any> {
  success: true;
  data?: T;
  message?: string;
}

export interface ErrorResponse {
  success: false;
  error: string;
  code?: string;
  details?: any;
}

export interface PaginatedResponse<T = any> {
  success: true;
  data: T[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

export class ResponseUtil {
  /**
   * Success response with data
   */
  static success<T>(data?: T, message?: string): SuccessResponse<T> {
    return {
      success: true,
      ...(data !== undefined && { data }),
      ...(message && { message })
    };
  }

  /**
   * Error response
   */
  static error(error: string, code?: string, details?: any): ErrorResponse {
    return {
      success: false,
      error,
      ...(code && { code }),
      ...(details && { details })
    };
  }

  /**
   * Paginated response
   */
  static paginated<T>(
    data: T[],
    page: number,
    limit: number,
    total: number
  ): PaginatedResponse<T> {
    return {
      success: true,
      data,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit)
      }
    };
  }
}

