import Stripe from 'stripe';

// Configuración de Stripe
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2025-08-27.basil',
  typescript: true,
});

export default stripe;

// Configuración de la moneda
export const STRIPE_CURRENCY = process.env.STRIPE_CURRENCY || 'clp';

// Configuración de URLs
export const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:4200';
export const WEBHOOK_URL = process.env.WEBHOOK_URL || 'http://localhost:3000/webhooks/stripe';

// Función para crear un customer en Stripe
export async function createStripeCustomer(email: string, name: string, userId: number) {
  try {
    const customer = await stripe.customers.create({
      email,
      name,
      metadata: {
        userId: userId.toString(),
      },
    });
    
    console.log('[STRIPE] Customer created:', customer.id);
    return { success: true, customerId: customer.id };
  } catch (error: any) {
    console.error('[STRIPE] Error creating customer:', error);
    return { success: false, error: error.message };
  }
}

// Función para crear un payment intent
export async function createPaymentIntent(
  amount: number,
  currency: string,
  customerId: string,
  metadata: any = {}
) {
  try {
    const paymentIntent = await stripe.paymentIntents.create({
      amount: Math.round(amount * 100), // Stripe usa centavos
      currency,
      customer: customerId,
      metadata,
      automatic_payment_methods: {
        enabled: true,
      },
    });
    
    console.log('[STRIPE] Payment intent created:', paymentIntent.id);
    return { success: true, clientSecret: paymentIntent.client_secret };
  } catch (error: any) {
    console.error('[STRIPE] Error creating payment intent:', error);
    return { success: false, error: error.message };
  }
}

// Función para crear una sesión de checkout
export async function createCheckoutSession(
  priceId: string,
  customerId: string,
  successUrl: string,
  cancelUrl: string,
  metadata: any = {}
) {
  try {
    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      payment_method_types: ['card'],
      line_items: [
        {
          price: priceId,
          quantity: 1,
        },
      ],
      mode: 'subscription',
      success_url: successUrl,
      cancel_url: cancelUrl,
      metadata,
    });
    
    console.log('[STRIPE] Checkout session created:', session.id);
    return { success: true, sessionId: session.id, url: session.url };
  } catch (error: any) {
    console.error('[STRIPE] Error creating checkout session:', error);
    return { success: false, error: error.message };
  }
}

// Función para crear un portal de cliente
export async function createCustomerPortalSession(customerId: string, returnUrl: string) {
  try {
    const session = await stripe.billingPortal.sessions.create({
      customer: customerId,
      return_url: returnUrl,
    });
    
    console.log('[STRIPE] Customer portal session created:', session.id);
    return { success: true, url: session.url };
  } catch (error: any) {
    console.error('[STRIPE] Error creating customer portal session:', error);
    return { success: false, error: error.message };
  }
}

// Función para obtener una suscripción
export async function getSubscription(subscriptionId: string) {
  try {
    const subscription = await stripe.subscriptions.retrieve(subscriptionId);
    return { success: true, subscription };
  } catch (error: any) {
    console.error('[STRIPE] Error retrieving subscription:', error);
    return { success: false, error: error.message };
  }
}

// Función para cancelar una suscripción
export async function cancelSubscription(subscriptionId: string) {
  try {
    const subscription = await stripe.subscriptions.cancel(subscriptionId);
    console.log('[STRIPE] Subscription cancelled:', subscriptionId);
    return { success: true, subscription };
  } catch (error: any) {
    console.error('[STRIPE] Error cancelling subscription:', error);
    return { success: false, error: error.message };
  }
}

// Función para verificar webhook signature
export function verifyWebhookSignature(payload: string, signature: string) {
  try {
    const event = stripe.webhooks.constructEvent(
      payload,
      signature,
      process.env.STRIPE_WEBHOOK_SECRET!
    );
    return { success: true, event };
  } catch (error: any) {
    console.error('[STRIPE] Webhook signature verification failed:', error);
    return { success: false, error: error.message };
  }
}
