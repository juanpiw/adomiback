# 🚀 Guía de Inicio - Implementación del Perfil del Proveedor

## 🎯 **Objetivo**
Implementar el sistema completo de gestión de perfil del proveedor para que el frontend en `http://localhost:4200/dash/perfil` funcione con datos reales.

## 📋 **Checklist de Implementación**

### **Fase 1: Base de Datos** ✅
- [ ] Crear tabla `provider_profiles`
- [ ] Crear tabla `provider_services` (actualizada)
- [ ] Crear tabla `provider_portfolio`
- [ ] Crear tabla `provider_locations`
- [ ] Insertar categorías de servicios (seed data)
- [ ] Crear triggers para cálculo automático
- [ ] Crear índices de optimización

### **Fase 2: Endpoints Básicos** 🔧
- [ ] `POST /api/provider/profile` - Crear perfil inicial
- [ ] `GET /api/provider/profile` - Obtener perfil completo
- [ ] `PUT /api/provider/profile` - Actualizar información
- [ ] `GET /api/provider/completion` - Calcular completitud

### **Fase 3: Upload de Imágenes** 📸
- [ ] `POST /api/provider/photos` - Subir foto de perfil
- [ ] `POST /api/provider/photos/cover` - Subir foto de portada
- [ ] Sistema de compresión de imágenes
- [ ] Validación de formatos (JPG, PNG, WebP)
- [ ] Límite de tamaño (5MB)

### **Fase 4: Servicios del Proveedor** 💼
- [ ] `POST /api/provider/services` - Crear servicio
- [ ] `GET /api/provider/services` - Listar servicios
- [ ] `PUT /api/provider/services/:id` - Actualizar servicio
- [ ] `DELETE /api/provider/services/:id` - Eliminar servicio
- [ ] `PATCH /api/provider/services/reorder` - Reordenar
- [ ] `GET /api/categories` - Listar categorías

### **Fase 5: Testing e Integración** 🧪
- [ ] Testear creación de perfil
- [ ] Testear subida de fotos
- [ ] Testear CRUD de servicios
- [ ] Conectar frontend con backend
- [ ] Verificar cálculo de completitud
- [ ] Testing end-to-end

---

## 🗄️ **Schema SQL para Perfil del Proveedor**

### **Tabla: provider_profiles**
```sql
CREATE TABLE provider_profiles (
  id INT AUTO_INCREMENT PRIMARY KEY,
  provider_id INT NOT NULL UNIQUE,
  full_name VARCHAR(255) NOT NULL,
  professional_title VARCHAR(255),
  main_commune VARCHAR(100),
  main_region VARCHAR(100),
  years_experience INT DEFAULT 0,
  bio TEXT,
  profile_photo_url VARCHAR(500),
  cover_photo_url VARCHAR(500),
  profile_completion INT DEFAULT 0,
  is_verified BOOLEAN DEFAULT FALSE,
  verification_status ENUM('none', 'pending', 'approved', 'rejected') DEFAULT 'none',
  profile_views INT DEFAULT 0,
  rating_average DECIMAL(3,2) DEFAULT 0,
  review_count INT DEFAULT 0,
  completed_appointments INT DEFAULT 0,
  last_profile_update TIMESTAMP,
  is_online BOOLEAN DEFAULT FALSE,
  last_seen TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  
  FOREIGN KEY (provider_id) REFERENCES users(id) ON DELETE CASCADE,
  INDEX idx_provider (provider_id),
  INDEX idx_verification (verification_status),
  INDEX idx_commune (main_commune),
  INDEX idx_region (main_region),
  INDEX idx_verified (is_verified),
  INDEX idx_completion (profile_completion),
  INDEX idx_rating (rating_average),
  
  CONSTRAINT chk_completion CHECK (profile_completion >= 0 AND profile_completion <= 100),
  CONSTRAINT chk_experience CHECK (years_experience >= 0),
  CONSTRAINT chk_rating CHECK (rating_average >= 0 AND rating_average <= 5)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
```

