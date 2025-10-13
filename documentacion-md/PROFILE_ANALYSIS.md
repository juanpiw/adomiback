# Análisis del Perfil del Profesional

## 📊 Resumen Ejecutivo

Este documento analiza los requerimientos de la pantalla de perfil del profesional (`/dash/perfil`) y propone la implementación completa de endpoints y servicios necesarios.

---

## 🎯 Datos que se Muestran en la Pantalla

### **1. Información Básica** (`app-info-basica`)
```typescript
interface BasicInfo {
  fullName: string;           // Nombre completo del profesional
  professionalTitle: string;  // Ej: "Estilista Profesional"
  mainCommune: string;        // Comuna principal de trabajo
  yearsExperience: number;    // Años de experiencia
}
```

**Campos en BD:** `provider_profiles`
- `full_name` → `fullName`
- `professional_title` → `professionalTitle`
- `main_commune` → `mainCommune`
- `years_experience` → `yearsExperience`

---

### **2. Fotos de Perfil** (`app-seccion-fotos`)
```typescript
interface ProfilePhotos {
  profilePhotoUrl: string | null;  // Foto de perfil (96x96)
  coverPhotoUrl: string | null;    // Foto de portada (256x96)
}
```

**Campos en BD:** `provider_profiles`
- `profile_photo_url` → `profilePhotoUrl`
- `cover_photo_url` → `coverPhotoUrl`

**Requerimientos:**
- Subida de imágenes al servidor
- Endpoint: `POST /provider/profile/upload-photo`
- Tipos: `profile` | `cover`
- Max size: 5MB
- Formatos: JPG, PNG, WEBP

---

### **3. Sobre Mí** (`app-sobre-mi`)
```typescript
interface Bio {
  bio: string;  // Texto libre, max 500 caracteres
}
```

**Campos en BD:** `provider_profiles`
- `bio` → `bio`

---

### **4. Mis Servicios** (`app-mis-servicios`)
```typescript
interface Service {
  id: string;
  name: string;         // Nombre del servicio
  duration: number;     // Duración en minutos
  price: number;        // Precio en CLP
  description?: string; // Descripción opcional
}
```

**Tabla en BD:** `provider_services`
```sql
CREATE TABLE provider_services (
  id INT AUTO_INCREMENT PRIMARY KEY,
  provider_id INT NOT NULL,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  price DECIMAL(10,2) NOT NULL,
  duration_minutes INT NOT NULL,
  category_id INT,
  custom_category VARCHAR(255),
  is_active BOOLEAN DEFAULT TRUE,
  order_index INT DEFAULT 0,
  service_image_url VARCHAR(500),
  is_featured BOOLEAN DEFAULT FALSE,
  booking_count INT DEFAULT 0,
  average_rating DECIMAL(3,2) DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (provider_id) REFERENCES users(id) ON DELETE CASCADE
);
```

**Endpoints necesarios:**
- `GET /provider/services` - Listar servicios del profesional
- `POST /provider/services` - Crear nuevo servicio
- `PUT /provider/services/:id` - Actualizar servicio
- `DELETE /provider/services/:id` - Eliminar servicio

---

### **5. Portafolio** (`app-portafolio`)
```typescript
interface PortfolioImage {
  id: string;
  url: string;
  alt: string;
  type: 'image' | 'video';
  thumbnail?: string;  // Para videos
}
```

**Tabla en BD:** `provider_portfolio`
```sql
CREATE TABLE provider_portfolio (
  id INT AUTO_INCREMENT PRIMARY KEY,
  provider_id INT NOT NULL,
  media_type ENUM('image', 'video') NOT NULL,
  media_url VARCHAR(500) NOT NULL,
  thumbnail_url VARCHAR(500),
  alt_text VARCHAR(255),
  order_index INT DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (provider_id) REFERENCES users(id) ON DELETE CASCADE,
  INDEX idx_provider (provider_id)
);
```

**Endpoints necesarios:**
- `GET /provider/portfolio` - Listar imágenes/videos
- `POST /provider/portfolio` - Subir imagen/video
- `DELETE /provider/portfolio/:id` - Eliminar item
- `PUT /provider/portfolio/reorder` - Reordenar items

---

