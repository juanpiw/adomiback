# 🏆 Sistema de Fundadores - AdomiApp

## 🎯 **Objetivo del Sistema de Fundadores**

Implementar un sistema especial que permita a ciertos usuarios (fundadores) tener acceso premium **GRATUITO** de por vida, con beneficios exclusivos y gestión administrativa.

## 💡 **Casos de Uso para Fundadores**

### **1. Inversores y Partners**
- Inversores que aportaron capital inicial
- Partners estratégicos que contribuyeron al desarrollo
- Mentores y asesores clave

### **2. Early Adopters**
- Usuarios que se registraron en los primeros 100
- Beta testers que ayudaron con feedback
- Influencers que promocionaron la plataforma

### **3. Colaboradores Especiales**
- Desarrolladores que contribuyeron al código
- Diseñadores que crearon assets
- Community managers que construyeron la comunidad

## 🗄️ **Esquema de Base de Datos Actualizado**

### **Modificaciones a la tabla `users`**
```sql
-- Agregar campos para fundadores
ALTER TABLE users ADD COLUMN is_founder BOOLEAN DEFAULT FALSE;
ALTER TABLE users ADD COLUMN founder_discount_percentage DECIMAL(5,2) DEFAULT 0.00;
ALTER TABLE users ADD COLUMN founder_benefits JSON NULL;
ALTER TABLE users ADD COLUMN founder_assigned_by INT NULL;
ALTER TABLE users ADD COLUMN founder_assigned_at TIMESTAMP NULL;
ALTER TABLE users ADD COLUMN subscription_status ENUM('active', 'inactive', 'trial', 'past_due', 'founder') DEFAULT 'inactive';

-- Agregar foreign key para quien asignó el status
ALTER TABLE users ADD FOREIGN KEY (founder_assigned_by) REFERENCES users(id);
```

### **Nueva tabla `founder_benefits`**
```sql
CREATE TABLE founder_benefits (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT UNIQUE NOT NULL,
    benefits JSON NOT NULL,                    -- ["Acceso premium gratuito", "Soporte prioritario", "Descuentos especiales"]
    discount_percentage DECIMAL(5,2) DEFAULT 0.00,
    expires_at TIMESTAMP NULL,                 -- NULL = permanente
    notes TEXT NULL,                          -- Notas del admin sobre por qué se asignó
    assigned_by INT NOT NULL,                 -- Admin que asignó el status
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (assigned_by) REFERENCES users(id)
);
```

### **Nueva tabla `founder_audit_log` (Opcional)**
```sql
CREATE TABLE founder_audit_log (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    action ENUM('assigned', 'revoked', 'benefits_updated') NOT NULL,
    old_data JSON NULL,
    new_data JSON NULL,
    performed_by INT NOT NULL,
    reason TEXT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (performed_by) REFERENCES users(id)
);
```

## 🔧 **Implementación Backend**

### **1. Queries para Fundadores**

