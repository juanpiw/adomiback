export interface ClientReceiptEmailData {
  appName: string;
  amount: number;
  currency: string;
  receiptNumber?: string | null;
  invoiceNumber?: string | null;
  invoicePdfUrl?: string | null;
  receiptUrl?: string | null;
  paymentDateISO?: string | null;
  appointmentId?: number | null;
  brandColorHex?: string;
  brandLogoUrl?: string;
}

export interface ProviderPaymentEmailData {
  appName: string;
  appointmentId: number;
  amount: number;
  commissionAmount: number;
  providerAmount: number;
  currency: string;
  paymentDateISO?: string | null;
  brandColorHex?: string;
  brandLogoUrl?: string;
}

export interface PasswordResetEmailData {
  appName: string;
  resetUrl: string;
  brandColorHex?: string;
  brandLogoUrl?: string;
}

export interface RefundDecisionEmailData {
  appName: string;
  clientName?: string | null;
  serviceName?: string | null;
  appointmentId?: number | null;
  originalAmount: number;
  refundAmount?: number;
  currency: string;
  decision: 'approved' | 'denied';
  decisionNotes?: string | null;
  brandColorHex?: string;
  brandLogoUrl?: string;
}

export interface RefundReceivedEmailData {
  appName: string;
  clientName?: string | null;
  serviceName?: string | null;
  appointmentId?: number | null;
  originalAmount: number;
  currency: string;
  reviewDays?: number;
  brandColorHex?: string;
  brandLogoUrl?: string;
}

export interface VerificationStatusEmailData {
  appName: string;
  providerName?: string | null;
  status: 'approved' | 'rejected';
  rejectionReason?: string | null;
  brandColorHex?: string;
  brandLogoUrl?: string;
}

export interface AppointmentClientEmailData {
  appName: string;
  clientName?: string | null;
  providerName?: string | null;
  serviceName?: string | null;
  appointmentDateISO: string;
  appointmentEndISO?: string | null;
  locationLabel?: string | null;
  price?: number | null;
  currency?: string;
  notes?: string | null;
  dashboardUrl?: string | null;
  brandColorHex?: string;
  brandLogoUrl?: string;
}

export interface AppointmentProviderEmailData {
  appName: string;
  providerName?: string | null;
  clientName?: string | null;
  clientEmail?: string | null;
  clientPhone?: string | null;
  serviceName?: string | null;
  appointmentDateISO: string;
  appointmentEndISO?: string | null;
  locationLabel?: string | null;
  price?: number | null;
  currency?: string;
  notes?: string | null;
  dashboardUrl?: string | null;
  brandColorHex?: string;
  brandLogoUrl?: string;
}