### **Cálculo de Completitud del Perfil**
```typescript
interface ProfileCompletionCriteria {
  full_name: boolean;          // 10%
  professional_title: boolean;  // 10%
  main_commune: boolean;        // 10%
  years_experience: boolean;    // 5%
  bio: boolean;                 // 15%
  profile_photo_url: boolean;   // 15%
  cover_photo_url: boolean;     // 10%
  has_services: boolean;        // 15% (al menos 1 servicio)
  has_portfolio: boolean;       // 10% (al menos 2 items)
}

// Total: 100%
```

---

## 🔌 **Endpoints a Implementar**

### **1. Crear/Actualizar Perfil**

#### **POST `/api/provider/profile`**
```typescript
// Request
{
  full_name: string;
  professional_title: string;
  main_commune: string;
  main_region: string;
  years_experience: number;
  bio: string;
}

// Response
{
  id: number;
  provider_id: number;
  full_name: string;
  professional_title: string;
  main_commune: string;
  main_region: string;
  years_experience: number;
  bio: string;
  profile_completion: number;
  completion_suggestions: string[];
  created_at: Date;
  updated_at: Date;
}
```

**Lógica:**
1. Validar que el usuario sea proveedor
2. Verificar si ya existe perfil (UPDATE) o crear nuevo (INSERT)
3. Calcular completitud del perfil
4. Generar sugerencias de mejora
5. Retornar perfil actualizado

**Archivo:** `backend/src/endpoints/provider-profile.ts`

---

### **2. Obtener Perfil**

#### **GET `/api/provider/profile`**
```typescript
// Headers
Authorization: Bearer <token>

// Response
{
  id: number;
  provider_id: number;
  full_name: string;
  professional_title: string;
  main_commune: string;
  main_region: string;
  years_experience: number;
  bio: string;
  profile_photo_url: string | null;
  cover_photo_url: string | null;
  profile_completion: number;
  completion_suggestions: string[];
  is_verified: boolean;
  verification_status: 'none' | 'pending' | 'approved' | 'rejected';
  rating_average: number;
  review_count: number;
  completed_appointments: number;
  is_online: boolean;
  created_at: Date;
  updated_at: Date;
}
```

**Lógica:**
1. Obtener user_id del token JWT
2. Buscar perfil en `provider_profiles`
3. Si no existe, retornar perfil vacío con defaults
4. Calcular completitud en tiempo real
5. Generar sugerencias de mejora

---

### **3. Subir Fotos**

#### **POST `/api/provider/photos`**
```typescript
// Request (multipart/form-data)
{
  file: File;
  type: 'profile' | 'cover';
}

// Response
{
  photo_url: string;
  profile_completion: number;
}
```

**Lógica:**
1. Validar formato de imagen (JPEG, PNG, WebP)
2. Validar tamaño (max 5MB)
3. Comprimir imagen si es necesario
4. Guardar en storage (S3 o local /uploads)
5. Actualizar URL en `provider_profiles`
6. Recalcular completitud
7. Retornar URL pública

**Archivo:** `backend/src/lib/image-upload.ts`

---

### **4. Listar Categorías**

#### **GET `/api/categories`**
```typescript
// Response
[
  {
    id: number;
    name: string;
    slug: string;
    description: string;
    icon_name: string;
    color_hex: string;
  }
]
```

**Lógica:**
1. Obtener todas las categorías activas
2. Ordenar por order_index
3. Retornar array

---

### **5. CRUD de Servicios**

#### **POST `/api/provider/services`**
```typescript
// Request
{
  name: string;
  description: string;
  price: number;
  duration_minutes: number;
  category_id: number | null;
  custom_category?: string; // Si category_id es "Otro"
}

// Response
{
  id: number;
  provider_id: number;
  name: string;
  description: string;
  price: number;
  duration_minutes: number;
  category_id: number | null;
  custom_category: string | null;
  is_active: boolean;
  order_index: number;
  created_at: Date;
}
```