### **6. Ubicación y Disponibilidad** (`app-ubicacion-disponibilidad`)
```typescript
interface LocationSettings {
  availableForNewBookings: boolean;
  shareRealTimeLocation: boolean;
  coverageZones: CoverageZone[];
}

interface CoverageZone {
  id: string;
  name: string;  // Nombre de la comuna
}
```

**Tabla en BD:** `provider_coverage_zones`
```sql
CREATE TABLE provider_coverage_zones (
  id INT AUTO_INCREMENT PRIMARY KEY,
  provider_id INT NOT NULL,
  commune_name VARCHAR(100) NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (provider_id) REFERENCES users(id) ON DELETE CASCADE,
  INDEX idx_provider (provider_id),
  UNIQUE KEY unique_provider_commune (provider_id, commune_name)
);
```

**Campos en BD:** `provider_profiles`
- Campo nuevo: `available_for_bookings` BOOLEAN
- Campo nuevo: `share_real_time_location` BOOLEAN

**Endpoints necesarios:**
- `GET /provider/coverage-zones` - Listar zonas
- `POST /provider/coverage-zones` - Agregar zona
- `DELETE /provider/coverage-zones/:id` - Eliminar zona
- `PUT /provider/availability` - Actualizar disponibilidad

---

### **7. Progreso del Perfil** (`app-progress-perfil`)
```typescript
interface ProfileProgress {
  progress: number;  // 0-100%
  suggestion: string;
}
```

**Cálculo de Completitud:**
```typescript
const calculateProfileCompletion = (profile: any): number => {
  let score = 0;
  
  if (profile.full_name) score += 10;
  if (profile.professional_title) score += 10;
  if (profile.main_commune) score += 10;
  if (profile.years_experience > 0) score += 5;
  if (profile.bio && profile.bio.length > 50) score += 15;
  if (profile.profile_photo_url) score += 15;
  if (profile.cover_photo_url) score += 10;
  if (profile.services_count > 0) score += 15;  // Al menos 1 servicio
  if (profile.portfolio_count >= 2) score += 10;  // Al menos 2 items
  
  return score;
};
```

---

## 🔧 Estado Actual del Backend

### ✅ **Endpoints Existentes:**

1. **GET /provider/profile**
   - Obtiene el perfil del profesional
   - ✅ Ya implementado en `provider.routes.ts`

2. **PUT /provider/profile**
   - Actualiza información básica
   - ✅ Ya implementado en `provider.routes.ts`
   - Campos soportados: `full_name`, `professional_title`, `main_commune`, `main_region`, `years_experience`, `bio`

### ❌ **Endpoints Faltantes:**

1. **POST /provider/profile/upload-photo**
   - Subir foto de perfil o portada
   - Manejo de multipart/form-data
   - Almacenamiento en `/uploads/providers/{provider_id}/`
   - Actualizar `profile_photo_url` o `cover_photo_url`

2. **GET /provider/services**
   - Listar servicios del profesional

3. **POST /provider/services**
   - Crear nuevo servicio

4. **PUT /provider/services/:id**
   - Actualizar servicio existente

5. **DELETE /provider/services/:id**
   - Eliminar servicio

6. **GET /provider/portfolio**
   - Listar items del portafolio

7. **POST /provider/portfolio**
   - Subir imagen o video al portafolio

8. **DELETE /provider/portfolio/:id**
   - Eliminar item del portafolio

9. **PUT /provider/portfolio/reorder**
   - Reordenar items del portafolio

10. **GET /provider/coverage-zones**
    - Listar zonas de cobertura

11. **POST /provider/coverage-zones**
    - Agregar zona de cobertura

12. **DELETE /provider/coverage-zones/:id**
    - Eliminar zona de cobertura

13. **PUT /provider/availability**
    - Actualizar disponibilidad para nuevas reservas
    - Actualizar compartir ubicación en tiempo real

---

## 📋 Tablas de Base de Datos Necesarias

### **1. ✅ provider_profiles** (Ya existe)
- Campos actuales son suficientes para información básica
- Agregar campos:
  - `available_for_bookings` BOOLEAN DEFAULT TRUE
  - `share_real_time_location` BOOLEAN DEFAULT FALSE

### **2. ✅ provider_services** (Ya existe según schema)
- Tabla completa, no requiere cambios

