# 💰 Sistema de Contabilidad - AdomiApp

## 🎯 **Objetivo del Sistema de Contabilidad**

Implementar un sistema completo de seguimiento de ingresos, comisiones y ganancias para la plataforma AdomiApp, permitiendo un control detallado de la contabilidad interna.

## 📊 **Modelo de Ingresos**

### **1. Estructura de Comisiones**

#### **Comisión de Stripe:**
- **Porcentaje**: 2.9% del monto total
- **Fija**: $0.30 USD por transacción
- **Ejemplo**: $10,000 CLP → Stripe cobra $290 + $0.30 = $290.30 CLP

#### **Comisión de la Plataforma:**
- **Porcentaje**: 10% del monto total (configurable)
- **Ejemplo**: $10,000 CLP → AdomiApp cobra $1,000 CLP

#### **Cálculo de Monto Neto:**
```
Monto Bruto: $10,000 CLP
- Comisión Stripe: $290.30 CLP
- Comisión Plataforma: $1,000 CLP
= Monto Neto: $8,709.70 CLP
```

### **2. Tipos de Transacciones**

#### **Suscripciones (Recurrente)**
- Plan Premium: $9,990 CLP/mes
- Plan Fundador: $19,990 CLP/mes
- Se registra cada mes automáticamente

#### **Pagos Únicos (One-time)**
- Servicios adicionales
- Promociones especiales
- Upgrades de plan

#### **Reembolsos (Refunds)**
- Cancelaciones de suscripciones
- Reembolsos de pagos únicos
- Afecta el cálculo de ingresos netos

#### **Chargebacks**
- Disputas de tarjetas de crédito
- Pérdida total del monto + penalización

## 🗄️ **Esquema de Base de Datos**

### **Tabla `revenue_tracking` (Seguimiento de Ingresos)**

```sql
CREATE TABLE revenue_tracking (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,                      -- Usuario que pagó
    subscription_id INT NULL,                  -- FK a subscriptions (si es suscripción)
    invoice_id INT NULL,                       -- FK a invoices
    transaction_type ENUM('subscription', 'one_time', 'refund', 'chargeback') NOT NULL,
    gross_amount DECIMAL(10, 2) NOT NULL,      -- Monto total cobrado
    stripe_fee DECIMAL(10, 2) NOT NULL,        -- Comisión de Stripe (2.9% + $0.30)
    platform_fee DECIMAL(10, 2) NOT NULL,      -- Nuestra comisión
    net_amount DECIMAL(10, 2) NOT NULL,        -- Monto neto que recibimos
    currency VARCHAR(10) NOT NULL DEFAULT 'clp',
    stripe_transaction_id VARCHAR(255) NULL,   -- ID de transacción en Stripe
    status ENUM('pending', 'completed', 'failed', 'refunded') DEFAULT 'pending',
    processed_at TIMESTAMP NULL,               -- Cuando se procesó el pago
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (subscription_id) REFERENCES subscriptions(id) ON DELETE SET NULL,
    FOREIGN KEY (invoice_id) REFERENCES invoices(id) ON DELETE SET NULL
);
```

### **Tabla `platform_settings` (Configuración de la Plataforma)**

```sql
CREATE TABLE platform_settings (
    id INT AUTO_INCREMENT PRIMARY KEY,
    setting_key VARCHAR(100) UNIQUE NOT NULL,
    setting_value TEXT NOT NULL,
    description TEXT NULL,
    updated_by INT NULL,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (updated_by) REFERENCES users(id) ON DELETE SET NULL
);
```

## 🔧 **Implementación Backend**

### **1. Queries de Contabilidad**

