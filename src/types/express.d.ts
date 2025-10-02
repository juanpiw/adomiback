// Extensión de tipos para Express
declare namespace Express {
  interface Request {
    user?: {
      id: number;
      email: string;
      name: string | null;
      role: 'client' | 'provider';
      active_plan_id?: number;
    };
    token?: string;
    rateLimit?: {
      limit: number;
      remaining: number;
      resetTime: number;
    };
  }
}
