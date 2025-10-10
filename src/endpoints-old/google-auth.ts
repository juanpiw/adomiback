import { Router, Request, Response } from 'express';
import { OAuth2Client } from 'google-auth-library';
import { 
  createGoogleUser, 
  getUserByGoogleId, 
  getUserByEmail, 
  linkGoogleAccount,
  unlinkGoogleAccount 
} from '../queries/users';
import { generateTokenPair } from '../lib/jwt';
import { createRefreshToken } from '../lib/refresh-tokens';
import { validateContentType, validatePayloadSize, sanitizeInput } from '../middleware/validation';
import { authenticateToken } from '../middleware/auth';
import { ipRateLimit } from '../middleware/rate-limit';

const router = Router();

console.log('[GOOGLE_AUTH] Inicializando rutas de Google OAuth...');
console.log('[GOOGLE_AUTH] Variables de entorno:', {
  GOOGLE_CLIENT_ID: process.env.GOOGLE_CLIENT_ID ? 'Set' : 'Not set',
  GOOGLE_CLIENT_SECRET: process.env.GOOGLE_CLIENT_SECRET ? 'Set' : 'Not set',
  GOOGLE_REDIRECT_URI: process.env.GOOGLE_REDIRECT_URI || 'Not set'
});

// Configuración de Google OAuth
const googleClient = new OAuth2Client(
  process.env.GOOGLE_CLIENT_ID || 'tu-google-client-id.apps.googleusercontent.com',
  process.env.GOOGLE_CLIENT_SECRET || 'tu-google-client-secret',
  process.env.GOOGLE_REDIRECT_URI || 'https://tu-dominio.com/auth/google/callback'
);

console.log('[GOOGLE_AUTH] Cliente de Google OAuth inicializado');

// Rate limiting para Google OAuth - más permisivo para pruebas
const googleAuthLimit = ipRateLimit(20, 15 * 60 * 1000); // 20 intentos por IP cada 15 minutos
const googleCallbackLimit = ipRateLimit(50, 15 * 60 * 1000); // 50 intentos por IP cada 15 minutos para callback

/**
 * POST /auth/google
 * Iniciar login con Google - devuelve URL de autorización
 */
router.post('/auth/google',
  googleAuthLimit,
  validateContentType(['application/json']),
  validatePayloadSize(2 * 1024), // 2KB max
  async (req: Request, res: Response) => {
    try {
      console.log('[GOOGLE_AUTH][INIT] Iniciando autenticación con Google');
      
      const { role } = req.body || {};
      const validRole = role === 'provider' ? 'provider' : 'client';
      
      // Generar URL de autorización
      const authUrl = googleClient.generateAuthUrl({
        access_type: 'offline',
        scope: [
          'https://www.googleapis.com/auth/userinfo.profile',
          'https://www.googleapis.com/auth/userinfo.email'
        ],
        state: JSON.stringify({ role: validRole })
      });

      console.log('[GOOGLE_AUTH][INIT] URL generada para rol:', validRole);
      
      res.status(200).json({
        success: true,
        authUrl,
        message: 'URL de autorización generada exitosamente'
      });

    } catch (error) {
      console.error('[GOOGLE_AUTH][INIT][ERROR] Error al generar URL de autorización:', error);
      res.status(500).json({
        success: false,
        error: 'Error interno del servidor al generar URL de autorización'
      });
    }
  });

/**
 * GET /auth/google/callback
 * Callback de Google OAuth - procesa el código de autorización
 */