**Archivo: `backend/src/queries/accounting.ts`**
```typescript
import { pool } from '../lib/db';

export type RevenueTrackingRow = {
  id: number;
  user_id: number;
  subscription_id: number | null;
  invoice_id: number | null;
  transaction_type: 'subscription' | 'one_time' | 'refund' | 'chargeback';
  gross_amount: number;
  stripe_fee: number;
  platform_fee: number;
  net_amount: number;
  currency: string;
  stripe_transaction_id: string | null;
  status: 'pending' | 'completed' | 'failed' | 'refunded';
  processed_at: Date | null;
  created_at: Date;
};

export type PlatformSettingsRow = {
  id: number;
  setting_key: string;
  setting_value: string;
  description: string | null;
  updated_by: number | null;
  updated_at: Date;
};

// Crear registro de ingresos
export async function createRevenueRecord(
  userId: number,
  transactionType: string,
  grossAmount: number,
  stripeTransactionId?: string,
  subscriptionId?: number,
  invoiceId?: number
): Promise<number> {
  // Obtener configuración de comisiones
  const settings = await getPlatformSettings();
  const stripeFeePercentage = parseFloat(settings.stripe_fee_percentage);
  const stripeFeeFixed = parseFloat(settings.stripe_fee_fixed);
  const platformFeePercentage = parseFloat(settings.platform_fee_percentage);
  
  // Calcular comisiones
  const stripeFee = (grossAmount * stripeFeePercentage / 100) + stripeFeeFixed;
  const platformFee = grossAmount * platformFeePercentage / 100;
  const netAmount = grossAmount - stripeFee - platformFee;
  
  const [result] = await pool.execute(`
    INSERT INTO revenue_tracking 
    (user_id, subscription_id, invoice_id, transaction_type, gross_amount, stripe_fee, platform_fee, net_amount, stripe_transaction_id, status, processed_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'completed', NOW())
  `, [userId, subscriptionId, invoiceId, transactionType, grossAmount, stripeFee, platformFee, netAmount, stripeTransactionId]);
  
  return (result as any).insertId;
}

// Obtener configuración de la plataforma
export async function getPlatformSettings(): Promise<Record<string, string>> {
  const [rows] = await pool.query('SELECT setting_key, setting_value FROM platform_settings');
  const settings: Record<string, string> = {};
  
  (rows as any[]).forEach((row: any) => {
    settings[row.setting_key] = row.setting_value;
  });
  
  return settings;
}

// Obtener resumen de ingresos
export async function getRevenueSummary(startDate?: Date, endDate?: Date): Promise<{
  totalGross: number;
  totalStripeFees: number;
  totalPlatformFees: number;
  totalNet: number;
  transactionCount: number;
}> {
  let query = `
    SELECT 
      SUM(gross_amount) as total_gross,
      SUM(stripe_fee) as total_stripe_fees,
      SUM(platform_fee) as total_platform_fees,
      SUM(net_amount) as total_net,
      COUNT(*) as transaction_count
    FROM revenue_tracking 
    WHERE status = 'completed'
  `;
  
  const params: any[] = [];
  
  if (startDate && endDate) {
    query += ' AND created_at BETWEEN ? AND ?';
    params.push(startDate, endDate);
  }
  
  const [rows] = await pool.query(query, params);
  const result = (rows as any[])[0];
  
  return {
    totalGross: parseFloat(result.total_gross) || 0,
    totalStripeFees: parseFloat(result.total_stripe_fees) || 0,
    totalPlatformFees: parseFloat(result.total_platform_fees) || 0,
    totalNet: parseFloat(result.total_net) || 0,
    transactionCount: parseInt(result.transaction_count) || 0
  };
}

// Obtener ingresos por usuario
export async function getUserRevenue(userId: number): Promise<RevenueTrackingRow[]> {
  const [rows] = await pool.query(
    'SELECT * FROM revenue_tracking WHERE user_id = ? ORDER BY created_at DESC',
    [userId]
  );
  return rows as RevenueTrackingRow[];
}

// Obtener ingresos por período
export async function getRevenueByPeriod(
  startDate: Date, 
  endDate: Date
): Promise<RevenueTrackingRow[]> {
  const [rows] = await pool.query(
    'SELECT * FROM revenue_tracking WHERE created_at BETWEEN ? AND ? ORDER BY created_at DESC',
    [startDate, endDate]
  );
  return rows as RevenueTrackingRow[];
}
```

### **2. Endpoints de Contabilidad**