**Validaciones:**
- Nombre: 3-255 caracteres
- Precio: > 0
- Duración: 15-480 minutos
- Descripción: opcional, max 1000 caracteres

---

#### **GET `/api/provider/services`**
```typescript
// Response
[
  {
    id: number;
    name: string;
    description: string;
    price: number;
    duration_minutes: number;
    category: {
      id: number;
      name: string;
      slug: string;
    } | null;
    custom_category: string | null;
    is_active: boolean;
    order_index: number;
    booking_count: number;
    average_rating: number;
    created_at: Date;
  }
]
```

**Lógica:**
1. Obtener servicios del proveedor
2. JOIN con `service_categories`
3. Ordenar por `order_index`
4. Retornar array

---

#### **PUT `/api/provider/services/:id`**
```typescript
// Request
{
  name?: string;
  description?: string;
  price?: number;
  duration_minutes?: number;
  category_id?: number;
  custom_category?: string;
  is_active?: boolean;
}

// Response
{
  id: number;
  ...campos actualizados
}
```

**Validaciones:**
- Verificar ownership (el servicio pertenece al proveedor)
- Validar campos modificados
- No permitir precio negativo
- No permitir duración < 15 min

---

#### **DELETE `/api/provider/services/:id`**
```typescript
// Response
{
  success: boolean;
  message: string;
}
```

**Lógica:**
1. Verificar ownership
2. Verificar que no tenga citas futuras
3. Soft delete (is_active = false) o hard delete
4. Retornar confirmación

---

#### **PATCH `/api/provider/services/reorder`**
```typescript
// Request
{
  service_ids: number[]; // Array ordenado de IDs
}

// Response
{
  success: boolean;
  services: [...servicios reordenados]
}
```

**Lógica:**
1. Validar que todos los IDs pertenecen al proveedor
2. Actualizar order_index de cada servicio
3. Retornar servicios ordenados

---

## 🏗️ **Estructura de Archivos**

### **Crear estos archivos:**

```
backend/src/
├── endpoints/
│   ├── provider-profile.ts       ⭐ NUEVO
│   ├── provider-services.ts      ⭐ NUEVO
│   └── categories.ts             ⭐ NUEVO
│
├── queries/
│   ├── provider-profile.ts       ⭐ NUEVO
│   ├── provider-services.ts      ⭐ NUEVO
│   └── categories.ts             ⭐ NUEVO
│
├── lib/
│   ├── image-upload.ts           ⭐ NUEVO
│   ├── profile-completion.ts     ⭐ NUEVO
│   └── image-compression.ts      ✅ YA EXISTE
│
├── validators/
│   ├── provider.validator.ts     ⭐ NUEVO
│   └── service.validator.ts      ⭐ NUEVO
│
└── types/
    ├── provider.ts               ⭐ NUEVO
    └── service.ts                ⭐ NUEVO
```

---

## 📐 **Interfaces TypeScript**

### **provider.ts**
```typescript
// backend/src/types/provider.ts

export interface ProviderProfile {
  id: number;
  provider_id: number;
  full_name: string;
  professional_title: string;
  main_commune: string;
  main_region: string;
  years_experience: number;
  bio: string;
  profile_photo_url: string | null;
  cover_photo_url: string | null;
  profile_completion: number;
  is_verified: boolean;
  verification_status: 'none' | 'pending' | 'approved' | 'rejected';
  rating_average: number;
  review_count: number;
  completed_appointments: number;
  is_online: boolean;
  last_seen: Date | null;
  created_at: Date;
  updated_at: Date;
}

export interface CreateProfileRequest {
  full_name: string;
  professional_title: string;
  main_commune: string;
  main_region: string;
  years_experience: number;
  bio: string;
}

export interface UpdateProfileRequest {
  full_name?: string;
  professional_title?: string;
  main_commune?: string;
  main_region?: string;
  years_experience?: number;
  bio?: string;
}

export interface ProfileCompletionResponse {
  completion: number;
  suggestions: string[];
  missing_fields: string[];
}

export interface PhotoUploadRequest {
  type: 'profile' | 'cover';
}

export interface PhotoUploadResponse {
  photo_url: string;
  profile_completion: number;
}
```

