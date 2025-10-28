## Plan de Auditoría e Implementación I18N (ES ⇄ EN)

Objetivo: Inventariar todo lo que requiere traducción en la app (frontend, contenidos, correos, notificaciones, errores), definir estrategia técnica de internacionalización, formatos (fecha/número/moneda) y plan de despliegue para operar en español (es-CL) e inglés (en-US).

---

### 1) Alcance y Locales Meta

- Locales objetivo iniciales: `es-CL` y `en-US`.
- Componentes cubiertos:
  - Frontend Angular (templates `.html`, textos en `.ts`, UI en `libs/shared-ui`).
  - Contenidos estáticos (términos, páginas informativas, SEO/meta).
  - Emails y notificaciones (asuntos/cuerpos/títulos).
  - Mensajes de validación/errores visibles al usuario.
  - Formatos de fecha, hora, números y moneda.

No alcance (fase 1): rutas localizadas (URLs con `/en/`), traducción de datos ingresados por usuarios, ni soporte RTL.

---

### 2) Inventario de Áreas a Traducir

2.1 Frontend (Angular)
- Shell y navegación:
  - `adomi-app/src/app/client/layout/*` (menu, tooltips, labels, modales requeridos de perfil).
  - `adomi-app/src/app/dash/*` (layout proveedor, navegación, encabezados).
- Autenticación y registro:
  - `auth/register`, `auth/login`, `auth/google-success`, `auth/select-plan`, `auth/checkout`, `auth/payment-success` (títulos, mensajes, pasos, botones, estados de carga/éxito/error).
- Flujos cliente:
  - Reservas/búsqueda (`client/pages/*`): filtros, placeholders, vacíos, tooltips.
  - Perfil cliente (campos y validaciones visibles).
- Flujos proveedor:
  - Ingresos/finanzas (tablas, resúmenes, filtros, estados), agenda, perfil proveedor, wizard de pagos (si aplica).
- UI compartida (design system):
  - `adomi-app/src/libs/shared-ui/**` (componentes reutilizables: botones, inputs, toasts/snackbars, modales, iconos con labels, tablas, paginación). Requiere introducir inputs/`@Input()` para keys de traducción o consumir `TranslateService` internamente.
- Mensajes de validación:
  - Formularios reactivos: required, email inválido, min/max length, patrones, etc. Centralizar mensajes en un pipe/servicio de validación i18n.
- Feedback runtime:
  - Toasts/alerts, confirm dialogs, estados vacíos, loaders.

2.2 Backend (visibles al usuario)
- Emails transaccionales:
  - Asuntos y cuerpos (p. ej., recibos/boletas de planes en `EmailService.sendClientReceipt`).
  - Plantillas/partials si existieran.
- Notificaciones push/in-app:
  - Títulos y mensajes (servicios de notificaciones).
- Códigos y mensajes de error API:
  - Preferir códigos de error estables + mensajes neutrales; la UI mapea códigos → texto i18n. Si hay mensajes en español, mantener “message” para logs y exponer “code” para UI.

2.3 Contenidos estáticos
- Términos y condiciones, privacidad, páginas informativas:
  - `adomi-app/src/app/dash/pages/terminos/**` (migrar a i18n; dividir por secciones).
- SEO/meta:
  - `index.html` (title/description), `manifest.*`, etiquetas OG/Twitter si aplican.
- Recursos estáticos con texto embebido (imágenes):
  - Evaluar variantes EN cuando haya banners/hero con texto.

2.4 Formatos y moneda
- Fecha/hora/número/moneda:
  - Pipes de Angular condicionados por `LOCALE_ID` (`en-US`, `es-CL`).
  - Mapeo de currency por país/tenant: CLP (zero-decimal) vs USD (2 decimales); revisar componentes de precios y resúmenes.

---

### 3) Estrategia Técnica (Frontend)

- Librería: `@ngx-translate/core` + `@ngx-translate/http-loader`.
- Estructura de archivos de traducción:
  - `assets/i18n/es.json`, `assets/i18n/en.json`.
  - Estructura por dominios: `auth.*`, `client.*`, `provider.*`, `shared.*`, `errors.*`, `validation.*`.