export function generateClientReceiptEmailHtml(data: ClientReceiptEmailData): string {
  const date = data.paymentDateISO ? new Date(data.paymentDateISO).toLocaleString() : '';
  const amountFormatted = `${data.currency.toUpperCase()} ${data.amount.toFixed(2)}`;
  const brand = data.brandColorHex || '#635bff';
  const logo = data.brandLogoUrl ? `<img src="${data.brandLogoUrl}" alt="${data.appName}" style="height:24px;display:block;margin:0 auto 16px" />` : '';

  return `
  <div style="margin:0;padding:0;background:#0b0b0c">
    <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="background:#0b0b0c;padding:24px 12px">
      <tr>
        <td align="center">
          <table role="presentation" cellpadding="0" cellspacing="0" width="600" style="max-width:600px;width:100%">
            <tr>
              <td align="center" style="padding:16px 0;color:#fff;font-family:system-ui,-apple-system,Segoe UI,Roboto,Ubuntu,Cantarell,Noto Sans,sans-serif;font-size:14px">
                ${logo}
                <div style="opacity:.9">${data.appName}</div>
              </td>
            </tr>
            <tr>
              <td style="padding:0">
                <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="background:#fff;border-radius:12px;overflow:hidden">
                  <tr>
                    <td style="padding:24px 24px 8px;font-family:system-ui,-apple-system,Segoe UI,Roboto,Ubuntu,Cantarell,Noto Sans,sans-serif;color:#111">
                      <div style="font-size:18px;font-weight:600;margin:0 0 8px">Pago confirmado</div>
                      ${date ? `<div style=\"color:#6b7280;font-size:12px\">${date}</div>` : ''}
                    </td>
                  </tr>
                  <tr>
                    <td style="padding:8px 24px 24px">
                      <div style="border:1px solid #e5e7eb;border-radius:10px;padding:16px">
                        <div style="display:flex;align-items:center">
                          <div style="flex:1">
                            <div style="font-size:28px;font-weight:700;font-family:ui-sans-serif,system-ui;line-height:1.2">${amountFormatted}</div>
                            ${data.appointmentId ? `<div style=\"margin-top:4px;color:#6b7280;font-size:12px\">Cita #${data.appointmentId}</div>` : ''}
                          </div>
                          <div style="text-align:right">
                            ${data.invoicePdfUrl ? `<a href="${data.invoicePdfUrl}" style="display:inline-block;margin-left:8px;background:${brand};color:#fff;text-decoration:none;padding:8px 12px;border-radius:8px;font-size:12px">Descargar factura</a>` : ''}
                            ${data.receiptUrl ? `<a href="${data.receiptUrl}" style="display:inline-block;margin-left:8px;background:#111;color:#fff;text-decoration:none;padding:8px 12px;border-radius:8px;font-size:12px">Descargar recibo</a>` : ''}
                          </div>
                        </div>
                        ${data.receiptNumber || data.invoiceNumber ? `
                        <table role=\"presentation\" cellpadding=\"0\" cellspacing=\"0\" width=\"100%\" style=\"margin-top:12px;color:#374151;font-size:13px\">
                          ${data.receiptNumber ? `<tr><td style=\"padding:2px 0\">Nº de recibo</td><td style=\"padding:2px 0;text-align:right\">${data.receiptNumber}</td></tr>` : ''}
                          ${data.invoiceNumber ? `<tr><td style=\"padding:2px 0\">Nº de factura</td><td style=\"padding:2px 0;text-align:right\">${data.invoiceNumber}</td></tr>` : ''}
                        </table>` : ''}
                      </div>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
            <tr>
              <td align="center" style="padding:16px 0;color:#a3a3a3;font-size:12px;font-family:system-ui,-apple-system,Segoe UI,Roboto,Ubuntu,Cantarell,Noto Sans,sans-serif">Gracias por confiar en ${data.appName}.</td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </div>`;
}

export function generateProviderPaymentEmailHtml(data: ProviderPaymentEmailData): string {
  const date = data.paymentDateISO ? new Date(data.paymentDateISO).toLocaleString() : '';
  const f = (n: number) => `${data.currency.toUpperCase()} ${n.toFixed(2)}`;
  const brand = data.brandColorHex || '#635bff';
  const logo = data.brandLogoUrl ? `<img src="${data.brandLogoUrl}" alt="${data.appName}" style="height:24px;display:block;margin:0 auto 16px" />` : '';

  return `
  <div style="margin:0;padding:0;background:#0b0b0c">
    <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="background:#0b0b0c;padding:24px 12px">
      <tr>
        <td align="center">
          <table role="presentation" cellpadding="0" cellspacing="0" width="600" style="max-width:600px;width:100%">
            <tr>
              <td align="center" style="padding:16px 0;color:#fff;font-family:system-ui,-apple-system,Segoe UI,Roboto,Ubuntu,Cantarell,Noto Sans,sans-serif;font-size:14px">
                ${logo}
                <div style="opacity:.9">${data.appName}</div>
              </td>
            </tr>
            <tr>
              <td style="padding:0">
                <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="background:#fff;border-radius:12px;overflow:hidden">
                  <tr>
                    <td style="padding:24px 24px 8px;font-family:system-ui,-apple-system,Segoe UI,Roboto,Ubuntu,Cantarell,Noto Sans,sans-serif;color:#111">
                      <div style="font-size:18px;font-weight:600;margin:0 0 8px">Pago confirmado – Cita #${data.appointmentId}</div>
                      ${date ? `<div style=\"color:#6b7280;font-size:12px\">${date}</div>` : ''}
                    </td>
                  </tr>
                  <tr>
                    <td style="padding:8px 24px 24px">
                      <div style="border:1px solid #e5e7eb;border-radius:10px;padding:16px">
                        <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="font-size:13px;color:#111">
                          <tr><td style="padding:6px 0">Total cobrado</td><td style="padding:6px 0;text-align:right;font-weight:600">${f(data.amount)}</td></tr>
                          <tr><td style="padding:6px 0">Comisión plataforma</td><td style="padding:6px 0;text-align:right;color:#b91c1c">${f(data.commissionAmount)}</td></tr>
                          <tr><td style="padding:6px 0">Neto para proveedor</td><td style="padding:6px 0;text-align:right;color:${brand};font-weight:700">${f(data.providerAmount)}</td></tr>
                        </table>
                        <div style="margin-top:12px;color:#6b7280;font-size:12px">La liquidación se realizará según el calendario de pagos.</div>
                      </div>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </div>`;
}

export function generatePasswordResetEmailHtml(data: PasswordResetEmailData): string {
  const brand = data.brandColorHex || '#635bff';
  const logo = data.brandLogoUrl ? `<img src="${data.brandLogoUrl}" alt="${data.appName}" style="height:24px;display:block;margin:0 auto 16px" />` : '';
  return `
  <div style="margin:0;padding:0;background:#0b0b0c">
    <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="background:#0b0b0c;padding:24px 12px">
      <tr>
        <td align="center">
          <table role="presentation" cellpadding="0" cellspacing="0" width="600" style="max-width:600px;width:100%">
            <tr>
              <td align="center" style="padding:16px 0;color:#fff;font-family:system-ui,-apple-system,Segoe UI,Roboto,Ubuntu,Cantarell,Noto Sans,sans-serif;font-size:14px">
                ${logo}
                <div style="opacity:.9">${data.appName}</div>
              </td>
            </tr>
            <tr>
              <td style="padding:0">
                <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="background:#fff;border-radius:12px;overflow:hidden">
                  <tr>
                    <td style="padding:24px 24px 8px;font-family:system-ui,-apple-system,Segoe UI,Roboto,Ubuntu,Cantarell,Noto Sans,sans-serif;color:#111">
                      <div style="font-size:18px;font-weight:600;margin:0 0 8px">Restablecer contraseña</div>
                      <div style="color:#6b7280;font-size:13px">Has solicitado restablecer tu contraseña. Si no fuiste tú, ignora este correo.</div>
                    </td>
                  </tr>
                  <tr>
                    <td style="padding:8px 24px 24px">
                      <div style="border:1px solid #e5e7eb;border-radius:10px;padding:16px">
                        <a href="${data.resetUrl}" style="display:inline-block;background:${brand};color:#fff;text-decoration:none;padding:10px 16px;border-radius:8px;font-size:14px;font-weight:600">Crear nueva contraseña</a>
                        <div style="margin-top:12px;color:#6b7280;font-size:12px">El enlace es válido por 60 minutos.</div>
                      </div>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </div>`;
}

export function generateRefundDecisionEmailHtml(data: RefundDecisionEmailData): string {
  const brand = data.brandColorHex || '#635bff';
  const logo = data.brandLogoUrl ? `<img src="${data.brandLogoUrl}" alt="${data.appName}" style="height:24px;display:block;margin:0 auto 16px" />` : '';
  const amountFmt = (n: number | undefined) => `${data.currency.toUpperCase()} ${(Number(n || 0)).toFixed(2)}`;
  const title = data.decision === 'approved' ? 'Solicitud de devolución aprobada' : 'Solicitud de devolución denegada';
  const bodyApproved = `
    <p style="margin:0 0 12px;color:#374151">Hemos aprobado tu solicitud de devolución${data.appointmentId ? ` para la cita #${data.appointmentId}` : ''}.</p>
    <p style="margin:0 0 12px;color:#374151">Monto pagado: <strong>${amountFmt(data.originalAmount)}</strong><br/>
    Monto a devolver (según política): <strong>${amountFmt(data.refundAmount)}</strong></p>
    <p style="margin:0 0 12px;color:#374151">Procesaremos el reembolso en un plazo de 3 días hábiles.</p>
  `;
  const bodyDenied = `
    <p style="margin:0 0 12px;color:#374151">No podemos aprobar tu solicitud de devolución${data.appointmentId ? ` para la cita #${data.appointmentId}` : ''}.</p>
    ${data.decisionNotes ? `<p style=\"margin:0 0 12px;color:#374151\">Motivo: ${data.decisionNotes}</p>` : ''}
    <p style="margin:0;color:#374151">Si necesitas más información, contáctanos respondiendo este correo.</p>
  `;

  return `
  <div style="margin:0;padding:0;background:#0b0b0c">
    <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="background:#0b0b0c;padding:24px 12px">
      <tr><td align="center">
        <table role="presentation" cellpadding="0" cellspacing="0" width="600" style="max-width:600px;width:100%">
          <tr>
            <td align="center" style="padding:16px 0;color:#fff;font-family:system-ui,-apple-system,Segoe UI,Roboto,Ubuntu,Cantarell,Noto Sans,sans-serif;font-size:14px">
              ${logo}
              <div style="opacity:.9">${data.appName}</div>
            </td>
          </tr>
          <tr>
            <td style="padding:0">
              <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="background:#fff;border-radius:12px;overflow:hidden">
                <tr>
                  <td style="padding:24px 24px 8px;font-family:system-ui,-apple-system,Segoe UI,Roboto,Ubuntu,Cantarell,Noto Sans,sans-serif;color:#111">
                    <div style="font-size:18px;font-weight:600;margin:0 0 8px">${title}</div>
                    ${data.serviceName ? `<div style=\"color:#6b7280;font-size:12px\">Servicio: ${data.serviceName}</div>` : ''}
                  </td>
                </tr>
                <tr>
                  <td style="padding:8px 24px 24px">
                    <div style="border:1px solid #e5e7eb;border-radius:10px;padding:16px;color:#111;font-size:14px">
                      ${data.decision === 'approved' ? bodyApproved : bodyDenied}
                    </div>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td align="center" style="padding:16px 0;color:#a3a3a3;font-size:12px;font-family:system-ui,-apple-system,Segoe UI,Roboto,Ubuntu,Cantarell,Noto Sans,sans-serif">${data.appName}</td>
          </tr>
        </table>
      </td></tr>
    </table>
  </div>`;
}

export function generateRefundReceivedEmailHtml(data: RefundReceivedEmailData): string {
  const brand = data.brandColorHex || '#635bff';
  const logo = data.brandLogoUrl ? `<img src="${data.brandLogoUrl}" alt="${data.appName}" style="height:24px;display:block;margin:0 auto 16px" />` : '';
  const amountFmt = `${data.currency.toUpperCase()} ${Number(data.originalAmount || 0).toFixed(2)}`;
  const days = Number(data.reviewDays || 3);
  return `
  <div style="margin:0;padding:0;background:#0b0b0c">
    <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="background:#0b0b0c;padding:24px 12px">
      <tr><td align="center">
        <table role="presentation" cellpadding="0" cellspacing="0" width="600" style="max-width:600px;width:100%">
          <tr>
            <td align="center" style="padding:16px 0;color:#fff;font-family:system-ui,-apple-system,Segoe UI,Roboto,Ubuntu,Cantarell,Noto Sans,sans-serif;font-size:14px">
              ${logo}
              <div style="opacity:.9">${data.appName}</div>
            </td>
          </tr>
          <tr>
            <td style="padding:0">
              <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="background:#fff;border-radius:12px;overflow:hidden">
                <tr>
                  <td style="padding:24px 24px 8px;font-family:system-ui,-apple-system,Segoe UI,Roboto,Ubuntu,Cantarell,Noto Sans,sans-serif;color:#111">
                    <div style="font-size:18px;font-weight:600;margin:0 0 8px">Solicitud de devolución recibida</div>
                    ${data.serviceName ? `<div style=\"color:#6b7280;font-size:12px\">Servicio: ${data.serviceName}${data.appointmentId ? ` – Cita #${data.appointmentId}` : ''}</div>` : ''}
                  </td>
                </tr>
                <tr>
                  <td style="padding:8px 24px 24px">
                    <div style="border:1px solid #e5e7eb;border-radius:10px;padding:16px;color:#111;font-size:14px">
                      <p style="margin:0 0 12px;color:#374151">Estamos revisando tu caso. El monto pagado fue <strong>${amountFmt}</strong>.</p>
                      <p style="margin:0 0 12px;color:#374151">Te enviaremos una respuesta dentro de <strong>${days} días hábiles</strong>.</p>
                      <p style="margin:0;color:#6b7280;font-size:12px">Gracias por tu paciencia.</p>
                    </div>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td align="center" style="padding:16px 0;color:#a3a3a3;font-size:12px;font-family:system-ui,-apple-system,Segoe UI,Roboto,Ubuntu,Cantarell,Noto Sans,sans-serif">${data.appName}</td>
          </tr>
        </table>
      </td></tr>
    </table>
  </div>`;
}

export function generateVerificationStatusEmailHtml(data: VerificationStatusEmailData): string {
  const brand = data.brandColorHex || '#2563eb';
  const logo = data.brandLogoUrl ? `<img src="${data.brandLogoUrl}" alt="${data.appName}" style="height:24px;display:block;margin:0 auto 16px" />` : '';
  const title = data.status === 'approved' ? 'Tu identidad ha sido verificada' : 'Necesitamos nuevos documentos';
  const greeting = data.providerName ? `Hola ${data.providerName},` : 'Hola,';
  const bodyApproved = `
    <p style="margin:0 0 12px;color:#374151">${greeting}</p>
    <p style="margin:0 0 12px;color:#374151">Tu identidad ya fue verificada correctamente. A partir de ahora mostramos la insignia de confianza en tu perfil y en los resultados de búsqueda.</p>
    <p style="margin:0 0 12px;color:#374151">Gracias por ayudarnos a mantener a Adomi como una comunidad segura.</p>
  `;
  const bodyRejected = `
    <p style="margin:0 0 12px;color:#374151">${greeting}</p>
    <p style="margin:0 0 12px;color:#374151">Revisamos tus documentos, pero necesitamos que envíes nuevamente la información para poder verificar tu identidad.</p>
    ${data.rejectionReason ? `<p style="margin:0 0 12px;color:#b91c1c"><strong>Motivo:</strong> ${data.rejectionReason}</p>` : ''}
    <p style="margin:0 0 12px;color:#374151">Ingresa a tu panel y carga fotos claras del anverso y reverso de tu documento. También puedes añadir una selfie sosteniéndolo.</p>
  `;

  return `
  <div style="margin:0;padding:0;background:#0b0b0c">
    <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="background:#0b0b0c;padding:24px 12px">
      <tr><td align="center">
        <table role="presentation" cellpadding="0" cellspacing="0" width="600" style="max-width:600px;width:100%">
          <tr>
            <td align="center" style="padding:16px 0;color:#fff;font-family:system-ui,-apple-system,Segoe UI,Roboto,Ubuntu,Cantarell,Noto Sans,sans-serif;font-size:14px">
              ${logo}
              <div style="opacity:.9">${data.appName}</div>
            </td>
          </tr>
          <tr>
            <td style="padding:0">
              <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="background:#fff;border-radius:12px;overflow:hidden">
                <tr>
                  <td style="padding:24px 24px 8px;font-family:system-ui,-apple-system,Segoe UI,Roboto,Ubuntu,Cantarell,Noto Sans,sans-serif;color:#111">
                    <div style="font-size:18px;font-weight:600;margin:0 0 8px">${title}</div>
                  </td>
                </tr>
                <tr>
                  <td style="padding:8px 24px 24px">
                    <div style="border:1px solid #e5e7eb;border-radius:10px;padding:16px;color:#111;font-size:14px">
                      ${data.status === 'approved' ? bodyApproved : bodyRejected}
                      <p style="margin:12px 0 0;color:#6b7280;font-size:12px">Equipo ${data.appName}</p>
                    </div>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
        </table>
      </td></tr>
    </table>
  </div>`;
}

function formatDateTimeRange(startISO: string, endISO?: string | null) {
  try {
    const start = new Date(startISO);
    const locales: Intl.DateTimeFormatOptions = { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' };
    const datePart = start.toLocaleDateString('es-CL', locales);
    const timePart = start.toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' });

    let range = `${timePart}`;
    if (endISO) {
      const end = new Date(endISO);
      const endTime = end.toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' });
      range = `${timePart} - ${endTime}`;
    }

    return { datePart, timeRange: range };
  } catch (err) {
    return { datePart: '', timeRange: '' };
  }
}

function formatCurrency(amount?: number | null, currency?: string) {
  if (typeof amount !== 'number') return '';
  const curr = currency || 'CLP';
  try {
    return new Intl.NumberFormat('es-CL', { style: 'currency', currency: curr }).format(amount);
  } catch {
    return `${curr.toUpperCase()} ${amount.toFixed(0)}`;
  }
}

export function generateAppointmentClientEmailHtml(data: AppointmentClientEmailData): string {
  const brand = data.brandColorHex || '#6366f1';
  const logo = data.brandLogoUrl ? `<img src="${data.brandLogoUrl}" alt="${data.appName}" style="height:24px;display:block;margin:0 auto 16px" />` : '';
  const priceFormatted = formatCurrency(data.price, data.currency);
  const { datePart, timeRange } = formatDateTimeRange(data.appointmentDateISO, data.appointmentEndISO || undefined);
  const greeting = data.clientName ? `Hola ${data.clientName},` : 'Hola,';

  return `
  <div style="margin:0;padding:0;background:#0b0b0c">
    <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="background:#0b0b0c;padding:24px 12px">
      <tr><td align="center">
        <table role="presentation" cellpadding="0" cellspacing="0" width="600" style="max-width:600px;width:100%">
          <tr>
            <td align="center" style="padding:16px 0;color:#fff;font-family:system-ui,-apple-system,Segoe UI,Roboto,Ubuntu,Cantarell,Noto Sans,sans-serif;font-size:14px">
              ${logo}
              <div style="opacity:.9">${data.appName}</div>
            </td>
          </tr>
          <tr>
            <td style="padding:0">
              <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="background:#fff;border-radius:12px;overflow:hidden">
                <tr>
                  <td style="padding:24px 24px 8px;font-family:system-ui,-apple-system,Segoe UI,Roboto,Ubuntu,Cantarell,Noto Sans,sans-serif;color:#0f172a">
                    <div style="font-size:20px;font-weight:700;margin:0 0 8px">Tu cita está confirmada</div>
                    <div style="color:#475569;font-size:13px">${greeting}</div>
                  </td>
                </tr>
                <tr>
                  <td style="padding:8px 24px 24px">
                    <div style="border:1px solid #e2e8f0;border-radius:14px;padding:18px">
                      <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="font-size:13px;color:#0f172a">
                        ${data.providerName ? `<tr><td style="padding:6px 0;font-weight:600">Profesional</td><td style="padding:6px 0;text-align:right">${data.providerName}</td></tr>` : ''}
                        ${data.serviceName ? `<tr><td style="padding:6px 0;font-weight:600">Servicio</td><td style="padding:6px 0;text-align:right">${data.serviceName}</td></tr>` : ''}
                        ${datePart ? `<tr><td style="padding:6px 0;font-weight:600">Fecha</td><td style="padding:6px 0;text-align:right;text-transform:capitalize">${datePart}</td></tr>` : ''}
                        ${timeRange ? `<tr><td style="padding:6px 0;font-weight:600">Horario</td><td style="padding:6px 0;text-align:right">${timeRange}</td></tr>` : ''}
                        ${data.locationLabel ? `<tr><td style="padding:6px 0;font-weight:600">Dirección</td><td style="padding:6px 0;text-align:right">${data.locationLabel}</td></tr>` : ''}
                        ${priceFormatted ? `<tr><td style="padding:6px 0;font-weight:600">Precio estimado</td><td style="padding:6px 0;text-align:right;color:${brand};font-weight:700">${priceFormatted}</td></tr>` : ''}
                      </table>
                      ${data.notes ? `<div style="margin-top:16px;padding:14px;background:rgba(99,102,241,0.08);border-radius:10px;color:#4338ca;font-size:13px;line-height:1.5"><strong>Notas para el proveedor:</strong><br/>${data.notes}</div>` : ''}
                      ${data.dashboardUrl ? `<div style="margin-top:20px;text-align:center"><a href="${data.dashboardUrl}" style="display:inline-block;background:${brand};color:#fff;text-decoration:none;padding:10px 18px;border-radius:999px;font-size:13px;font-weight:600">Ver mi agenda</a></div>` : ''}
                    </div>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td align="center" style="padding:16px 0;color:#a3a3a3;font-size:12px;font-family:system-ui,-apple-system,Segoe UI,Roboto,Ubuntu,Cantarell,Noto Sans,sans-serif">
              Revisa y gestiona tus citas desde ${data.appName}.
            </td>
          </tr>
        </table>
      </td></tr>
    </table>
  </div>`;
}

export function generateAppointmentProviderEmailHtml(data: AppointmentProviderEmailData): string {
  const brand = data.brandColorHex || '#2563eb';
  const logo = data.brandLogoUrl ? `<img src="${data.brandLogoUrl}" alt="${data.appName}" style="height:24px;display:block;margin:0 auto 16px" />` : '';
  const priceFormatted = formatCurrency(data.price, data.currency);
  const { datePart, timeRange } = formatDateTimeRange(data.appointmentDateISO, data.appointmentEndISO || undefined);
  const greeting = data.providerName ? `Hola ${data.providerName},` : 'Hola,';

  return `
  <div style="margin:0;padding:0;background:#0b0b0c">
    <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="background:#0b0b0c;padding:24px 12px">
      <tr><td align="center">
        <table role="presentation" cellpadding="0" cellspacing="0" width="600" style="max-width:600px;width:100%">
          <tr>
            <td align="center" style="padding:16px 0;color:#fff;font-family:system-ui,-apple-system,Segoe UI,Roboto,Ubuntu,Cantarell,Noto Sans,sans-serif;font-size:14px">
              ${logo}
              <div style="opacity:.9">${data.appName}</div>
            </td>
          </tr>
          <tr>
            <td style="padding:0">
              <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="background:#fff;border-radius:12px;overflow:hidden">
                <tr>
                  <td style="padding:24px 24px 8px;font-family:system-ui,-apple-system,Segoe UI,Roboto,Ubuntu,Cantarell,Noto Sans,sans-serif;color:#0f172a">
                    <div style="font-size:20px;font-weight:700;margin:0 0 8px">Tienes una nueva cita</div>
                    <div style="color:#475569;font-size:13px">${greeting}</div>
                  </td>
                </tr>
                <tr>
                  <td style="padding:8px 24px 24px">
                    <div style="border:1px solid #e2e8f0;border-radius:14px;padding:18px">
                      <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="font-size:13px;color:#0f172a">
                        ${data.clientName ? `<tr><td style="padding:6px 0;font-weight:600">Cliente</td><td style="padding:6px 0;text-align:right">${data.clientName}</td></tr>` : ''}
                        ${data.clientEmail ? `<tr><td style="padding:6px 0;font-weight:600">Correo</td><td style="padding:6px 0;text-align:right">${data.clientEmail}</td></tr>` : ''}
                        ${data.clientPhone ? `<tr><td style="padding:6px 0;font-weight:600">Teléfono</td><td style="padding:6px 0;text-align:right">${data.clientPhone}</td></tr>` : ''}
                        ${data.serviceName ? `<tr><td style="padding:6px 0;font-weight:600">Servicio</td><td style="padding:6px 0;text-align:right">${data.serviceName}</td></tr>` : ''}
                        ${datePart ? `<tr><td style="padding:6px 0;font-weight:600">Fecha</td><td style="padding:6px 0;text-align:right;text-transform:capitalize">${datePart}</td></tr>` : ''}
                        ${timeRange ? `<tr><td style="padding:6px 0;font-weight:600">Horario</td><td style="padding:6px 0;text-align:right">${timeRange}</td></tr>` : ''}
                        ${data.locationLabel ? `<tr><td style="padding:6px 0;font-weight:600">Lugar</td><td style="padding:6px 0;text-align:right">${data.locationLabel}</td></tr>` : ''}
                        ${priceFormatted ? `<tr><td style="padding:6px 0;font-weight:600">Precio programado</td><td style="padding:6px 0;text-align:right;color:${brand};font-weight:700">${priceFormatted}</td></tr>` : ''}
                      </table>
                      ${data.notes ? `<div style="margin-top:16px;padding:14px;background:rgba(37,99,235,0.08);border-radius:10px;color:#1d4ed8;font-size:13px;line-height:1.5"><strong>Notas del cliente:</strong><br/>${data.notes}</div>` : ''}
                      ${data.dashboardUrl ? `<div style="margin-top:20px;text-align:center"><a href="${data.dashboardUrl}" style="display:inline-block;background:${brand};color:#fff;text-decoration:none;padding:10px 18px;border-radius:999px;font-size:13px;font-weight:600">Gestionar cita</a></div>` : ''}
                    </div>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td align="center" style="padding:16px 0;color:#a3a3a3;font-size:12px;font-family:system-ui,-apple-system,Segoe UI,Roboto,Ubuntu,Cantarell,Noto Sans,sans-serif">
              Recuerda confirmar la cita desde tu panel de ${data.appName}.
            </td>
          </tr>
        </table>
      </td></tr>
    </table>
  </div>`;
}