**Archivo: `backend/src/queries/founders.ts`**
```typescript
import { pool } from '../lib/db';

export type FounderRow = {
  id: number;
  user_id: number;
  benefits: string;
  discount_percentage: number;
  expires_at: Date | null;
  notes: string | null;
  assigned_by: number;
  created_at: Date;
};

export type UserWithFounderStatus = {
  id: number;
  email: string;
  name: string | null;
  role: 'client' | 'provider';
  is_founder: boolean;
  founder_discount_percentage: number;
  founder_benefits: string | null;
  subscription_status: string;
};

// Obtener todos los fundadores
export async function getFounders(): Promise<UserWithFounderStatus[]> {
  const [rows] = await pool.query(`
    SELECT u.id, u.email, u.name, u.role, u.is_founder, 
           u.founder_discount_percentage, u.founder_benefits, u.subscription_status
    FROM users u 
    WHERE u.is_founder = TRUE
    ORDER BY u.founder_assigned_at DESC
  `);
  return rows as UserWithFounderStatus[];
}

// Asignar status de fundador
export async function assignFounderStatus(
  userId: number, 
  benefits: string[], 
  discountPercentage: number, 
  assignedBy: number,
  notes?: string,
  expiresAt?: Date
): Promise<void> {
  const connection = await pool.getConnection();
  
  try {
    await connection.beginTransaction();
    
    // Actualizar tabla users
    await connection.execute(`
      UPDATE users 
      SET is_founder = TRUE, 
          founder_discount_percentage = ?, 
          founder_benefits = ?, 
          founder_assigned_by = ?, 
          founder_assigned_at = NOW(),
          subscription_status = 'founder'
      WHERE id = ?
    `, [discountPercentage, JSON.stringify(benefits), assignedBy, userId]);
    
    // Insertar en founder_benefits
    await connection.execute(`
      INSERT INTO founder_benefits (user_id, benefits, discount_percentage, expires_at, notes, assigned_by)
      VALUES (?, ?, ?, ?, ?, ?)
    `, [userId, JSON.stringify(benefits), discountPercentage, expiresAt, notes, assignedBy]);
    
    await connection.commit();
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

// Revocar status de fundador
export async function revokeFounderStatus(userId: number, revokedBy: number, reason?: string): Promise<void> {
  const connection = await pool.getConnection();
  
  try {
    await connection.beginTransaction();
    
    // Actualizar tabla users
    await connection.execute(`
      UPDATE users 
      SET is_founder = FALSE, 
          founder_discount_percentage = 0, 
          founder_benefits = NULL, 
          founder_assigned_by = NULL, 
          founder_assigned_at = NULL,
          subscription_status = 'inactive'
      WHERE id = ?
    `, [userId]);
    
    // Marcar como expirado en founder_benefits
    await connection.execute(`
      UPDATE founder_benefits 
      SET expires_at = NOW() 
      WHERE user_id = ? AND expires_at IS NULL
    `, [userId]);
    
    await connection.commit();
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

// Verificar si usuario es fundador
export async function isUserFounder(userId: number): Promise<boolean> {
  const [rows] = await pool.query(
    'SELECT is_founder FROM users WHERE id = ? LIMIT 1',
    [userId]
  );
  const arr = rows as any[];
  return arr.length > 0 && arr[0].is_founder === true;
}

// Obtener beneficios de fundador
export async function getFounderBenefits(userId: number): Promise<FounderRow | null> {
  const [rows] = await pool.query(`
    SELECT * FROM founder_benefits 
    WHERE user_id = ? AND (expires_at IS NULL OR expires_at > NOW())
    ORDER BY created_at DESC LIMIT 1
  `, [userId]);
  const arr = rows as any[];
  return arr.length ? (arr[0] as FounderRow) : null;
}
```

### **2. Endpoints para Fundadores**

**Archivo: `backend/src/endpoints/founders.ts`**
```typescript
import { Router } from 'express';
import { getFounders, assignFounderStatus, revokeFounderStatus, isUserFounder, getFounderBenefits } from '../queries/founders';

export function mountFounders(router: Router) {
  // GET /founders - Listar todos los fundadores (solo admin)
  router.get('/founders', async (req, res) => {
    try {
      // TODO: Verificar que el usuario es admin
      const founders = await getFounders();
      res.json({ ok: true, founders });
    } catch (error: any) {
      console.error('[FOUNDERS][ERROR]', error);
      res.status(500).json({ ok: false, error: 'Error al obtener fundadores' });
    }
  });

  // POST /founders/:id/assign - Asignar status de fundador (solo admin)
  router.post('/founders/:id/assign', async (req, res) => {
    try {
      const userId = parseInt(req.params.id);
      const { benefits, discountPercentage, notes, expiresAt } = req.body;
      const assignedBy = req.user?.id; // TODO: Obtener del token JWT
      
      if (!benefits || !Array.isArray(benefits)) {
        return res.status(400).json({ ok: false, error: 'benefits es requerido y debe ser un array' });
      }
      
      await assignFounderStatus(
        userId, 
        benefits, 
        discountPercentage || 0, 
        assignedBy, 
        notes,
        expiresAt ? new Date(expiresAt) : undefined
      );
      
      res.json({ ok: true, message: 'Status de fundador asignado correctamente' });
    } catch (error: any) {
      console.error('[FOUNDERS][ASSIGN][ERROR]', error);
      res.status(500).json({ ok: false, error: 'Error al asignar status de fundador' });
    }
  });

  // DELETE /founders/:id/revoke - Revocar status de fundador (solo admin)
  router.delete('/founders/:id/revoke', async (req, res) => {
    try {
      const userId = parseInt(req.params.id);
      const { reason } = req.body;
      const revokedBy = req.user?.id; // TODO: Obtener del token JWT
      
      await revokeFounderStatus(userId, revokedBy, reason);
      
      res.json({ ok: true, message: 'Status de fundador revocado correctamente' });
    } catch (error: any) {
      console.error('[FOUNDERS][REVOKE][ERROR]', error);
      res.status(500).json({ ok: false, error: 'Error al revocar status de fundador' });
    }
  });

  // GET /founders/check/:id - Verificar si usuario es fundador
  router.get('/founders/check/:id', async (req, res) => {
    try {
      const userId = parseInt(req.params.id);
      const isFounder = await isUserFounder(userId);
      const benefits = isFounder ? await getFounderBenefits(userId) : null;
      
      res.json({ 
        ok: true, 
        isFounder, 
        benefits: benefits ? {
          benefits: JSON.parse(benefits.benefits),
          discountPercentage: benefits.discount_percentage,
          expiresAt: benefits.expires_at
        } : null
      });
    } catch (error: any) {
      console.error('[FOUNDERS][CHECK][ERROR]', error);
      res.status(500).json({ ok: false, error: 'Error al verificar status de fundador' });
    }
  });
}
```