### **3. ❌ provider_portfolio** (NO EXISTE)
```sql
CREATE TABLE provider_portfolio (
  id INT AUTO_INCREMENT PRIMARY KEY,
  provider_id INT NOT NULL,
  media_type ENUM('image', 'video') NOT NULL,
  media_url VARCHAR(500) NOT NULL,
  thumbnail_url VARCHAR(500),
  alt_text VARCHAR(255),
  order_index INT DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (provider_id) REFERENCES users(id) ON DELETE CASCADE,
  INDEX idx_provider (provider_id),
  INDEX idx_order (provider_id, order_index)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
```

### **4. ❌ provider_coverage_zones** (NO EXISTE)
```sql
CREATE TABLE provider_coverage_zones (
  id INT AUTO_INCREMENT PRIMARY KEY,
  provider_id INT NOT NULL,
  commune_name VARCHAR(100) NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (provider_id) REFERENCES users(id) ON DELETE CASCADE,
  INDEX idx_provider (provider_id),
  UNIQUE KEY unique_provider_commune (provider_id, commune_name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
```

---

## 🛠️ Plan de Implementación

### **Fase 1: Base de Datos** (Prioridad Alta)
1. Crear migración para agregar campos a `provider_profiles`:
   - `available_for_bookings`
   - `share_real_time_location`

2. Crear tabla `provider_portfolio`

3. Crear tabla `provider_coverage_zones`

### **Fase 2: Endpoints de Servicios** (Prioridad Alta)
1. Implementar CRUD completo de servicios
2. Estos son los más críticos para el funcionamiento del perfil

### **Fase 3: Upload de Fotos** (Prioridad Media)
1. Implementar endpoint de subida de fotos
2. Configurar multer o similar
3. Crear carpeta `/uploads/providers/{provider_id}/`

### **Fase 4: Portafolio** (Prioridad Media)
1. Implementar endpoints de portafolio
2. Subida de imágenes y videos

### **Fase 5: Ubicación y Cobertura** (Prioridad Baja)
1. Implementar endpoints de zonas de cobertura
2. Actualizar disponibilidad

### **Fase 6: Frontend Integration** (Prioridad Alta)
1. Crear servicio Angular: `ProviderProfileService`
2. Integrar con los componentes existentes
3. Manejar estados de carga y errores
4. Implementar cálculo de progreso en tiempo real

---

## 📝 Estructura de Respuestas

### **GET /provider/profile**
```json
{
  "success": true,
  "profile": {
    "id": 1,
    "provider_id": 34,
    "full_name": "Elena Torres",
    "professional_title": "Estilista Profesional",
    "main_commune": "Providencia",
    "main_region": "Región Metropolitana",
    "years_experience": 5,
    "bio": "Estilista profesional con más de 5 años...",
    "profile_photo_url": "https://...",
    "cover_photo_url": "https://...",
    "profile_completion": 75,
    "available_for_bookings": true,
    "share_real_time_location": false,
    "is_verified": false,
    "verification_status": "none",
    "rating_average": "4.50",
    "review_count": 23,
    "created_at": "2025-01-01T00:00:00.000Z",
    "updated_at": "2025-10-13T00:00:00.000Z"
  }
}
```

### **GET /provider/services**
```json
{
  "success": true,
  "services": [
    {
      "id": 1,
      "name": "Corte de Pelo",
      "description": "Corte personalizado según tu estilo",
      "price": 25000,
      "duration_minutes": 60,
      "is_active": true,
      "booking_count": 45,
      "average_rating": "4.80"
    }
  ]
}
```

### **GET /provider/portfolio**
```json
{
  "success": true,
  "portfolio": [
    {
      "id": 1,
      "media_type": "image",
      "media_url": "https://...",
      "thumbnail_url": null,
      "alt_text": "Corte de pelo moderno",
      "order_index": 0
    }
  ]
}
```

---

## 🎯 Próximos Pasos

1. ✅ Revisar endpoints existentes
2. ⏳ Crear migraciones de base de datos
3. ⏳ Implementar endpoints faltantes
4. ⏳ Crear servicio Angular
5. ⏳ Integrar con componentes del frontend
6. ⏳ Testing e2e

---

**Última actualización:** 2025-10-13
**Estado:** Análisis Completo - Listo para Implementación