### **service.ts**
```typescript
// backend/src/types/service.ts

export interface ProviderService {
  id: number;
  provider_id: number;
  name: string;
  description: string;
  price: number;
  duration_minutes: number;
  category_id: number | null;
  custom_category: string | null;
  is_active: boolean;
  order_index: number;
  service_image_url: string | null;
  is_featured: boolean;
  booking_count: number;
  average_rating: number;
  created_at: Date;
  updated_at: Date;
}

export interface CreateServiceRequest {
  name: string;
  description: string;
  price: number;
  duration_minutes: number;
  category_id: number | null;
  custom_category?: string;
}

export interface UpdateServiceRequest {
  name?: string;
  description?: string;
  price?: number;
  duration_minutes?: number;
  category_id?: number;
  custom_category?: string;
  is_active?: boolean;
}

export interface ReorderServicesRequest {
  service_ids: number[];
}

export interface ServiceCategory {
  id: number;
  name: string;
  slug: string;
  description: string;
  icon_name: string;
  color_hex: string;
  order_index: number;
}
```

---

## 🔨 **Implementación Paso a Paso**

### **Paso 1: Crear Tabla provider_profiles**

```bash
# Ejecutar en MySQL
mysql -u root -p adomiapp < backend/migrations/001_create_provider_profiles.sql
```

```sql
-- backend/migrations/001_create_provider_profiles.sql
CREATE TABLE provider_profiles (
  id INT AUTO_INCREMENT PRIMARY KEY,
  provider_id INT NOT NULL UNIQUE,
  full_name VARCHAR(255) NOT NULL,
  professional_title VARCHAR(255),
  main_commune VARCHAR(100),
  main_region VARCHAR(100),
  years_experience INT DEFAULT 0,
  bio TEXT,
  profile_photo_url VARCHAR(500),
  cover_photo_url VARCHAR(500),
  profile_completion INT DEFAULT 0,
  is_verified BOOLEAN DEFAULT FALSE,
  verification_status ENUM('none', 'pending', 'approved', 'rejected') DEFAULT 'none',
  profile_views INT DEFAULT 0,
  rating_average DECIMAL(3,2) DEFAULT 0,
  review_count INT DEFAULT 0,
  completed_appointments INT DEFAULT 0,
  last_profile_update TIMESTAMP,
  is_online BOOLEAN DEFAULT FALSE,
  last_seen TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  
  FOREIGN KEY (provider_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Índices
CREATE INDEX idx_provider_profiles_provider ON provider_profiles(provider_id);
CREATE INDEX idx_provider_profiles_commune ON provider_profiles(main_commune);
CREATE INDEX idx_provider_profiles_verified ON provider_profiles(is_verified);
CREATE INDEX idx_provider_profiles_completion ON provider_profiles(profile_completion);
```

---

### **Paso 2: Crear Endpoints**