### **3. Middleware de Permisos Actualizado**

**Archivo: `backend/src/middleware/permissions.ts`**
```typescript
import { Request, Response, NextFunction } from 'express';
import { isUserFounder, getFounderBenefits } from '../queries/founders';

export async function requirePlan(requiredPlan: string) {
  return async (req: Request, res: Response, next: NextFunction) => {
    const userId = req.user?.id;
    
    if (!userId) {
      return res.status(401).json({ error: 'Authentication required' });
    }
    
    // Verificar si es fundador
    const isFounder = await isUserFounder(userId);
    if (isFounder) {
      // Los fundadores tienen acceso a todo
      return next();
    }
    
    // Verificar suscripción normal
    const user = await getUserWithSubscription(userId);
    
    if (!user.subscription || user.subscription.status !== 'active') {
      return res.status(403).json({ error: 'Subscription required' });
    }
    
    if (!hasPlanAccess(user.subscription.plan.name, requiredPlan)) {
      return res.status(403).json({ error: 'Plan upgrade required' });
    }
    
    next();
  };
}

export async function requireFounder() {
  return async (req: Request, res: Response, next: NextFunction) => {
    const userId = req.user?.id;
    
    if (!userId) {
      return res.status(401).json({ error: 'Authentication required' });
    }
    
    const isFounder = await isUserFounder(userId);
    if (!isFounder) {
      return res.status(403).json({ error: 'Founder status required' });
    }
    
    next();
  };
}
```

## 🎨 **Implementación Frontend**

### **1. Servicio de Fundadores**

**Archivo: `adomi-app/src/app/services/founder.service.ts`**
```typescript
import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';

export interface Founder {
  id: number;
  email: string;
  name: string | null;
  role: 'client' | 'provider';
  is_founder: boolean;
  founder_discount_percentage: number;
  founder_benefits: string[] | null;
  subscription_status: string;
}

export interface FounderBenefits {
  benefits: string[];
  discountPercentage: number;
  expiresAt: Date | null;
}

@Injectable({ providedIn: 'root' })
export class FounderService {
  private http = inject(HttpClient);
  private baseUrl = environment.apiBaseUrl;

  getFounders(): Observable<{ ok: boolean; founders: Founder[] }> {
    return this.http.get<{ ok: boolean; founders: Founder[] }>(`${this.baseUrl}/founders`);
  }

  assignFounderStatus(
    userId: number, 
    benefits: string[], 
    discountPercentage: number, 
    notes?: string, 
    expiresAt?: Date
  ): Observable<{ ok: boolean; message: string }> {
    return this.http.post<{ ok: boolean; message: string }>(`${this.baseUrl}/founders/${userId}/assign`, {
      benefits,
      discountPercentage,
      notes,
      expiresAt
    });
  }

  revokeFounderStatus(userId: number, reason?: string): Observable<{ ok: boolean; message: string }> {
    return this.http.delete<{ ok: boolean; message: string }>(`${this.baseUrl}/founders/${userId}/revoke`, {
      body: { reason }
    });
  }

  checkFounderStatus(userId: number): Observable<{ ok: boolean; isFounder: boolean; benefits: FounderBenefits | null }> {
    return this.http.get<{ ok: boolean; isFounder: boolean; benefits: FounderBenefits | null }>(`${this.baseUrl}/founders/check/${userId}`);
  }
}
```

### **2. Guard de Fundadores**