router.get('/auth/google/callback',
  googleCallbackLimit,
  async (req: Request, res: Response) => {
    try {
      console.log('[GOOGLE_AUTH][CALLBACK] Procesando callback de Google');
      const { code, state } = req.query;

      if (!code) {
        console.warn('[GOOGLE_AUTH][CALLBACK] Código de autorización no proporcionado');
        return res.status(400).json({
          success: false,
          error: 'Código de autorización requerido'
        });
      }

      // Intercambiar código por tokens
      const { tokens } = await googleClient.getToken(code as string);
      googleClient.setCredentials(tokens);

      // Obtener información del usuario
      const ticket = await googleClient.verifyIdToken({
        idToken: tokens.id_token!,
        audience: [process.env.GOOGLE_CLIENT_ID!]
      });

      const payload = ticket.getPayload();
      if (!payload) {
        console.error('[GOOGLE_AUTH][CALLBACK] Payload de Google inválido');
        return res.status(400).json({
          success: false,
          error: 'Token de Google inválido'
        });
      }

      const googleId = payload.sub;
      const email = payload.email;
      const name = payload.name || email?.split('@')[0] || 'Usuario';
      
      // Obtener rol del state
      let role = 'client';
      try {
        const stateData = state ? JSON.parse(state as string) : {};
        role = stateData.role || 'client';
      } catch (e) {
        console.warn('[GOOGLE_AUTH][CALLBACK] Error al parsear state, usando rol por defecto');
      }

      console.log('[GOOGLE_AUTH][CALLBACK] ================================');
      console.log('[GOOGLE_AUTH][CALLBACK] Usuario de Google:', { googleId, email, name, role });
      console.log('[GOOGLE_AUTH][CALLBACK] ================================');

      // Verificar si el usuario ya existe por Google ID
      console.log('[GOOGLE_AUTH][CALLBACK] 🔍 PASO 1: Buscando usuario por Google ID...');
      let user = await getUserByGoogleId(googleId);
      
      if (!user) {
        console.log('[GOOGLE_AUTH][CALLBACK] ⚠️ Usuario NO encontrado por Google ID');
        console.log('[GOOGLE_AUTH][CALLBACK] 🔍 PASO 2: Buscando por email...');
        
        // Verificar si existe por email
        const existingUser = await getUserByEmail(email!);
        
        if (existingUser) {
          console.log('[GOOGLE_AUTH][CALLBACK] ✅ Usuario existente encontrado por email');
          console.log('[GOOGLE_AUTH][CALLBACK] 🔗 PASO 3: Vinculando cuenta con Google...');
          
          // Vincular cuenta existente con Google
          const linkResult = await linkGoogleAccount(existingUser.id, googleId);
          if (linkResult.success) {
            console.log('[GOOGLE_AUTH][CALLBACK] ✅ Cuenta vinculada exitosamente');
            user = await getUserByGoogleId(googleId);
          } else {
            console.error('[GOOGLE_AUTH][CALLBACK] ❌ Error al vincular cuenta:', linkResult.error);
            return res.status(500).json({
              success: false,
              error: 'Error al vincular cuenta con Google'
            });
          }
        } else {
          console.log('[GOOGLE_AUTH][CALLBACK] ⚠️ Usuario NO encontrado por email');
          console.log('[GOOGLE_AUTH][CALLBACK] 🆕 PASO 3: Creando nuevo usuario...');
          console.log('[GOOGLE_AUTH][CALLBACK] 📝 Datos a insertar:', {
            googleId,
            email: email!,
            name,
            role
          });
          
          try {
            // Crear nuevo usuario
            const userId = await createGoogleUser(googleId, email!, name, role as 'client' | 'provider');
            console.log('[GOOGLE_AUTH][CALLBACK] ✅ Usuario creado con ID:', userId);
            console.log('[GOOGLE_AUTH][CALLBACK] 🔍 PASO 4: Recuperando usuario recién creado...');
            user = await getUserByGoogleId(googleId);
          } catch (createError: any) {
            console.error('[GOOGLE_AUTH][CALLBACK] ❌ ERROR CRÍTICO al crear usuario:', createError);
            console.error('[GOOGLE_AUTH][CALLBACK] 🔍 Stack trace:', createError.stack);
            return res.status(500).json({
              success: false,
              error: 'Error al crear usuario: ' + createError.message
            });
          }
        }
      } else {
        console.log('[GOOGLE_AUTH][CALLBACK] ✅ Usuario existente encontrado por Google ID');
      }

      if (!user) {
        console.error('[GOOGLE_AUTH][CALLBACK] Error al crear/obtener usuario');
        return res.status(500).json({
          success: false,
          error: 'Error al procesar usuario de Google'
        });
      }

      // Generar tokens JWT
      const tokens_jwt = generateTokenPair(user.id, user.email, user.role);
      
      // Crear refresh token en la base de datos
      const refreshTokenExpiry = new Date();
      refreshTokenExpiry.setDate(refreshTokenExpiry.getDate() + 7); // 7 días
      
      await createRefreshToken(user.id, tokens_jwt.refreshToken.split('.')[2], refreshTokenExpiry);

      console.log('[GOOGLE_AUTH][CALLBACK] Login exitoso:', { id: user.id, email: user.email, role: user.role });

      // Redirigir al frontend con tokens
      const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:4200';
      const redirectUrl = `${frontendUrl}/auth/google/success?token=${tokens_jwt.accessToken}&refresh=${tokens_jwt.refreshToken}&user=${encodeURIComponent(JSON.stringify({
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role
      }))}`;

      res.redirect(redirectUrl);

    } catch (error) {
      console.error('[GOOGLE_AUTH][CALLBACK][ERROR] Error en callback de Google:', error);
      const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:4200';
      res.redirect(`${frontendUrl}/auth/login?error=google_auth_failed`);
    }
  });

