import { Router, Request, Response } from 'express';
import { authenticateToken } from '../middleware/auth';
import { ipRateLimit } from '../middleware/rate-limit';
import { validateContentType, validatePayloadSize, sanitizeInput } from '../middleware/validation';
import { createCheckoutSession, createStripeCustomer } from '../lib/stripe';
import { getUserById, updateUserStripeCustomerId } from '../queries/users';
import { getPlanById } from '../queries/plans';

const router = Router();

// Rate limiting para checkout
const checkoutLimit = ipRateLimit(5, 15 * 60 * 1000); // 5 intentos por IP cada 15 minutos

/**
 * POST /stripe/create-checkout-session
 * Crear sesión de checkout de Stripe
 */
router.post('/create-checkout-session',
  authenticateToken,
  checkoutLimit,
  validateContentType(['application/json']),
  validatePayloadSize(2 * 1024), // 2KB max
  async (req: Request, res: Response) => {
    try {
      console.log('[STRIPE_CHECKOUT] Creating checkout session');
      
      const user = (req as any).user;
      const { planId } = req.body;

      if (!planId) {
        console.warn('[STRIPE_CHECKOUT] Plan ID missing');
        return res.status(400).json({ 
          success: false, 
          error: 'Plan ID es requerido' 
        });
      }

      // Obtener el plan
      const plan = await getPlanById(planId);
      if (!plan) {
        console.warn('[STRIPE_CHECKOUT] Plan not found:', planId);
        return res.status(404).json({ 
          success: false, 
          error: 'Plan no encontrado' 
        });
      }

      // Obtener información del usuario
      const userData = await getUserById(user.id);
      if (!userData) {
        console.warn('[STRIPE_CHECKOUT] User not found:', user.id);
        return res.status(404).json({ 
          success: false, 
          error: 'Usuario no encontrado' 
        });
      }

      // Crear o obtener customer de Stripe
      let customerId = userData.stripe_customer_id;
      
      if (!customerId) {
        console.log('[STRIPE_CHECKOUT] Creating new Stripe customer');
        const customerResult = await createStripeCustomer(
          userData.email,
          userData.name,
          userData.id
        );
        
        if (!customerResult.success) {
          console.error('[STRIPE_CHECKOUT] Failed to create customer:', customerResult.error);
          return res.status(500).json({ 
            success: false, 
            error: 'Error al crear customer en Stripe' 
          });
        }
        
        customerId = customerResult.customerId;
        
        // Actualizar el customer ID en la base de datos
        await updateUserStripeCustomerId(user.id, customerId);
        console.log('[STRIPE_CHECKOUT] Customer ID saved to database:', customerId);
      }

      // URLs de éxito y cancelación
      const successUrl = `${process.env.FRONTEND_URL}/auth/payment-success?session_id={CHECKOUT_SESSION_ID}`;
      const cancelUrl = `${process.env.FRONTEND_URL}/auth/payment-error`;

      // Crear sesión de checkout
      const sessionResult = await createCheckoutSession(
        plan.stripe_price_id,
        customerId,
        successUrl,
        cancelUrl,
        {
          userId: user.id.toString(),
          planId: plan.id.toString(),
          planName: plan.name
        }
      );

      if (!sessionResult.success) {
        console.error('[STRIPE_CHECKOUT] Failed to create checkout session:', sessionResult.error);
        return res.status(500).json({ 
          success: false, 
          error: 'Error al crear sesión de checkout' 
        });
      }

      console.log('[STRIPE_CHECKOUT] Checkout session created:', sessionResult.sessionId);

      res.status(200).json({
        success: true,
        sessionId: sessionResult.sessionId,
        url: sessionResult.url,
        message: 'Sesión de checkout creada exitosamente'
      });

    } catch (error: any) {
      console.error('[STRIPE_CHECKOUT][ERROR]', error);
      res.status(500).json({ 
        success: false, 
        error: 'Error interno del servidor' 
      });
    }
  }
);

/**
 * GET /stripe/create-checkout-session/:planId
 * Crear sesión de checkout de Stripe (método GET para facilitar testing)
 */
router.get('/create-checkout-session/:planId',
  authenticateToken,
  checkoutLimit,
  async (req: Request, res: Response) => {
    try {
      console.log('[STRIPE_CHECKOUT] Creating checkout session via GET');
      
      const user = (req as any).user;
      const { planId } = req.params;

      // Obtener el plan
      const plan = await getPlanById(parseInt(planId));
      if (!plan) {
        console.warn('[STRIPE_CHECKOUT] Plan not found:', planId);
        return res.status(404).json({ 
          success: false, 
          error: 'Plan no encontrado' 
        });
      }

      // Obtener información del usuario
      const userData = await getUserById(user.id);
      if (!userData) {
        console.warn('[STRIPE_CHECKOUT] User not found:', user.id);
        return res.status(404).json({ 
          success: false, 
          error: 'Usuario no encontrado' 
        });
      }

      // Crear o obtener customer de Stripe
      let customerId = userData.stripe_customer_id;
      
      if (!customerId) {
        console.log('[STRIPE_CHECKOUT] Creating new Stripe customer');
        const customerResult = await createStripeCustomer(
          userData.email,
          userData.name,
          userData.id
        );
        
        if (!customerResult.success) {
          console.error('[STRIPE_CHECKOUT] Failed to create customer:', customerResult.error);
          return res.status(500).json({ 
            success: false, 
            error: 'Error al crear customer en Stripe' 
          });
        }
        
        customerId = customerResult.customerId;
        
        // Actualizar el customer ID en la base de datos
        await updateUserStripeCustomerId(user.id, customerId);
        console.log('[STRIPE_CHECKOUT] Customer ID saved to database:', customerId);
      }

      // URLs de éxito y cancelación
      const successUrl = `${process.env.FRONTEND_URL}/auth/payment-success?session_id={CHECKOUT_SESSION_ID}`;
      const cancelUrl = `${process.env.FRONTEND_URL}/auth/payment-error`;

      // Crear sesión de checkout
      const sessionResult = await createCheckoutSession(
        plan.stripe_price_id,
        customerId,
        successUrl,
        cancelUrl,
        {
          userId: user.id.toString(),
          planId: plan.id.toString(),
          planName: plan.name
        }
      );

      if (!sessionResult.success) {
        console.error('[STRIPE_CHECKOUT] Failed to create checkout session:', sessionResult.error);
        return res.status(500).json({ 
          success: false, 
          error: 'Error al crear sesión de checkout' 
        });
      }

      console.log('[STRIPE_CHECKOUT] Checkout session created:', sessionResult.sessionId);

      // Redirigir directamente a Stripe
      res.redirect(sessionResult.url!);

    } catch (error: any) {
      console.error('[STRIPE_CHECKOUT][ERROR]', error);
      res.status(500).json({ 
        success: false, 
        error: 'Error interno del servidor' 
      });
    }
  }
);

export default router;