#### **A. Profile Endpoint**
```typescript
// backend/src/endpoints/provider-profile.ts

import { Router, Request, Response } from 'express';
import { authenticateToken, requireProvider } from '../middleware/auth';
import * as ProfileQueries from '../queries/provider-profile';
import { calculateProfileCompletion } from '../lib/profile-completion';

const router = Router();

// Obtener perfil del proveedor
router.get('/profile', authenticateToken, requireProvider, async (req: Request, res: Response) => {
  try {
    const providerId = req.user!.id;
    
    // Buscar perfil
    let profile = await ProfileQueries.getProfileByProviderId(providerId);
    
    // Si no existe, crear uno básico
    if (!profile) {
      profile = await ProfileQueries.createDefaultProfile(providerId, req.user!.name || '');
    }
    
    // Calcular completitud
    const completion = calculateProfileCompletion(profile);
    
    res.json({
      ...profile,
      profile_completion: completion.percentage,
      completion_suggestions: completion.suggestions
    });
  } catch (error) {
    console.error('[PROVIDER_PROFILE] Error fetching profile:', error);
    res.status(500).json({ error: 'Error al obtener perfil' });
  }
});

// Crear/Actualizar perfil
router.post('/profile', authenticateToken, requireProvider, async (req: Request, res: Response) => {
  try {
    const providerId = req.user!.id;
    const { full_name, professional_title, main_commune, main_region, years_experience, bio } = req.body;
    
    // Validaciones
    if (!full_name || full_name.trim().length < 3) {
      return res.status(400).json({ error: 'Nombre completo requerido (mínimo 3 caracteres)' });
    }
    
    // Verificar si existe perfil
    const existingProfile = await ProfileQueries.getProfileByProviderId(providerId);
    
    let profile;
    if (existingProfile) {
      // Actualizar
      profile = await ProfileQueries.updateProfile(providerId, req.body);
    } else {
      // Crear
      profile = await ProfileQueries.createProfile(providerId, req.body);
    }
    
    // Calcular completitud
    const completion = calculateProfileCompletion(profile);
    
    res.json({
      ...profile,
      profile_completion: completion.percentage,
      completion_suggestions: completion.suggestions
    });
  } catch (error) {
    console.error('[PROVIDER_PROFILE] Error saving profile:', error);
    res.status(500).json({ error: 'Error al guardar perfil' });
  }
});

// Actualizar solo ciertos campos
router.put('/profile', authenticateToken, requireProvider, async (req: Request, res: Response) => {
  try {
    const providerId = req.user!.id;
    const updates = req.body;
    
    const profile = await ProfileQueries.updateProfile(providerId, updates);
    const completion = calculateProfileCompletion(profile);
    
    res.json({
      ...profile,
      profile_completion: completion.percentage,
      completion_suggestions: completion.suggestions
    });
  } catch (error) {
    console.error('[PROVIDER_PROFILE] Error updating profile:', error);
    res.status(500).json({ error: 'Error al actualizar perfil' });
  }
});

// Subir fotos
router.post('/photos', authenticateToken, requireProvider, async (req: Request, res: Response) => {
  try {
    const providerId = req.user!.id;
    const { type } = req.body; // 'profile' o 'cover'
    
    if (!req.files || !req.files.file) {
      return res.status(400).json({ error: 'Archivo no proporcionado' });
    }
    
    const file = req.files.file;
    
    // Upload y comprimir
    const photoUrl = await uploadAndCompressImage(file, `provider-${providerId}-${type}`);
    
    // Actualizar en BD
    const updateField = type === 'profile' ? 'profile_photo_url' : 'cover_photo_url';
    await ProfileQueries.updateProfile(providerId, { [updateField]: photoUrl });
    
    // Recalcular completitud
    const profile = await ProfileQueries.getProfileByProviderId(providerId);
    const completion = calculateProfileCompletion(profile);
    
    res.json({
      photo_url: photoUrl,
      profile_completion: completion.percentage
    });
  } catch (error) {
    console.error('[PROVIDER_PROFILE] Error uploading photo:', error);
    res.status(500).json({ error: 'Error al subir foto' });
  }
});

export default router;
```

---

