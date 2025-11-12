import { Router, Request, Response } from 'express';
import { authenticateToken, AuthUser } from '../../../shared/middleware/auth.middleware';
import DatabaseConnection from '../../../shared/database/connection';
import { Logger } from '../../../shared/utils/logger.util';

const MODULE = 'PROVIDER_INCOME_GOALS_ROUTES';
const router = Router();

type IncomeGoalPeriod = 'mensual' | 'trimestral';

function requireProvider(user: AuthUser, providerId: number): boolean {
  return user.role === 'provider' && user.id === providerId;
}

function formatDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function getPeriodRange(period: IncomeGoalPeriod, baseDate: Date): { start: Date; end: Date } {
  const start = new Date(baseDate);
  start.setHours(0, 0, 0, 0);

  if (period === 'trimestral') {
    const quarter = Math.floor(start.getMonth() / 3);
    start.setMonth(quarter * 3, 1);
    const end = new Date(start);
    end.setMonth(start.getMonth() + 3, 0); // último día del tercer mes
    end.setHours(23, 59, 59, 999);
    return { start, end };
  }

  // Mensual por defecto
  start.setDate(1);
  const end = new Date(start);
  end.setMonth(start.getMonth() + 1, 0);
  end.setHours(23, 59, 59, 999);
  return { start, end };
}

async function fetchCurrentGoal(providerId: number) {
  const pool = DatabaseConnection.getPool();

  const [rows]: any[] = await pool.query(
    `SELECT id, amount, period, set_date, created_at, updated_at
     FROM provider_income_goals
     WHERE provider_id = ?
     ORDER BY set_date DESC, id DESC
     LIMIT 1`,
    [providerId]
  );

  const goal = rows?.[0];
  if (!goal) return null;

  const period = (goal.period || 'mensual') as IncomeGoalPeriod;
  const baseDate = goal.set_date instanceof Date ? goal.set_date : new Date(goal.set_date);
  const range = getPeriodRange(period, baseDate);

  const [incomeRows]: any[] = await pool.query(
    `SELECT COALESCE(SUM(provider_amount), 0) AS income
     FROM payments
     WHERE provider_id = ?
       AND status = 'completed'
       AND paid_at IS NOT NULL
       AND paid_at BETWEEN ? AND ?`,
    [providerId, range.start, range.end]
  );

  const currentIncome = Number(incomeRows?.[0]?.income || 0);
  const amount = Number(goal.amount || 0);
  const progress = amount > 0 ? Math.min((currentIncome / amount) * 100, 100) : 0;

  return {
    id: goal.id,
    amount,
    period,
    setDate: formatDate(baseDate),
    createdAt: goal.created_at,
    updatedAt: goal.updated_at,
    currentIncome,
    progress
  };
}

router.get('/providers/:id/income-goals/current', authenticateToken, async (req: Request, res: Response) => {
  try {
    const user = (req as any).user as AuthUser;
    const providerId = Number(req.params.id);

    if (!Number.isFinite(providerId) || !requireProvider(user, providerId)) {
      return res.status(403).json({ success: false, error: 'forbidden' });
    }

    const goal = await fetchCurrentGoal(providerId);
    return res.json({ success: true, goal });
  } catch (error: any) {
    Logger.error(MODULE, 'Error getting income goal', error);
    return res.status(500).json({ success: false, error: 'Error obteniendo la meta de ingresos' });
  }
});

router.post('/providers/:id/income-goals', authenticateToken, async (req: Request, res: Response) => {
  try {
    const user = (req as any).user as AuthUser;
    const providerId = Number(req.params.id);
    if (!Number.isFinite(providerId) || !requireProvider(user, providerId)) {
      return res.status(403).json({ success: false, error: 'forbidden' });
    }

    const amount = Number(req.body?.amount || 0);
    if (!Number.isFinite(amount) || amount <= 0) {
      return res.status(400).json({ success: false, error: 'Monto inválido' });
    }

    const periodBody = String(req.body?.period || 'mensual').toLowerCase();
    const period: IncomeGoalPeriod = periodBody === 'trimestral' ? 'trimestral' : 'mensual';
    const setDate = new Date();

    const pool = DatabaseConnection.getPool();
    await pool.execute(
      `INSERT INTO provider_income_goals (provider_id, amount, period, set_date)
       VALUES (?, ?, ?, ?)` ,
      [providerId, amount, period, formatDate(setDate)]
    );

    const goal = await fetchCurrentGoal(providerId);
    return res.status(201).json({ success: true, goal });
  } catch (error: any) {
    Logger.error(MODULE, 'Error saving income goal', error);
    return res.status(500).json({ success: false, error: 'Error guardando la meta de ingresos' });
  }
});

export default router;