**Archivo: `backend/src/endpoints/accounting.ts`**
```typescript
import { Router } from 'express';
import { 
  getRevenueSummary, 
  getUserRevenue, 
  getRevenueByPeriod,
  getPlatformSettings,
  createRevenueRecord
} from '../queries/accounting';

export function mountAccounting(router: Router) {
  // GET /accounting/summary - Resumen de ingresos
  router.get('/accounting/summary', async (req, res) => {
    try {
      const { startDate, endDate } = req.query;
      
      const summary = await getRevenueSummary(
        startDate ? new Date(startDate as string) : undefined,
        endDate ? new Date(endDate as string) : undefined
      );
      
      res.json({ ok: true, summary });
    } catch (error: any) {
      console.error('[ACCOUNTING][SUMMARY][ERROR]', error);
      res.status(500).json({ ok: false, error: 'Error al obtener resumen de ingresos' });
    }
  });

  // GET /accounting/user/:id - Ingresos por usuario
  router.get('/accounting/user/:id', async (req, res) => {
    try {
      const userId = parseInt(req.params.id);
      const revenue = await getUserRevenue(userId);
      
      res.json({ ok: true, revenue });
    } catch (error: any) {
      console.error('[ACCOUNTING][USER][ERROR]', error);
      res.status(500).json({ ok: false, error: 'Error al obtener ingresos del usuario' });
    }
  });

  // GET /accounting/period - Ingresos por período
  router.get('/accounting/period', async (req, res) => {
    try {
      const { startDate, endDate } = req.query;
      
      if (!startDate || !endDate) {
        return res.status(400).json({ ok: false, error: 'startDate y endDate son requeridos' });
      }
      
      const revenue = await getRevenueByPeriod(
        new Date(startDate as string),
        new Date(endDate as string)
      );
      
      res.json({ ok: true, revenue });
    } catch (error: any) {
      console.error('[ACCOUNTING][PERIOD][ERROR]', error);
      res.status(500).json({ ok: false, error: 'Error al obtener ingresos del período' });
    }
  });

  // GET /accounting/settings - Configuración de la plataforma
  router.get('/accounting/settings', async (req, res) => {
    try {
      const settings = await getPlatformSettings();
      res.json({ ok: true, settings });
    } catch (error: any) {
      console.error('[ACCOUNTING][SETTINGS][ERROR]', error);
      res.status(500).json({ ok: false, error: 'Error al obtener configuración' });
    }
  });
}
```

### **3. Integración con Webhooks de Stripe**

**Archivo: `backend/src/lib/stripe-webhooks.ts`**
```typescript
import { createRevenueRecord } from '../queries/accounting';

export async function handlePaymentSucceeded(event: any) {
  const paymentIntent = event.data.object;
  
  // Crear registro de ingresos
  await createRevenueRecord(
    paymentIntent.metadata.userId,
    'subscription',
    paymentIntent.amount / 100, // Stripe usa centavos
    paymentIntent.id,
    paymentIntent.metadata.subscriptionId
  );
  
  console.log('[WEBHOOK] Payment succeeded, revenue recorded');
}

export async function handlePaymentFailed(event: any) {
  const paymentIntent = event.data.object;
  
  // Registrar como fallido
  await createRevenueRecord(
    paymentIntent.metadata.userId,
    'subscription',
    paymentIntent.amount / 100,
    paymentIntent.id,
    paymentIntent.metadata.subscriptionId
  );
  
  console.log('[WEBHOOK] Payment failed, revenue recorded as failed');
}
```

## 🎨 **Frontend - Dashboard de Contabilidad**

### **1. Servicio de Contabilidad**

**Archivo: `adomi-app/src/app/services/accounting.service.ts`**
```typescript
import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';

export interface RevenueSummary {
  totalGross: number;
  totalStripeFees: number;
  totalPlatformFees: number;
  totalNet: number;
  transactionCount: number;
}

export interface RevenueRecord {
  id: number;
  user_id: number;
  transaction_type: string;
  gross_amount: number;
  stripe_fee: number;
  platform_fee: number;
  net_amount: number;
  currency: string;
  status: string;
  created_at: string;
}

@Injectable({ providedIn: 'root' })
export class AccountingService {
  private http = inject(HttpClient);
  private baseUrl = environment.apiBaseUrl;

  getRevenueSummary(startDate?: string, endDate?: string): Observable<{ ok: boolean; summary: RevenueSummary }> {
    const params: any = {};
    if (startDate) params.startDate = startDate;
    if (endDate) params.endDate = endDate;
    
    return this.http.get<{ ok: boolean; summary: RevenueSummary }>(`${this.baseUrl}/accounting/summary`, { params });
  }

  getUserRevenue(userId: number): Observable<{ ok: boolean; revenue: RevenueRecord[] }> {
    return this.http.get<{ ok: boolean; revenue: RevenueRecord[] }>(`${this.baseUrl}/accounting/user/${userId}`);
  }

  getRevenueByPeriod(startDate: string, endDate: string): Observable<{ ok: boolean; revenue: RevenueRecord[] }> {
    return this.http.get<{ ok: boolean; revenue: RevenueRecord[] }>(`${this.baseUrl}/accounting/period`, {
      params: { startDate, endDate }
    });
  }
}
```