#### **B. Services Endpoint**
```typescript
// backend/src/endpoints/provider-services.ts

import { Router, Request, Response } from 'express';
import { authenticateToken, requireProvider } from '../middleware/auth';
import * as ServiceQueries from '../queries/provider-services';

const router = Router();

// Listar servicios del proveedor
router.get('/services', authenticateToken, requireProvider, async (req: Request, res: Response) => {
  try {
    const providerId = req.user!.id;
    const services = await ServiceQueries.getServicesByProvider(providerId);
    res.json(services);
  } catch (error) {
    console.error('[PROVIDER_SERVICES] Error fetching services:', error);
    res.status(500).json({ error: 'Error al obtener servicios' });
  }
});

// Crear servicio
router.post('/services', authenticateToken, requireProvider, async (req: Request, res: Response) => {
  try {
    const providerId = req.user!.id;
    const { name, description, price, duration_minutes, category_id, custom_category } = req.body;
    
    // Validaciones
    if (!name || name.trim().length < 3) {
      return res.status(400).json({ error: 'Nombre del servicio requerido (mínimo 3 caracteres)' });
    }
    
    if (!price || price <= 0) {
      return res.status(400).json({ error: 'Precio debe ser mayor a 0' });
    }
    
    if (!duration_minutes || duration_minutes < 15 || duration_minutes > 480) {
      return res.status(400).json({ error: 'Duración debe estar entre 15 y 480 minutos' });
    }
    
    const service = await ServiceQueries.createService(providerId, req.body);
    res.status(201).json(service);
  } catch (error) {
    console.error('[PROVIDER_SERVICES] Error creating service:', error);
    res.status(500).json({ error: 'Error al crear servicio' });
  }
});

// Actualizar servicio
router.put('/services/:id', authenticateToken, requireProvider, async (req: Request, res: Response) => {
  try {
    const providerId = req.user!.id;
    const serviceId = parseInt(req.params.id);
    
    // Verificar ownership
    const service = await ServiceQueries.getServiceById(serviceId);
    if (!service || service.provider_id !== providerId) {
      return res.status(404).json({ error: 'Servicio no encontrado' });
    }
    
    const updatedService = await ServiceQueries.updateService(serviceId, req.body);
    res.json(updatedService);
  } catch (error) {
    console.error('[PROVIDER_SERVICES] Error updating service:', error);
    res.status(500).json({ error: 'Error al actualizar servicio' });
  }
});

// Eliminar servicio
router.delete('/services/:id', authenticateToken, requireProvider, async (req: Request, res: Response) => {
  try {
    const providerId = req.user!.id;
    const serviceId = parseInt(req.params.id);
    
    // Verificar ownership
    const service = await ServiceQueries.getServiceById(serviceId);
    if (!service || service.provider_id !== providerId) {
      return res.status(404).json({ error: 'Servicio no encontrado' });
    }
    
    // Verificar que no tenga citas futuras
    const hasFutureAppointments = await ServiceQueries.hasFutureAppointments(serviceId);
    if (hasFutureAppointments) {
      return res.status(400).json({ 
        error: 'No se puede eliminar un servicio con citas futuras programadas' 
      });
    }
    
    await ServiceQueries.deleteService(serviceId);
    res.json({ success: true, message: 'Servicio eliminado correctamente' });
  } catch (error) {
    console.error('[PROVIDER_SERVICES] Error deleting service:', error);
    res.status(500).json({ error: 'Error al eliminar servicio' });
  }
});

// Reordenar servicios
router.patch('/services/reorder', authenticateToken, requireProvider, async (req: Request, res: Response) => {
  try {
    const providerId = req.user!.id;
    const { service_ids } = req.body;
    
    if (!Array.isArray(service_ids)) {
      return res.status(400).json({ error: 'service_ids debe ser un array' });
    }
    
    // Verificar ownership de todos los servicios
    const services = await ServiceQueries.getServicesByIds(service_ids);
    const allOwned = services.every(s => s.provider_id === providerId);
    
    if (!allOwned) {
      return res.status(403).json({ error: 'No tienes permiso para reordenar estos servicios' });
    }
    
    await ServiceQueries.reorderServices(service_ids);
    const reorderedServices = await ServiceQueries.getServicesByProvider(providerId);
    
    res.json({ success: true, services: reorderedServices });
  } catch (error) {
    console.error('[PROVIDER_SERVICES] Error reordering services:', error);
    res.status(500).json({ error: 'Error al reordenar servicios' });
  }
});

export default router;
```