/**
 * POST /auth/google/verify
 * Verificar token de Google (para uso directo desde frontend)
 */
router.post('/auth/google/verify',
  googleAuthLimit,
  validateContentType(['application/json']),
  validatePayloadSize(5 * 1024), // 5KB max
  async (req: Request, res: Response) => {
    try {
      console.log('[GOOGLE_AUTH][VERIFY] Verificando token de Google');
      const { idToken, role } = req.body;

      if (!idToken) {
        return res.status(400).json({
          success: false,
          error: 'Token de Google requerido'
        });
      }

      // Verificar token de Google
      const ticket = await googleClient.verifyIdToken({
        idToken,
        audience: [process.env.GOOGLE_CLIENT_ID!]
      });

      const payload = ticket.getPayload();
      if (!payload) {
        return res.status(400).json({
          success: false,
          error: 'Token de Google inválido'
        });
      }

      const googleId = payload.sub;
      const email = payload.email;
      const name = payload.name || email?.split('@')[0] || 'Usuario';
      const validRole = role === 'provider' ? 'provider' : 'client';

      console.log('[GOOGLE_AUTH][VERIFY] Usuario verificado:', { googleId, email, name, role: validRole });

      // Verificar si el usuario ya existe
      let user = await getUserByGoogleId(googleId);
      
      if (!user) {
        // Verificar si existe por email
        const existingUser = await getUserByEmail(email!);
        
        if (existingUser) {
          // Vincular cuenta existente con Google
          const linkResult = await linkGoogleAccount(existingUser.id, googleId);
          if (linkResult.success) {
            user = await getUserByGoogleId(googleId);
          } else {
            return res.status(500).json({
              success: false,
              error: 'Error al vincular cuenta con Google'
            });
          }
        } else {
          // Crear nuevo usuario
          const userId = await createGoogleUser(googleId, email!, name, validRole);
          user = await getUserByGoogleId(googleId);
        }
      }

      if (!user) {
        return res.status(500).json({
          success: false,
          error: 'Error al procesar usuario de Google'
        });
      }

      // Generar tokens JWT
      const tokens = generateTokenPair(user.id, user.email, user.role);
      
      // Crear refresh token en la base de datos
      const refreshTokenExpiry = new Date();
      refreshTokenExpiry.setDate(refreshTokenExpiry.getDate() + 7); // 7 días
      
      await createRefreshToken(user.id, tokens.refreshToken.split('.')[2], refreshTokenExpiry);

      console.log('[GOOGLE_AUTH][VERIFY] Login exitoso:', { id: user.id, email: user.email, role: user.role });

      res.status(200).json({
        success: true,
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role
        },
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken,
        message: 'Autenticación con Google exitosa'
      });

    } catch (error) {
      console.error('[GOOGLE_AUTH][VERIFY][ERROR] Error al verificar token de Google:', error);
      res.status(500).json({
        success: false,
        error: 'Error interno del servidor al verificar token de Google'
      });
    }
  });

/**
 * POST /auth/google/unlink
 * Desvincular cuenta de Google (requiere autenticación)
 */
router.post('/auth/google/unlink',
  authenticateToken,
  googleAuthLimit,
  async (req: Request, res: Response) => {
    try {
      const user = (req as any).user;
      console.log('[GOOGLE_AUTH][UNLINK] Desvinculando cuenta de Google para usuario:', user.id);

      const result = await unlinkGoogleAccount(user.id);
      
      if (result.success) {
        console.log('[GOOGLE_AUTH][UNLINK] Cuenta desvinculada exitosamente');
        res.status(200).json({
          success: true,
          message: 'Cuenta de Google desvinculada exitosamente'
        });
      } else {
        console.error('[GOOGLE_AUTH][UNLINK] Error al desvincular:', result.error);
        res.status(500).json({
          success: false,
          error: result.error || 'Error al desvincular cuenta de Google'
        });
      }

    } catch (error) {
      console.error('[GOOGLE_AUTH][UNLINK][ERROR] Error al desvincular cuenta:', error);
      res.status(500).json({
        success: false,
        error: 'Error interno del servidor al desvincular cuenta'
      });
    }
  });

console.log('[GOOGLE_AUTH] Rutas de Google OAuth configuradas exitosamente');
console.log('[GOOGLE_AUTH] Endpoints disponibles:', [
  'POST /auth/google',
  'GET /auth/google/callback', 
  'POST /auth/google/verify',
  'POST /auth/google/unlink'
]);

export default router;
