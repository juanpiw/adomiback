// Tipos para autenticación y autorización

export interface AuthUser {
  id: number;
  email: string;
  name: string | null;
  role: 'client' | 'provider';
  active_plan_id?: number;
}

export interface LoginRequest {
  email: string;
  password: string;
}

export interface LoginResponse {
  success: boolean;
  user?: AuthUser;
  accessToken?: string;
  refreshToken?: string;
  expiresIn?: number;
  error?: string;
}

export interface RegisterRequest {
  name: string;
  email: string;
  password: string;
  role: 'client' | 'provider';
}

export interface RegisterResponse {
  success: boolean;
  user?: AuthUser;
  accessToken?: string;
  refreshToken?: string;
  expiresIn?: number;
  error?: string;
}

export interface RefreshTokenRequest {
  refreshToken: string;
}

export interface RefreshTokenResponse {
  success: boolean;
  accessToken?: string;
  refreshToken?: string;
  expiresIn?: number;
  error?: string;
}

export interface LogoutRequest {
  refreshToken: string;
}

export interface LogoutResponse {
  success: boolean;
  message?: string;
  error?: string;
}

// Tipos para middleware de autenticación
export interface AuthenticatedRequest extends Express.Request {
  user?: AuthUser;
  token?: string;
}

// Tipos para autorización
export interface Permission {
  resource: string;
  action: string;
  conditions?: Record<string, any>;
}

export interface Role {
  name: string;
  permissions: Permission[];
}

// Tipos para validación de tokens
export interface TokenValidationResult {
  valid: boolean;
  user?: AuthUser;
  error?: string;
  expired?: boolean;
  malformed?: boolean;
}

// Tipos para rate limiting
export interface RateLimitInfo {
  limit: number;
  remaining: number;
  reset: number;
  retryAfter?: number;
}

// Tipos para logging de seguridad
export interface SecurityEvent {
  type: 'login_success' | 'login_failed' | 'token_refresh' | 'logout' | 'access_denied' | 'rate_limit_exceeded';
  userId?: number;
  email?: string;
  ip: string;
  userAgent: string;
  timestamp: Date;
  details?: Record<string, any>;
}

// Tipos para configuración de seguridad
export interface SecurityConfig {
  jwt: {
    secret: string;
    refreshSecret: string;
    expiresIn: string;
    refreshExpiresIn: string;
  };
  rateLimit: {
    windowMs: number;
    maxRequests: number;
  };
  cors: {
    origin: string[];
    credentials: boolean;
  };
  helmet: {
    contentSecurityPolicy: boolean;
    hsts: boolean;
  };
}