- Uso en templates: `{{ 'auth.login.title' | translate }}`.
- Uso en componentes TS: `this.translate.instant('errors.network')` o `get('key').subscribe(...)`.
- LanguageService:
  - Detección: preferencia en `localStorage` > query param > idioma del navegador.
  - Métodos: `setLanguage(lang)`, persistencia, emisión de evento.
  - Integración con `registerLocaleData` y provider dinámico de `LOCALE_ID`.
- Formatos:
  - Pipe `currency` con `currencyCode` por contexto (CLP/USD) y `digitsInfo` adecuados.
  - Fechas con `date` respetando `LOCALE_ID`.

---

### 4) Estrategia Técnica (Backend)

- Emails: plantillas por idioma (e.g., `templates/email/receipt.es.hbs` y `.en.hbs`) o variables i18n externas consumidas por el servicio.
- Notificaciones: definir `title_key`/`body_key` + payload con parámetros; UI resuelve claves si corresponde.
- Errores API: emitir `code` estable (ej. `PROFILE_INCOMPLETE`, `PAYMENT_FAILED`); el frontend traduce. Mantener `message` interno para logs.

---

### 5) Plan de Extracción y Refactor

1) Seed inicial de `en.json`/`es.json` con base de claves (mínimo: auth, layout, feedback, validaciones).
2) Reemplazo incremental:
   - Prioridad 1: pantallas de registro/pago (auth, select-plan, checkout, payment-success), layouts.
   - Prioridad 2: dashboard proveedor (ingresos/agenda), cliente (reservas/perfil), componentes compartidos más usados.
   - Prioridad 3: términos/páginas informativas, SEO/meta.
3) Validaciones: factorizar `ValidationMessagesService` con mapa de claves por error.
4) Emails: parametrizar asuntos/cuerpos con plantillas i18n.
5) Notificaciones: estandarizar payload con claves.

---

### 6) Glosario y Convenciones

- Claves en snake-case por dominio: `auth.login.title`, `shared.actions.save`, `validation.required`.
- Evitar incrustar HTML en textos; usar placeholders: `{{amount}}`, `{{date}}`.
- Reutilizar claves para consistencia (ej. `shared.actions.continue`).

---

### 7) QA y Accesibilidad

- Revisión lingüística EN por nativo/bilingüe.
- Tests visuales de overflow/longitud en EN.
- Accesibilidad: `aria-label` también con i18n.

---

### 8) Despliegue y Toggle

- Fase 1: habilitar selector de idioma (header) + autodetección.
- Fase 2: cubrir módulos críticos (auth/checkout/dashboard principal).
- Fase 3: correos/notificaciones y contenidos estáticos.

---

### 9) Lista de Verificación por Módulo (Inicial)

- Auth (register/login/google-success/select-plan/checkout/payment-success): títulos, descripciones, botones, errores, loaders.
- Client (reservas/búsqueda/perfil): filtros, vacíos, tooltips, validaciones.
- Provider (ingresos/agenda/perfil): columnas, filtros, estados, tooltips.
- Shared-UI: botones, inputs, toasts, modales, tablas, paginación.
- Términos/legales: secciones y enlaces.
- Emails: asuntos/cuerpo recibos/planes; placeholders `{{amount}}`, `{{currency}}`, `{{date}}`.
- Notificaciones: títulos/mensajes estándares.
- SEO/meta: title/description en `index.html` y manifest.

---

### 10) Próximos Pasos (Implementación)

1) Añadir dependencias `@ngx-translate/*` y bootstrap i18n en `AppModule`.
2) Crear `assets/i18n/es.json` y `en.json` (seed con 50–100 claves críticas).
3) Implementar `LanguageService` + provider dinámico de `LOCALE_ID` y `registerLocaleData`.
4) Reemplazar textos en Auth + layouts; validar formatos (CLP/USD, fecha/hora).
5) Integrar i18n en `shared-ui` y validaciones.
6) Parametrizar emails/notifications.
7) QA lingüística y visual; toggle en producción.



