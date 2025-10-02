export function getPasswordResetEmailTemplate(name: string, resetLink: string): string {
  return `
<!DOCTYPE html>
<html lang="es">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Recuperar Contraseña - AdomiApp</title>
    <style>
        body {
            margin: 0;
            padding: 0;
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
            background-color: #f8fafc;
            line-height: 1.6;
        }
        .container {
            max-width: 600px;
            margin: 0 auto;
            background-color: #ffffff;
            border-radius: 16px;
            overflow: hidden;
            box-shadow: 0 10px 30px rgba(0, 0, 0, 0.1);
        }
        .header {
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            padding: 40px 30px;
            text-align: center;
            color: white;
        }
        .logo {
            font-size: 32px;
            font-weight: bold;
            margin-bottom: 10px;
            letter-spacing: -1px;
        }
        .tagline {
            font-size: 16px;
            opacity: 0.9;
            margin: 0;
        }
        .content {
            padding: 40px 30px;
        }
        .greeting {
            font-size: 24px;
            color: #1f2937;
            margin: 0 0 20px 0;
            font-weight: 600;
        }
        .message {
            font-size: 16px;
            color: #4b5563;
            margin: 0 0 30px 0;
        }
        .reset-button {
            display: inline-block;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
            text-decoration: none;
            padding: 16px 32px;
            border-radius: 12px;
            font-weight: 600;
            font-size: 16px;
            text-align: center;
            margin: 20px 0;
            transition: transform 0.2s ease;
            box-shadow: 0 4px 15px rgba(102, 126, 234, 0.3);
        }
        .reset-button:hover {
            transform: translateY(-2px);
            box-shadow: 0 6px 20px rgba(102, 126, 234, 0.4);
        }
        .security-note {
            background-color: #fef3c7;
            border: 1px solid #f59e0b;
            border-radius: 8px;
            padding: 16px;
            margin: 30px 0;
            font-size: 14px;
            color: #92400e;
        }
        .security-note strong {
            color: #b45309;
        }
        .footer {
            background-color: #f8fafc;
            padding: 30px;
            text-align: center;
            border-top: 1px solid #e5e7eb;
        }
        .footer-text {
            font-size: 14px;
            color: #6b7280;
            margin: 0 0 10px 0;
        }
        .footer-links {
            margin-top: 20px;
        }
        .footer-links a {
            color: #667eea;
            text-decoration: none;
            margin: 0 10px;
            font-size: 14px;
        }
        .footer-links a:hover {
            text-decoration: underline;
        }
        .expires {
            font-size: 14px;
            color: #6b7280;
            margin-top: 20px;
            padding: 12px;
            background-color: #f3f4f6;
            border-radius: 6px;
        }
        @media (max-width: 600px) {
            .container {
                margin: 10px;
                border-radius: 12px;
            }
            .header, .content, .footer {
                padding: 20px;
            }
            .greeting {
                font-size: 20px;
            }
            .reset-button {
                display: block;
                width: 100%;
                box-sizing: border-box;
            }
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <div class="logo">AdomiApp</div>
            <p class="tagline">Conectando profesionales con clientes</p>
        </div>
        
        <div class="content">
            <h1 class="greeting">¡Hola ${name}!</h1>
            
            <p class="message">
                Recibimos una solicitud para restablecer la contraseña de tu cuenta en AdomiApp. 
                Si solicitaste este cambio, haz clic en el botón de abajo para crear una nueva contraseña.
            </p>
            
            <div style="text-align: center;">
                <a href="${resetLink}" class="reset-button">
                    🔐 Restablecer Contraseña
                </a>
            </div>
            
            <div class="security-note">
                <strong>⚠️ Importante:</strong> Este enlace es válido por 1 hora y solo puede usarse una vez. 
                Si no solicitaste este cambio, puedes ignorar este email de forma segura.
            </div>
            
            <div class="expires">
                <strong>⏰ Este enlace expira en 1 hora</strong><br>
                Si necesitas un nuevo enlace, puedes solicitar otro desde la página de recuperación de contraseña.
            </div>
        </div>
        
        <div class="footer">
            <p class="footer-text">
                Este email fue enviado desde AdomiApp. Si tienes alguna pregunta, no dudes en contactarnos.
            </p>
            
            <div class="footer-links">
                <a href="https://adomiapp.cl">Sitio Web</a>
                <a href="https://adomiapp.cl/soporte">Soporte</a>
                <a href="https://adomiapp.cl/privacidad">Privacidad</a>
            </div>
            
            <p class="footer-text" style="margin-top: 20px; font-size: 12px;">
                © 2024 AdomiApp. Todos los derechos reservados.<br>
                Este es un email automático, por favor no respondas a este mensaje.
            </p>
        </div>
    </div>
</body>
</html>
  `;
}

export function getPasswordResetSuccessEmailTemplate(name: string): string {
  return `
<!DOCTYPE html>
<html lang="es">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Contraseña Actualizada - AdomiApp</title>
    <style>
        body {
            margin: 0;
            padding: 0;
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
            background-color: #f8fafc;
            line-height: 1.6;
        }
        .container {
            max-width: 600px;
            margin: 0 auto;
            background-color: #ffffff;
            border-radius: 16px;
            overflow: hidden;
            box-shadow: 0 10px 30px rgba(0, 0, 0, 0.1);
        }
        .header {
            background: linear-gradient(135deg, #10b981 0%, #059669 100%);
            padding: 40px 30px;
            text-align: center;
            color: white;
        }
        .logo {
            font-size: 32px;
            font-weight: bold;
            margin-bottom: 10px;
            letter-spacing: -1px;
        }
        .content {
            padding: 40px 30px;
            text-align: center;
        }
        .success-icon {
            font-size: 64px;
            margin-bottom: 20px;
        }
        .greeting {
            font-size: 24px;
            color: #1f2937;
            margin: 0 0 20px 0;
            font-weight: 600;
        }
        .message {
            font-size: 16px;
            color: #4b5563;
            margin: 0 0 30px 0;
        }
        .login-button {
            display: inline-block;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
            text-decoration: none;
            padding: 16px 32px;
            border-radius: 12px;
            font-weight: 600;
            font-size: 16px;
            margin: 20px 0;
        }
        .footer {
            background-color: #f8fafc;
            padding: 30px;
            text-align: center;
            border-top: 1px solid #e5e7eb;
        }
        .footer-text {
            font-size: 14px;
            color: #6b7280;
            margin: 0;
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <div class="logo">AdomiApp</div>
        </div>
        
        <div class="content">
            <div class="success-icon">✅</div>
            <h1 class="greeting">¡Contraseña Actualizada!</h1>
            
            <p class="message">
                Hola ${name}, tu contraseña ha sido actualizada exitosamente. 
                Tu cuenta está segura y puedes continuar usando AdomiApp con normalidad.
            </p>
            
            <a href="https://adomiapp.cl/auth/login" class="login-button">
                Iniciar Sesión
            </a>
        </div>
        
        <div class="footer">
            <p class="footer-text">
                © 2024 AdomiApp. Todos los derechos reservados.
            </p>
        </div>
    </div>
</body>
</html>
  `;
}

