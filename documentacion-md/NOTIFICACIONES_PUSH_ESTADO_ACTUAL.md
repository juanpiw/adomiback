# 🔔 Estado Actual del Sistema de Notificaciones Push

**Fecha**: 20 de octubre de 2025  
**Objetivo**: Implementar notificación push al proveedor cuando un cliente agenda una cita + badge rojo en el menú de agenda

---

## 📊 Estado Actual - Backend

### ✅ **LO QUE YA FUNCIONA**

#### 1. **Servicio de Push Notifications** (`backend/src/modules/notifications/services/push.service.ts`)
- ✅ Firebase Admin SDK configurado
- ✅ Tabla `device_tokens` para almacenar tokens FCM
- ✅ Tabla `notifications` para notificaciones in-app
- ✅ Métodos implementados:
  - `registerToken()` - Registrar token FCM de dispositivo
  - `removeToken()` - Eliminar token
  - `notifyUser()` - Enviar push + crear notificación in-app
  - `createInAppNotification()` - Crear notificación en BD
  - `getUserNotifications()` - Obtener notificaciones de usuario
  - `getUnreadCount()` - Contador de no leídas
  - `markAsRead()` - Marcar como leída
  - `markAllAsRead()` - Marcar todas como leídas

#### 2. **Endpoints de Device Tokens** (`backend/src/modules/notifications/routes/device-tokens.routes.ts`)
- ✅ `POST /notifications/device-token` - Registrar token
- ✅ `DELETE /notifications/device-token` - Eliminar token

#### 3. **Sistema de Citas con Push** (`backend/src/modules/appointments/index.ts`)
```typescript
// Línea 64 - Ya está implementado! 🎉
try { 
  await PushService.notifyUser(
    Number(provider_id), 
    'Nueva cita por confirmar', 
    `Cliente: ${appointment.client_name || ''} • ${String(start_time).slice(0,5)}`, 
    { type: 'appointment', appointment_id: String(id) }
  ); 
} catch {}
```

**✅ ESTO YA FUNCIONA**: Cuando un cliente agenda una cita (línea 19-69), el backend:
1. Crea la cita en BD
2. **Emite socket `appointment:created` al proveedor y cliente** (líneas 61-62)
3. **Envía push notification al proveedor** (línea 64)
4. **Crea notificación in-app en BD** (dentro de `notifyUser()`)

#### 4. **Sistema de Sockets** (`backend/src/shared/realtime/socket.ts`)
- ✅ Socket.IO configurado
- ✅ Función `emitToUser(userId, event, payload)` disponible
- ✅ Rooms por usuario: `user:{userId}`

---

## 🔴 LO QUE FALTA/NO FUNCIONA

### ❌ **Problema Principal: Firebase NO está Inicializado**

**Error Actual** (de `FIREBASE_SETUP_GUIDE.md`):
```
[ERROR] [PUSH_SERVICE] Error initializing Firebase Admin | {"message":"Failed to parse private key...
[INFO] [PUSH_SERVICE] Firebase not configured, skipping push notification
```

**Causa**: La clave privada en `.env` está **truncada o mal formateada**.

#### **Solución Inmediata**:
1. Ir a Firebase Console: https://console.firebase.google.com/
2. Proyecto: `adomiapp-notificaciones`
3. Project Settings → Service Accounts → Generate New Private Key
4. Copiar el `private_key` completo (con `\n` literales, no saltos reales)
5. Actualizar en `.env`:
```env
FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\nMIIEvgIBADANBgkqhkiG9w...(COMPLETA)...\n-----END PRIVATE KEY-----\n"
```

---

## 📱 Estado Actual - Frontend

### ❌ **Firebase SDK NO está implementado**

**Checklist de Implementación** (de `PUSH_NOTIFICATIONS_SETUP.md`):

#### Backend ✅
- [x] Tabla `device_tokens`
- [x] Endpoint POST `/notifications/device-token`
- [x] Endpoint DELETE `/notifications/device-token`
- [x] Servicio `PushService` con Firebase Admin
- [x] Hook en `POST /appointments` → push a proveedor
- [x] Variables de entorno documentadas

#### Frontend ❌ (LO QUE FALTA)
- [x] NotificationService in-app ✅
- [ ] **Firebase SDK instalado** ❌
- [ ] **Service Worker para background messages** ❌
- [ ] **Registro de token en login/refresh** ❌
- [ ] **Manejo de clicks en notificaciones** ❌
- [ ] **Badge rojo en icono de Agenda** ❌

---

## 🎯 Plan de Implementación

### **FASE 1: Arreglar Firebase Backend** (5 min)

