# 🗓️ Sistema de Caducidad de Planes

## 📋 **Resumen**

Sistema completo para gestionar la caducidad automática de planes de suscripción, incluyendo degradación automática a plan básico y alertas en el frontend.

## 🗄️ **Base de Datos**

### **Nueva Tabla: `plan_expirations`**

```sql
CREATE TABLE plan_expirations (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    subscription_id INT NULL,
    plan_id INT NOT NULL,
    expires_at TIMESTAMP NOT NULL,
    status ENUM('active', 'expired', 'cancelled') DEFAULT 'active',
    auto_renew BOOLEAN DEFAULT FALSE,
    grace_period_days INT DEFAULT 7,
    downgraded_at TIMESTAMP NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (subscription_id) REFERENCES subscriptions(id) ON DELETE SET NULL,
    FOREIGN KEY (plan_id) REFERENCES plans(id) ON DELETE CASCADE,
    INDEX idx_user_expires (user_id, expires_at),
    INDEX idx_status_expires (status, expires_at)
);
```

### **Configuraciones de Plataforma**

```sql
INSERT INTO platform_settings (setting_key, setting_value, description) VALUES
('default_plan_id', '1', 'ID del plan básico por defecto para usuarios sin suscripción'),
('grace_period_days', '7', 'Días de gracia antes de degradar a plan básico'),
('auto_downgrade_enabled', 'true', 'Habilitar degradación automática a plan básico'),
('stripe_webhook_tolerance', '300', 'Tolerancia en segundos para webhooks de Stripe'),
('platform_fee_percentage', '5.0', 'Porcentaje de comisión de la plataforma'),
('founder_discount_percentage', '100.0', 'Descuento por defecto para fundadores');
```

## 🔧 **Backend**

### **Queries (`plan-expirations.ts`)**

- ✅ `createPlanExpiration()` - Crear nueva expiración
- ✅ `getActiveExpirations()` - Obtener expiraciones activas
- ✅ `getExpiringSoon()` - Planes por vencer (próximos 7 días)
- ✅ `getExpired()` - Planes ya expirados
- ✅ `markAsExpired()` - Marcar como expirado
- ✅ `markAsDowngraded()` - Marcar como degradado
- ✅ `getUserCurrentPlan()` - Plan actual del usuario
- ✅ `extendPlanExpiration()` - Extender expiración
- ✅ `getExpirationStats()` - Estadísticas

### **Endpoints (`plan-expirations.ts`)**

- ✅ `GET /plan-expirations/user/:userId/current` - Plan actual
- ✅ `GET /plan-expirations/user/:userId/active` - Expiraciones activas
- ✅ `GET /plan-expirations/expiring-soon` - Por vencer
- ✅ `GET /plan-expirations/expired` - Expirados
- ✅ `POST /plan-expirations` - Crear expiración
- ✅ `PUT /plan-expirations/:id/expire` - Marcar como expirado
- ✅ `PUT /plan-expirations/:id/downgrade` - Degradar
- ✅ `PUT /plan-expirations/:id/extend` - Extender
- ✅ `GET /plan-expirations/stats` - Estadísticas

### **Servicio Automático (`plan-expiration-service.ts`)**

- ✅ `processExpiredPlans()` - Procesar planes expirados
- ✅ `isUserPlanExpired()` - Verificar si está expirado
- ✅ `getDaysUntilExpiration()` - Días restantes
- ✅ `startAutomaticProcessing()` - Iniciar procesamiento automático

## 🎨 **Frontend**

### **Componente de Alerta (`plan-upgrade-alert`)**

- ✅ **Alertas inteligentes** según estado del plan
- ✅ **Tipos de alerta**: Expirado, Por vencer, Informativo
- ✅ **Auto-dismiss** después de 10 segundos
- ✅ **Responsive** para móviles
- ✅ **Tema oscuro/claro** compatible

### **Servicio de Planes (`plan.service.ts`)**

- ✅ `getCurrentPlan()` - Obtener plan actual
- ✅ `updatePlanInfo()` - Actualizar información
- ✅ `isPlanExpired()` - Verificar expiración
- ✅ `shouldShowUpgradeAlert()` - Debe mostrar alerta
- ✅ `calculateDaysRemaining()` - Calcular días restantes

## 🚀 **Flujo de Funcionamiento**

### **1. Registro de Usuario**
```
Usuario se registra como Proveedor
    ↓
Se crea expiración de plan (30 días)
    ↓
Usuario paga con Stripe
    ↓
Se actualiza expiración con fecha real
```

### **2. Procesamiento Automático**
```
Cada hora se ejecuta:
    ↓
Busca planes expirados
    ↓
Degrada a plan básico (plan_id = 1)
    ↓
Actualiza status del usuario
    ↓
Registra en logs
```

### **3. Alertas en Frontend**
```
Usuario accede al dashboard
    ↓
Se verifica estado del plan
    ↓
Si está expirado → Alerta crítica
Si expira en 7 días → Alerta de advertencia
    ↓
Usuario puede actualizar plan
```

## 📊 **Estados de Plan**

| Estado | Descripción | Acción |
|--------|-------------|--------|
| **Active** | Plan activo y válido | Acceso completo |
| **Expiring** | Expira en ≤7 días | Mostrar alerta de advertencia |
| **Expired** | Ya expirado | Degradar a básico + alerta crítica |
| **Cancelled** | Cancelado manualmente | Sin acceso premium |

## 🎯 **Beneficios del Sistema**

### **Para la Plataforma:**
- ✅ **Ingresos recurrentes** garantizados
- ✅ **Degradación automática** sin intervención manual
- ✅ **Alertas proactivas** para retener usuarios
- ✅ **Estadísticas detalladas** de expiraciones

### **Para los Usuarios:**
- ✅ **Notificaciones claras** sobre estado del plan
- ✅ **Período de gracia** antes de degradación
- ✅ **Fácil actualización** con un clic
- ✅ **Transparencia** en fechas de expiración

## 🔧 **Configuración**

### **Variables de Entorno**
```env
# Configuración de degradación automática
AUTO_DOWNGRADE_ENABLED=true
GRACE_PERIOD_DAYS=7
DEFAULT_PLAN_ID=1
```

### **Inicialización del Servicio**
```typescript
// En backend/src/index.ts
import { PlanExpirationService } from './lib/plan-expiration-service';

// Iniciar procesamiento automático
PlanExpirationService.startAutomaticProcessing();
```

## 📈 **Métricas Disponibles**

- **Total de planes activos**
- **Planes por vencer** (próximos 7 días)
- **Planes expirados** (sin procesar)
- **Planes degradados** (procesados)

## 🧪 **Testing**

### **Endpoints para Probar:**
```bash
# Obtener plan actual de usuario
GET /plan-expirations/user/1/current

# Obtener planes por vencer
GET /plan-expirations/expiring-soon?days=7

# Obtener estadísticas
GET /plan-expirations/stats
```

### **Componente en Dashboard:**
```html
<plan-upgrade-alert 
  [planInfo]="planInfo" 
  [show]="shouldShowAlert"
  (upgrade)="onUpgrade()"
  (dismiss)="onDismiss()">
</plan-upgrade-alert>
```

## 🎉 **¡Sistema Completo!**

El sistema de caducidad de planes está completamente implementado y listo para usar. Proporciona:

- ✅ **Gestión automática** de expiraciones
- ✅ **Alertas inteligentes** en el frontend
- ✅ **Degradación automática** a plan básico
- ✅ **Estadísticas detalladas** para administración
- ✅ **API completa** para integración

**¿Listo para probar el sistema completo?** 🚀