---

## 🧮 **Lógica de Completitud del Perfil**

```typescript
// backend/src/lib/profile-completion.ts

interface CompletionResult {
  percentage: number;
  suggestions: string[];
  missing_fields: string[];
}

export function calculateProfileCompletion(profile: any): CompletionResult {
  let score = 0;
  const suggestions: string[] = [];
  const missing: string[] = [];
  
  // Información básica (45%)
  if (profile.full_name && profile.full_name.trim().length >= 3) {
    score += 10;
  } else {
    suggestions.push('Agrega tu nombre completo');
    missing.push('full_name');
  }
  
  if (profile.professional_title && profile.professional_title.trim().length >= 3) {
    score += 10;
  } else {
    suggestions.push('Define tu título profesional');
    missing.push('professional_title');
  }
  
  if (profile.main_commune) {
    score += 10;
  } else {
    suggestions.push('Indica tu comuna principal de trabajo');
    missing.push('main_commune');
  }
  
  if (profile.years_experience > 0) {
    score += 5;
  } else {
    suggestions.push('Indica tus años de experiencia');
    missing.push('years_experience');
  }
  
  if (profile.bio && profile.bio.trim().length >= 50) {
    score += 10;
  } else {
    suggestions.push('Escribe una descripción sobre ti (mínimo 50 caracteres)');
    missing.push('bio');
  }
  
  // Fotos (25%)
  if (profile.profile_photo_url) {
    score += 15;
  } else {
    suggestions.push('Sube una foto de perfil profesional');
    missing.push('profile_photo');
  }
  
  if (profile.cover_photo_url) {
    score += 10;
  } else {
    suggestions.push('Sube una foto de portada atractiva');
    missing.push('cover_photo');
  }
  
  // Servicios (15%) - Verificar en BD
  // Este se calcula en el endpoint considerando si tiene servicios
  
  // Portafolio (10%) - Verificar en BD
  // Este se calcula en el endpoint considerando items del portafolio
  
  return {
    percentage: Math.min(score, 100),
    suggestions,
    missing_fields: missing
  };
}

export async function calculateFullCompletion(providerId: number): Promise<CompletionResult> {
  // Obtener perfil
  const profile = await getProfileByProviderId(providerId);
  const basic = calculateProfileCompletion(profile);
  
  let additionalScore = 0;
  
  // Verificar servicios
  const serviceCount = await countProviderServices(providerId);
  if (serviceCount > 0) {
    additionalScore += 15;
  } else {
    basic.suggestions.push('Agrega al menos un servicio que ofreces');
    basic.missing_fields.push('services');
  }
  
  // Verificar portafolio
  const portfolioCount = await countPortfolioItems(providerId);
  if (portfolioCount >= 2) {
    additionalScore += 10;
  } else {
    basic.suggestions.push('Sube al menos 2 imágenes a tu portafolio');
    basic.missing_fields.push('portfolio');
  }
  
  return {
    percentage: Math.min(basic.percentage + additionalScore, 100),
    suggestions: basic.suggestions,
    missing_fields: basic.missing_fields
  };
}
```

---

## 🧪 **Testing**

### **1. Crear Proveedor de Prueba**
```bash
# Registrar usuario como proveedor
POST http://localhost:3000/auth/register
{
  "email": "proveedor@test.com",
  "password": "test123",
  "name": "María González",
  "role": "provider"
}

# Login
POST http://localhost:3000/auth/login
{
  "email": "proveedor@test.com",
  "password": "test123"
}

# Guardar token para siguientes requests
```

### **2. Crear Perfil**
```bash
POST http://localhost:3000/api/provider/profile
Authorization: Bearer <token>
Content-Type: application/json

{
  "full_name": "María González",
  "professional_title": "Estilista Profesional",
  "main_commune": "Providencia",
  "main_region": "Región Metropolitana",
  "years_experience": 5,
  "bio": "Estilista profesional con más de 5 años de experiencia en cortes modernos y coloración. Especializada en técnicas de color y cortes personalizados para cada tipo de rostro."
}
```