1. Descargar clave privada de Firebase Console
2. Actualizar `.env` en el servidor
3. Reiniciar backend: `sudo pm2 restart all` (o `sudo npm run start`)
4. Verificar logs: `sudo pm2 logs`
   - Debe aparecer: `[INFO] [PUSH_SERVICE] Firebase Admin initialized`

### **FASE 2: Integrar Firebase SDK en Frontend** (30 min)

#### 2.1. Instalar Firebase en Frontend
```bash
cd adomi-app
npm install firebase
```

#### 2.2. Configurar Firebase en `environment.ts`
```typescript
export const environment = {
  // ... existing config
  firebase: {
    apiKey: "AIzaSyXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX",
    authDomain: "adomiapp-notificaciones.firebaseapp.com",
    projectId: "adomiapp-notificaciones",
    storageBucket: "adomiapp-notificaciones.appspot.com",
    messagingSenderId: "123456789012",
    appId: "1:123456789012:web:abcdef1234567890",
    vapidKey: "BAbcdefghijklmnopqrstuvwxyz..." // Obtener de Firebase Console
  }
};
```

**Cómo obtener `vapidKey`**:
1. Firebase Console → Project Settings → Cloud Messaging
2. Web Push certificates → Generate Key Pair
3. Copiar la clave pública

#### 2.3. Crear Service Worker: `adomi-app/public/firebase-messaging-sw.js`
```javascript
importScripts('https://www.gstatic.com/firebasejs/9.23.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/9.23.0/firebase-messaging-compat.js');

firebase.initializeApp({
  apiKey: "AIzaSyXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX",
  authDomain: "adomiapp-notificaciones.firebaseapp.com",
  projectId: "adomiapp-notificaciones",
  storageBucket: "adomiapp-notificaciones.appspot.com",
  messagingSenderId: "123456789012",
  appId: "1:123456789012:web:abcdef1234567890"
});

const messaging = firebase.messaging();

messaging.onBackgroundMessage((payload) => {
  console.log('[SW] Background message received:', payload);
  const { title, body, icon } = payload.notification || {};
  
  self.registration.showNotification(title || 'Adomi', {
    body: body || 'Nueva notificación',
    icon: icon || '/assets/icon-192.png',
    badge: '/assets/badge-72.png',
    data: payload.data,
    tag: 'adomi-notification'
  });
});
```

#### 2.4. Crear `FirebaseMessagingService` en Angular
```typescript
// adomi-app/src/app/services/firebase-messaging.service.ts
import { Injectable } from '@angular/core';
import { initializeApp } from 'firebase/app';
import { getMessaging, getToken, onMessage } from 'firebase/messaging';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../environments/environment';

@Injectable({
  providedIn: 'root'
})
export class FirebaseMessagingService {
  private messaging: any;

  constructor(private http: HttpClient) {
    if (typeof window !== 'undefined' && environment.firebase) {
      const app = initializeApp(environment.firebase);
      this.messaging = getMessaging(app);
    }
  }

  async requestPermission(): Promise<void> {
    if (!this.messaging) return;

    try {
      const permission = await Notification.requestPermission();
      if (permission === 'granted') {
        console.log('✅ Notification permission granted');
        await this.registerToken();
      } else {
        console.log('❌ Notification permission denied');
      }
    } catch (error) {
      console.error('Error requesting permission:', error);
    }
  }

  private async registerToken(): Promise<void> {
    try {
      const token = await getToken(this.messaging, {
        vapidKey: environment.firebase.vapidKey
      });
      
      console.log('🔑 FCM Token:', token);
      
      // Enviar token al backend
      this.http.post(`${environment.apiBaseUrl}/notifications/device-token`, {
        token,
        platform: 'web'
      }).subscribe({
        next: () => console.log('✅ Token registered in backend'),
        error: (err) => console.error('❌ Error registering token:', err)
      });
    } catch (error) {
      console.error('Error getting token:', error);
    }
  }

  listenForMessages(): void {
    if (!this.messaging) return;

    onMessage(this.messaging, (payload) => {
      console.log('📩 Foreground message received:', payload);
      
      // Mostrar notificación cuando la app está en primer plano
      if (Notification.permission === 'granted') {
        new Notification(payload.notification?.title || 'Adomi', {
          body: payload.notification?.body,
          icon: '/assets/icon-192.png',
          data: payload.data
        });
      }
    });
  }
}
```

#### 2.5. Inicializar en el `AppComponent`
```typescript
// adomi-app/src/app/app.component.ts
import { FirebaseMessagingService } from './services/firebase-messaging.service';

export class AppComponent implements OnInit {
  private firebaseMessaging = inject(FirebaseMessagingService);

  ngOnInit() {
    // Pedir permiso de notificaciones después del login
    this.auth.user$.subscribe(user => {
      if (user && user.role === 'provider') {
        // Solo para proveedores
        this.firebaseMessaging.requestPermission();
        this.firebaseMessaging.listenForMessages();
      }
    });
  }
}
```