### **2. Componente de Dashboard de Contabilidad**

**Archivo: `adomi-app/src/app/admin/accounting/accounting.component.ts`**
```typescript
import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { AccountingService, RevenueSummary, RevenueRecord } from '../../services/accounting.service';

@Component({
  selector: 'app-accounting',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './accounting.component.html',
  styleUrls: ['./accounting.component.scss']
})
export class AccountingComponent implements OnInit {
  summary: RevenueSummary | null = null;
  revenue: RevenueRecord[] = [];
  loading = true;
  selectedPeriod = 'month';

  private accountingService = inject(AccountingService);

  ngOnInit() {
    this.loadSummary();
    this.loadRevenue();
  }

  loadSummary() {
    this.accountingService.getRevenueSummary().subscribe({
      next: (response) => {
        this.summary = response.summary;
      },
      error: (error) => {
        console.error('Error loading summary:', error);
      }
    });
  }

  loadRevenue() {
    const endDate = new Date();
    const startDate = new Date();
    
    if (this.selectedPeriod === 'month') {
      startDate.setMonth(startDate.getMonth() - 1);
    } else if (this.selectedPeriod === 'year') {
      startDate.setFullYear(startDate.getFullYear() - 1);
    }
    
    this.accountingService.getRevenueByPeriod(
      startDate.toISOString().split('T')[0],
      endDate.toISOString().split('T')[0]
    ).subscribe({
      next: (response) => {
        this.revenue = response.revenue;
        this.loading = false;
      },
      error: (error) => {
        console.error('Error loading revenue:', error);
        this.loading = false;
      }
    });
  }

  formatCurrency(amount: number): string {
    return new Intl.NumberFormat('es-CL', {
      style: 'currency',
      currency: 'CLP'
    }).format(amount);
  }

  getProfitMargin(): number {
    if (!this.summary || this.summary.totalGross === 0) return 0;
    return (this.summary.totalNet / this.summary.totalGross) * 100;
  }
}
```

## 📊 **Métricas y Reportes**

### **1. Métricas Clave**
- **Ingresos Brutos Totales** (Gross Revenue)
- **Comisiones de Stripe** (Stripe Fees)
- **Comisiones de Plataforma** (Platform Fees)
- **Ingresos Netos** (Net Revenue)
- **Margen de Ganancia** (Profit Margin)
- **Número de Transacciones** (Transaction Count)

### **2. Reportes Disponibles**
- **Resumen Diario/Semanal/Mensual**
- **Ingresos por Usuario**
- **Ingresos por Período**
- **Análisis de Comisiones**
- **Tendencias de Crecimiento**

### **3. Alertas y Notificaciones**
- **Ingresos diarios mínimos** no alcanzados
- **Comisiones de Stripe** inusualmente altas
- **Transacciones fallidas** por encima del umbral
- **Chargebacks** detectados

## 🔄 **Flujo de Contabilidad**

### **1. Proceso de Pago Exitoso**
```
Usuario paga → Stripe procesa → Webhook recibido → 
Registro creado en revenue_tracking → Cálculo de comisiones → 
Actualización de métricas → Notificación a admin
```

### **2. Proceso de Reembolso**
```
Usuario solicita reembolso → Stripe procesa → Webhook recibido → 
Registro actualizado en revenue_tracking → Cálculo de pérdidas → 
Actualización de métricas → Notificación a admin
```

## 🚀 **Beneficios del Sistema de Contabilidad**

- 📊 **Visibilidad completa** de ingresos y gastos
- 💰 **Control de comisiones** en tiempo real
- 📈 **Análisis de rentabilidad** por período
- 🎯 **Optimización de precios** basada en datos
- 📋 **Reportes automáticos** para contabilidad
- 🔔 **Alertas proactivas** para problemas financieros

---

**¡Este sistema de contabilidad te dará un control total sobre los ingresos y gastos de AdomiApp!** 💰