### **3. Subir Foto**
```bash
POST http://localhost:3000/api/provider/photos
Authorization: Bearer <token>
Content-Type: multipart/form-data

file: <seleccionar archivo>
type: profile
```

### **4. Crear Servicio**
```bash
POST http://localhost:3000/api/provider/services
Authorization: Bearer <token>
Content-Type: application/json

{
  "name": "Corte de Pelo",
  "description": "Corte de pelo moderno y personalizado",
  "price": 25000,
  "duration_minutes": 60,
  "category_id": 1
}
```

### **5. Listar Servicios**
```bash
GET http://localhost:3000/api/provider/services
Authorization: Bearer <token>
```

### **6. Verificar Completitud**
```bash
GET http://localhost:3000/api/provider/profile
Authorization: Bearer <token>

# Debería retornar:
# profile_completion: 75-85% (dependiendo de servicios y portafolio)
```

---

## 📊 **Datos que se Mostrarán en el Frontend**

### **Dashboard Home (`/dash/home`)**
Después de implementar perfil y servicios, el dashboard mostrará:
- ✅ Nombre y foto del proveedor
- ✅ Servicios ofrecidos (lista básica)
- ⏳ Solicitudes pendientes (requiere appointments)
- ⏳ Próxima cita (requiere appointments)
- ⏳ Ingresos del día/mes (requiere payments)

### **Perfil (`/dash/perfil`)**
- ✅ Información básica completa
- ✅ Fotos de perfil y portada
- ✅ Descripción "Sobre mí"
- ✅ Progreso del perfil con sugerencias
- ⏳ Ubicación y disponibilidad (requiere provider_locations)
- ⏳ Verificación (requiere identity_verifications)

### **Servicios (`/dash/servicios`)**
- ✅ Lista completa de servicios
- ✅ Crear, editar, eliminar
- ✅ Reordenar servicios
- ✅ Categorías disponibles

---

## 🎯 **Próximos Pasos Después del Perfil**

### **Una vez funcione perfil + servicios:**

1. **Agenda** → Permitir definir horarios
2. **Reservas** → Clientes pueden agendar
3. **Pagos** → Procesar transacciones
4. **Dashboard** → Mostrar datos reales
5. **Estadísticas** → Cálculos agregados

### **Orden lógico:**
```
Perfil → Servicios → Agenda → Reservas → Pagos → Dashboard → Estadísticas
```

---

## 💡 **Consideraciones Importantes**

### **Autenticación**
- Usar JWT tokens existentes
- Verificar rol de proveedor en cada endpoint
- Implementar middleware `requireProvider`

### **Validaciones**
- Usar express-validator o Joi
- Sanitizar inputs
- Validar tipos de datos
- Límites de tamaño

### **Manejo de Errores**
- Try-catch en todos los endpoints
- Logs detallados
- Mensajes de error claros al frontend
- Status codes HTTP apropiados

### **Performance**
- Índices en campos de búsqueda
- Paginación en listas largas
- Caché para datos que no cambian seguido
- Optimización de queries con JOINs

---

## ✅ **Checklist de Primera Semana**

- [ ] **Día 1:** Crear tablas (provider_profiles, actualizar provider_services)
- [ ] **Día 2:** Implementar queries básicas (CRUD)
- [ ] **Día 3:** Implementar endpoints de perfil
- [ ] **Día 4:** Implementar upload de imágenes
- [ ] **Día 5:** Implementar endpoints de servicios
- [ ] **Día 6:** Testing completo
- [ ] **Día 7:** Integración con frontend

**Resultado esperado:** `/dash/perfil` y `/dash/servicios` funcionando con datos reales 🎉

---

**¿Listo para empezar con la implementación?** 🚀