### **FASE 3: Badge Rojo en Icono de Agenda** (20 min)

#### 3.1. Crear Servicio de Notificaciones del Proveedor
```typescript
// adomi-app/src/app/dash/services/provider-notifications.service.ts
import { Injectable, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../environments/environment';
import { interval } from 'rxjs';
import { switchMap } from 'rxjs/operators';

@Injectable({
  providedIn: 'root'
})
export class ProviderNotificationsService {
  private apiUrl = environment.apiBaseUrl;
  
  // Signal para el contador de notificaciones no leídas
  unreadCount = signal<number>(0);
  
  // Signal específico para nuevas citas pendientes
  pendingAppointmentsCount = signal<number>(0);

  constructor(private http: HttpClient) {}

  startPolling(): void {
    // Polling cada 30 segundos
    interval(30000).pipe(
      switchMap(() => this.fetchUnreadCount())
    ).subscribe();

    // Fetch inicial
    this.fetchUnreadCount().subscribe();
  }

  private fetchUnreadCount() {
    return this.http.get<{ success: boolean; count: number }>(
      `${this.apiUrl}/notifications/unread-count`
    ).pipe(
      tap(response => {
        if (response.success) {
          this.unreadCount.set(response.count);
          // Filtrar solo las de tipo 'appointment'
          this.fetchAppointmentNotifications();
        }
      })
    );
  }

  private fetchAppointmentNotifications(): void {
    this.http.get<any>(`${this.apiUrl}/notifications?unread=true&type=appointment`)
      .subscribe({
        next: (response) => {
          if (response.success) {
            this.pendingAppointmentsCount.set(response.notifications.length);
          }
        }
      });
  }

  markAsRead(notificationId: number): void {
    this.http.post(`${this.apiUrl}/notifications/${notificationId}/read`, {})
      .subscribe(() => {
        this.fetchUnreadCount().subscribe();
      });
  }
}
```

#### 3.2. Backend: Agregar Endpoint de Contador
```typescript
// backend/src/modules/notifications/routes/notifications.routes.ts

router.get('/notifications/unread-count', authenticateToken, async (req: Request, res: Response) => {
  try {
    const user = (req as any).user || {};
    const count = await PushService.getUnreadCount(Number(user.id));
    return res.json({ success: true, count });
  } catch (err) {
    return res.status(500).json({ success: false, error: 'Error getting unread count' });
  }
});

router.get('/notifications', authenticateToken, async (req: Request, res: Response) => {
  try {
    const user = (req as any).user || {};
    const unread = req.query.unread === 'true';
    const type = req.query.type ? String(req.query.type) : undefined;
    
    const notifications = await PushService.getUserNotifications(
      Number(user.id), 
      20, 
      0, 
      unread
    );
    
    // Filtrar por tipo si se especifica
    const filtered = type 
      ? notifications.filter(n => n.type === type)
      : notifications;
    
    return res.json({ success: true, notifications: filtered });
  } catch (err) {
    return res.status(500).json({ success: false, error: 'Error getting notifications' });
  }
});

router.post('/notifications/:id/read', authenticateToken, async (req: Request, res: Response) => {
  try {
    const user = (req as any).user || {};
    const notificationId = Number(req.params.id);
    const success = await PushService.markAsRead(notificationId, Number(user.id));
    return res.json({ success });
  } catch (err) {
    return res.status(500).json({ success: false, error: 'Error marking as read' });
  }
});
```

#### 3.3. Agregar Badge al Icono de Agenda
```typescript
// En el componente del rail/menú del proveedor
export class ProviderRailComponent {
  private notificationsService = inject(ProviderNotificationsService);
  
  // Computed signal para mostrar el badge
  showAppointmentBadge = computed(() => 
    this.notificationsService.pendingAppointmentsCount() > 0
  );
  
  appointmentBadgeCount = this.notificationsService.pendingAppointmentsCount;

  ngOnInit() {
    // Iniciar polling
    this.notificationsService.startPolling();
  }
}
```

```html
<!-- En el template del menú -->
<a routerlink="/dash/agenda" class="rail-item">
  <ui-icon name="calendar"></ui-icon>
  <span class="badge-notification" *ngIf="showAppointmentBadge()">
    {{ appointmentBadgeCount() }}
  </span>
</a>
```

