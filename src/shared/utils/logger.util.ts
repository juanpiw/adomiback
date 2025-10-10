/**
 * Logger Utility
 * Centralized logging with context
 */

export enum LogLevel {
  INFO = 'INFO',
  WARN = 'WARN',
  ERROR = 'ERROR',
  DEBUG = 'DEBUG'
}

export class Logger {
  private static formatMessage(level: LogLevel, module: string, message: string, data?: any): string {
    const timestamp = new Date().toISOString();
    const dataStr = data ? ` | ${JSON.stringify(data)}` : '';
    return `[${timestamp}] [${level}] [${module}] ${message}${dataStr}`;
  }

  static info(module: string, message: string, data?: any): void {
    console.log(this.formatMessage(LogLevel.INFO, module, message, data));
  }

  static warn(module: string, message: string, data?: any): void {
    console.warn(this.formatMessage(LogLevel.WARN, module, message, data));
  }

  static error(module: string, message: string, error?: any): void {
    const errorData = error instanceof Error 
      ? { message: error.message, stack: error.stack }
      : error;
    console.error(this.formatMessage(LogLevel.ERROR, module, message, errorData));
  }

  static debug(module: string, message: string, data?: any): void {
    if (process.env.NODE_ENV === 'development') {
      console.debug(this.formatMessage(LogLevel.DEBUG, module, message, data));
    }
  }
}