**Archivo: `adomi-app/src/app/guards/founder.guard.ts`**
```typescript
import { Injectable } from '@angular/core';
import { CanActivate, ActivatedRouteSnapshot, RouterStateSnapshot, Router } from '@angular/router';
import { FounderService } from '../services/founder.service';
import { SessionService } from '../auth/services/session.service';

@Injectable({ providedIn: 'root' })
export class FounderGuard implements CanActivate {
  constructor(
    private founderService: FounderService,
    private sessionService: SessionService,
    private router: Router
  ) {}

  canActivate(route: ActivatedRouteSnapshot, state: RouterStateSnapshot): boolean {
    const user = this.sessionService.getCurrentUser();
    
    if (!user) {
      this.router.navigate(['/auth/login']);
      return false;
    }

    // Verificar si es fundador
    this.founderService.checkFounderStatus(user.id).subscribe({
      next: (response) => {
        if (!response.isFounder) {
          this.router.navigate(['/plans']);
          return false;
        }
      },
      error: () => {
        this.router.navigate(['/plans']);
        return false;
      }
    });

    return true;
  }
}
```

### **3. Componente de Administración de Fundadores**

**Archivo: `adomi-app/src/app/admin/founders/founders.component.ts`**
```typescript
import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FounderService, Founder } from '../../services/founder.service';

@Component({
  selector: 'app-founders',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './founders.component.html',
  styleUrls: ['./founders.component.scss']
})
export class FoundersComponent implements OnInit {
  founders: Founder[] = [];
  loading = true;
  selectedFounder: Founder | null = null;
  showAssignModal = false;

  private founderService = inject(FounderService);

  ngOnInit() {
    this.loadFounders();
  }

  loadFounders() {
    this.founderService.getFounders().subscribe({
      next: (response) => {
        this.founders = response.founders;
        this.loading = false;
      },
      error: (error) => {
        console.error('Error loading founders:', error);
        this.loading = false;
      }
    });
  }

  assignFounderStatus(userId: number, benefits: string[], discountPercentage: number, notes?: string) {
    this.founderService.assignFounderStatus(userId, benefits, discountPercentage, notes).subscribe({
      next: (response) => {
        console.log('Founder status assigned:', response.message);
        this.loadFounders();
        this.showAssignModal = false;
      },
      error: (error) => {
        console.error('Error assigning founder status:', error);
      }
    });
  }

  revokeFounderStatus(userId: number, reason?: string) {
    if (confirm('¿Estás seguro de que quieres revocar el status de fundador?')) {
      this.founderService.revokeFounderStatus(userId, reason).subscribe({
        next: (response) => {
          console.log('Founder status revoked:', response.message);
          this.loadFounders();
        },
        error: (error) => {
          console.error('Error revoking founder status:', error);
        }
      });
    }
  }
}
```

## 🔄 **Flujo de Asignación de Fundadores**

### **1. Proceso Administrativo**
```
Admin identifica candidato → Verifica criterios → Asigna beneficios → 
Notifica al usuario → Usuario recibe acceso premium gratuito
```

### **2. Criterios de Selección**
- **Inversores**: Capital aportado > $X
- **Early Adopters**: Registro en primeros 100 usuarios
- **Partners**: Acuerdos estratégicos firmados
- **Contribuidores**: Código, diseño, marketing significativo

### **3. Beneficios Típicos**
- **Acceso premium gratuito** de por vida
- **Descuentos especiales** en servicios adicionales
- **Soporte prioritario** 24/7
- **Acceso a características beta**
- **Badge especial** en el perfil
- **Eventos exclusivos** para fundadores

## 📊 **Métricas y Reportes**

### **Métricas de Fundadores**
- Número total de fundadores
- Beneficios más utilizados
- Costo de beneficios por fundador
- Tiempo promedio de asignación
- Tasa de retención de fundadores

### **Reportes Administrativos**
- Lista de fundadores activos
- Historial de asignaciones/revocaciones
- Análisis de costo-beneficio
- Impacto en el negocio

## 🚀 **Implementación Gradual**

### **Fase 1: Base de Datos**
1. Crear tablas de fundadores
2. Modificar tabla users
3. Insertar datos de prueba

### **Fase 2: Backend**
1. Implementar queries de fundadores
2. Crear endpoints administrativos
3. Actualizar middleware de permisos

### **Fase 3: Frontend**
1. Crear servicios de fundadores
2. Implementar guards de permisos
3. Crear panel administrativo

### **Fase 4: Testing y Deploy**
1. Tests unitarios e integración
2. Pruebas de permisos
3. Deploy a producción

---

**¡Este sistema de fundadores te permitirá recompensar a los usuarios más valiosos y crear una comunidad de early adopters leales!** 🏆

