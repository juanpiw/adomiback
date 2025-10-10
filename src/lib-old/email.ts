import nodemailer from 'nodemailer';
import { getPasswordResetEmailTemplate, getPasswordResetSuccessEmailTemplate } from './email-templates';

// Configuración del transporter de email
const createTransporter = () => {
  return nodemailer.createTransport({
    host: process.env.SMTP_HOST || 'smtp.gmail.com',
    port: parseInt(process.env.SMTP_PORT || '587'),
    secure: false, // true para 465, false para otros puertos
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS
    }
  });
};

// Template de email de bienvenida
const getWelcomeEmailTemplate = (name: string, role: string) => {
  const roleText = role === 'provider' ? 'Profesional' : 'Cliente';
  
  return {
    subject: `¡Bienvenido a AdomiApp, ${name}! 🎉`,
    html: `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Bienvenido a AdomiApp</title>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
          .content { background: #f8f9fa; padding: 30px; border-radius: 0 0 10px 10px; }
          .button { display: inline-block; background: #667eea; color: white; padding: 12px 30px; text-decoration: none; border-radius: 25px; margin: 20px 0; }
          .feature { background: white; padding: 20px; margin: 15px 0; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }
          .footer { text-align: center; margin-top: 30px; color: #666; font-size: 14px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>¡Bienvenido a AdomiApp! 🎉</h1>
            <p>Tu plataforma de servicios profesionales</p>
          </div>
          
          <div class="content">
            <h2>Hola ${name},</h2>
            <p>¡Qué emocionante tenerte con nosotros! Te has registrado como <strong>${roleText}</strong> en AdomiApp, la plataforma que conecta profesionales con clientes de manera fácil y segura.</p>
            
            <div class="feature">
              <h3>🚀 ¿Qué puedes hacer ahora?</h3>
              ${role === 'provider' ? `
                <ul>
                  <li>📅 Gestionar tu agenda de citas</li>
                  <li>💰 Ver tus ingresos en tiempo real</li>
                  <li>📊 Analizar estadísticas de tu negocio</li>
                  <li>💬 Comunicarte con tus clientes</li>
                  <li>⭐ Promocionar tus servicios</li>
                </ul>
              ` : `
                <ul>
                  <li>🔍 Buscar profesionales cerca de ti</li>
                  <li>📅 Reservar citas fácilmente</li>
                  <li>⭐ Guardar tus favoritos</li>
                  <li>💳 Gestionar métodos de pago</li>
                  <li>💬 Chatear con profesionales</li>
                </ul>
              `}
            </div>
            
            <div style="text-align: center;">
              <a href="https://adomiapp.cl" class="button">Explorar AdomiApp</a>
            </div>
            
            <div class="feature">
              <h3>💡 Consejos para empezar:</h3>
              <ul>
                <li>Completa tu perfil con información detallada</li>
                <li>Sube una foto profesional</li>
                <li>Lee nuestras políticas de privacidad</li>
                <li>Explora las funcionalidades disponibles</li>
              </ul>
            </div>
            
            <p>Si tienes alguna pregunta, no dudes en contactarnos. Estamos aquí para ayudarte a tener la mejor experiencia posible.</p>
            
            <p>¡Esperamos verte pronto en la plataforma!</p>
            
            <p>Saludos,<br>
            <strong>El equipo de AdomiApp</strong></p>
          </div>
          
          <div class="footer">
            <p>Este email fue enviado a tu dirección de correo electrónico registrada.</p>
            <p>© 2025 AdomiApp. Todos los derechos reservados.</p>
          </div>
        </div>
      </body>
      </html>
    `,
    text: `
      ¡Bienvenido a AdomiApp, ${name}!
      
      Te has registrado como ${roleText} en nuestra plataforma.
      
      ¿Qué puedes hacer ahora?
      ${role === 'provider' ? `
      - Gestionar tu agenda de citas
      - Ver tus ingresos en tiempo real
      - Analizar estadísticas de tu negocio
      - Comunicarte con tus clientes
      - Promocionar tus servicios
      ` : `
      - Buscar profesionales cerca de ti
      - Reservar citas fácilmente
      - Guardar tus favoritos
      - Gestionar métodos de pago
      - Chatear con profesionales
      `}
      
      Visita: https://adomiapp.cl
      
      Saludos,
      El equipo de AdomiApp
    `
  };
};

// Función para enviar email de bienvenida
export async function sendWelcomeEmail(email: string, name: string, role: string) {
  try {
    const transporter = createTransporter();
    const template = getWelcomeEmailTemplate(name, role);
    
    const mailOptions = {
      from: `"AdomiApp" <${process.env.SMTP_USER}>`,
      to: email,
      subject: template.subject,
      text: template.text,
      html: template.html
    };
    
    const result = await transporter.sendMail(mailOptions);
    console.log('[EMAIL] Welcome email sent successfully:', result.messageId);
    return { success: true, messageId: result.messageId };
  } catch (error) {
    console.error('[EMAIL] Error sending welcome email:', error);
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
  }
}

// Función para enviar email de recuperación de contraseña
export async function sendPasswordResetEmail(toEmail: string, name: string, resetLink: string) {
  try {
    const transporter = createTransporter();

    const subject = `Recuperar Contraseña - AdomiApp`;
    const htmlContent = getPasswordResetEmailTemplate(name, resetLink);

    const info = await transporter.sendMail({
      from: `"AdomiApp" <${process.env.SMTP_USER}>`,
      to: toEmail,
      subject: subject,
      html: htmlContent,
    });

    console.log('Password reset email sent: %s', info.messageId);
    return { success: true, messageId: info.messageId };
  } catch (error: any) {
    console.error('Error sending password reset email:', error);
    return { success: false, error: error.message };
  }
}

// Función para enviar email de confirmación de cambio de contraseña
export async function sendPasswordResetSuccessEmail(toEmail: string, name: string) {
  try {
    const transporter = createTransporter();

    const subject = `Contraseña Actualizada - AdomiApp`;
    const htmlContent = getPasswordResetSuccessEmailTemplate(name);

    const info = await transporter.sendMail({
      from: `"AdomiApp" <${process.env.SMTP_USER}>`,
      to: toEmail,
      subject: subject,
      html: htmlContent,
    });

    console.log('Password reset success email sent: %s', info.messageId);
    return { success: true, messageId: info.messageId };
  } catch (error: any) {
    console.error('Error sending password reset success email:', error);
    return { success: false, error: error.message };
  }
}

// Función para verificar la configuración de email
export async function testEmailConnection() {
  try {
    const transporter = createTransporter();
    await transporter.verify();
    console.log('[EMAIL] SMTP connection verified successfully');
    return true;
  } catch (error) {
    console.error('[EMAIL] SMTP connection failed:', error);
    return false;
  }
}