```scss
// Estilos para el badge rojo
.rail-item {
  position: relative;

  .badge-notification {
    position: absolute;
    top: -4px;
    right: -4px;
    background: #ef4444; // Rojo
    color: white;
    border-radius: 50%;
    min-width: 18px;
    height: 18px;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 11px;
    font-weight: 600;
    padding: 0 4px;
    box-shadow: 0 2px 4px rgba(0,0,0,0.2);
  }
}
```

### **FASE 4: Socket Real-time para Badge Instantáneo** (15 min)

#### 4.1. Conectar Socket en el Frontend
```typescript
// adomi-app/src/app/services/socket.service.ts
import { Injectable } from '@angular/core';
import { io, Socket } from 'socket.io-client';
import { environment } from '../../environments/environment';
import { AuthService } from '../auth/services/auth.service';

@Injectable({
  providedIn: 'root'
})
export class SocketService {
  private socket: Socket | null = null;

  constructor(private auth: AuthService) {}

  connect(): void {
    const user = this.auth.getCurrentUser();
    if (!user) return;

    this.socket = io(environment.apiBaseUrl, {
      auth: {
        token: localStorage.getItem('adomi_access_token')
      }
    });

    this.socket.on('connect', () => {
      console.log('✅ Socket connected');
      // Unirse a la room del usuario
      this.socket?.emit('join', `user:${user.id}`);
    });

    this.socket.on('disconnect', () => {
      console.log('❌ Socket disconnected');
    });
  }

  on(event: string, callback: (data: any) => void): void {
    this.socket?.on(event, callback);
  }

  disconnect(): void {
    this.socket?.disconnect();
  }
}
```

#### 4.2. Escuchar Evento `appointment:created`
```typescript
// En ProviderNotificationsService
constructor(
  private http: HttpClient,
  private socket: SocketService
) {
  // Escuchar eventos de socket
  this.socket.on('appointment:created', (appointment) => {
    console.log('🔔 Nueva cita recibida por socket:', appointment);
    // Incrementar contador inmediatamente
    this.pendingAppointmentsCount.update(count => count + 1);
    this.unreadCount.update(count => count + 1);
  });
}
```

---

## 🚀 Resumen de Acciones

### **Urgente (5 min)**
1. ✅ Arreglar Firebase Private Key en `.env`
2. ✅ Reiniciar backend
3. ✅ Verificar logs: debe aparecer `Firebase Admin initialized`

### **Prioridad Alta (1 hora)**
4. ✅ Instalar Firebase SDK en frontend
5. ✅ Configurar Firebase en `environment.ts`
6. ✅ Crear Service Worker
7. ✅ Crear `FirebaseMessagingService`
8. ✅ Registrar token al login (solo proveedores)

### **Prioridad Media (30 min)**
9. ✅ Crear endpoint `/notifications/unread-count`
10. ✅ Crear `ProviderNotificationsService`
11. ✅ Agregar badge rojo al icono de Agenda
12. ✅ Conectar Socket.IO en frontend
13. ✅ Escuchar evento `appointment:created`

---

## ✅ Checklist Final

- [ ] Firebase Backend configurado correctamente
- [ ] Push notifications funcionando (probar agendando cita)
- [ ] Badge rojo aparece al recibir notificación
- [ ] Badge se actualiza en tiempo real con Socket.IO
- [ ] Badge desaparece al marcar como leída
- [ ] Notificaciones persisten en BD (tabla `notifications`)
- [ ] Service Worker maneja notificaciones en background

---

## 🎯 Resultado Esperado

### Flujo Completo:
1. **Cliente** hace clic en "Agendar Cita" y confirma
2. **Backend** crea la cita en BD
3. **Backend** emite socket `appointment:created` a proveedor
4. **Backend** envía push FCM al proveedor
5. **Backend** crea notificación in-app en tabla `notifications`
6. **Frontend Proveedor** recibe socket → incrementa badge instantáneamente
7. **Frontend Proveedor** recibe push notification (si está en background)
8. **Icono de Agenda** muestra badge rojo con número de citas pendientes
9. **Proveedor** hace clic en agenda → badge desaparece (se marcan como leídas)

---

## 📝 Notas Adicionales

- **Producción**: Asegúrate de que Firebase esté configurado para el dominio `adomiapp.com`
- **Testing**: Usa Firebase Console para enviar notificaciones de prueba
- **Performance**: El polling cada 30s es suficiente como fallback; los sockets hacen el update inmediato
- **Seguridad**: Los tokens FCM se eliminan automáticamente al logout

---

**Estado**: ✅ Backend listo, ❌ Firebase misconfigured, ❌ Frontend pendiente  
**Próximo Paso**: Arreglar Firebase Private Key → Implementar Frontend

