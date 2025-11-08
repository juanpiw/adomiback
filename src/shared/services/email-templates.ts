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

export interface ManualCashReceiptEmailData {
  appName: string;
  providerName?: string | null;
  providerEmail?: string | null;
  amount: number;
  currency: string;
  reference?: string | null;
  difference?: number;
  debtTotal?: number;
  uploadDateISO?: string | null;
  receiptUrl?: string | null;
  adminPanelUrl?: string | null;
}

export interface ManualCashReceiptAdminEmailData extends ManualCashReceiptEmailData {
  providerId: number;
  paymentId: number;
  receiptUrl?: string | null;
}

export interface ManualCashDecisionEmailData {
  appName: string;
  providerName?: string | null;
  status: 'approved' | 'rejected' | 'resubmission_requested';
  amount: number;
  currency: string;
  reference?: string | null;
  notes?: string | null;
  difference?: number | null;
  debtTotal?: number | null;
  receiptUrl?: string | null;
  adminPanelUrl?: string | null;
  supportEmail?: string | null;
  reviewedAtISO?: string | null;
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

export function generateManualCashDecisionEmailHtml(data: ManualCashDecisionEmailData): string {
  const brand = data.brandColorHex || '#f97316';
  const logo = data.brandLogoUrl
    ? `<img src="${data.brandLogoUrl}" alt="${data.appName}" style="height:24px;display:block;margin:0 auto 16px" />`
    : '';
  const amountFmt = `${data.currency.toUpperCase()} ${Number(data.amount || 0).toFixed(2)}`;
  const debtFmt =
    typeof data.debtTotal === 'number'
      ? `${data.currency.toUpperCase()} ${Number(data.debtTotal || 0).toFixed(2)}`
      : null;
  const diffFmt =
    typeof data.difference === 'number'
      ? `${data.currency.toUpperCase()} ${Number(data.difference || 0).toFixed(2)}`
      : null;
  const reviewedAtLabel = data.reviewedAtISO
    ? new Date(data.reviewedAtISO).toLocaleString()
    : '';

  const titleMap = {
    approved: 'Comprobante aprobado',
    rejected: 'Comprobante rechazado',
    resubmission_requested: 'Se requiere nuevo comprobante'
  } as const;

  const helperTextMap = {
    approved:
      'El pago manual fue validado y se aplicará a las comisiones asociadas. Puedes revisar el detalle en el panel de saldos.',
    rejected:
      'El comprobante evaluado no cumple los criterios requeridos. Revisa los detalles y carga uno nuevo para continuar con la conciliación.',
    resubmission_requested:
      'Se solicitó un nuevo comprobante para validar el pago. Revisa los detalles y sube un archivo actualizado desde el panel.'
  } as const;

  const adminLink = data.adminPanelUrl
    ? `<a href="${data.adminPanelUrl}" style="display:inline-block;background:${brand};color:#fff;text-decoration:none;padding:10px 16px;border-radius:8px;font-size:13px;font-weight:600;margin-top:12px">Ir al panel</a>`
    : '';

  const receiptLink = data.receiptUrl
    ? `<a href="${data.receiptUrl}" style="display:inline-block;margin-top:8px;color:${brand};font-weight:600;text-decoration:none;font-size:12px">Ver comprobante enviado</a>`
    : '';

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
                    <div style="font-size:18px;font-weight:600;margin:0 0 8px">${titleMap[data.status]}</div>
                    ${
                      data.providerName
                        ? `<div style="color:#6b7280;font-size:12px;margin-bottom:4px">${data.providerName}</div>`
                        : ''
                    }
                    ${
                      reviewedAtLabel
                        ? `<div style="color:#6b7280;font-size:12px">Revisión ${reviewedAtLabel}</div>`
                        : ''
                    }
                  </td>
                </tr>
                <tr>
                  <td style="padding:8px 24px 24px">
                    <div style="border:1px solid #e5e7eb;border-radius:10px;padding:16px;font-size:13px;color:#111">
                      <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="font-size:13px;color:#111">
                        <tr><td style="padding:4px 0">Monto declarado</td><td style="padding:4px 0;text-align:right;font-weight:600">${amountFmt}</td></tr>
                        ${
                          debtFmt
                            ? `<tr><td style="padding:4px 0">Deuda aplicada</td><td style="padding:4px 0;text-align:right">${debtFmt}</td></tr>`
                            : ''
                        }
                        ${
                          diffFmt
                            ? `<tr><td style="padding:4px 0">Diferencia</td><td style="padding:4px 0;text-align:right">${diffFmt}</td></tr>`
                            : ''
                        }
                        ${
                          data.reference
                            ? `<tr><td style="padding:4px 0">Referencia</td><td style="padding:4px 0;text-align:right">${data.reference}</td></tr>`
                            : ''
                        }
                      </table>
                      <p style="margin:12px 0 0;color:#374151;font-size:13px;line-height:1.45">
                        ${helperTextMap[data.status]}
                      </p>
                      ${
                        data.notes
                          ? `<div style="margin-top:12px;padding:12px;border-radius:8px;background:rgba(249, 115, 22, 0.08);color:#92400e;font-size:13px">${data.notes}</div>`
                          : ''
                      }
                      ${receiptLink}
                      ${adminLink}
                    </div>
                    ${
                      data.supportEmail
                        ? `<p style="margin:16px 0 0;color:#6b7280;font-size:12px">Si tienes dudas, escríbenos a <a href="mailto:${data.supportEmail}" style="color:${brand};text-decoration:none">${data.supportEmail}</a>.</p>`
                        : ''
                    }
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td align="center" style="padding:16px 0;color:#a3a3a3;font-size:12px;font-family:system-ui,-apple-system,Segoe UI,Roboto,Ubuntu,Cantarell,Noto Sans,sans-serif">
              ${data.appName}
            </td>
          </tr>
        </table>
      </td></tr>
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

export function generateManualCashReceiptProviderEmailHtml(data: ManualCashReceiptEmailData): string {
  const amountFormatted = `${data.currency.toUpperCase()} ${Number(data.amount || 0).toLocaleString('es-CL')}`;
  const debtFormatted = data.debtTotal === undefined || data.debtTotal === null
    ? null
    : `${data.currency.toUpperCase()} ${Number(data.debtTotal || 0).toLocaleString('es-CL')}`;
  const difference = Number(data.difference || 0);
  const differenceFormatted = Math.abs(difference) > 0.009
    ? `${data.currency.toUpperCase()} ${Number(difference).toLocaleString('es-CL')}`
    : null;
  const uploadedAt = data.uploadDateISO ? new Date(data.uploadDateISO).toLocaleString('es-CL') : null;
  const greeting = data.providerName ? `Hola ${data.providerName.split(' ')[0]},` : 'Hola,';

  return `
  <div style="margin:0;padding:0;background:#0b0b0c">
    <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="background:#0b0b0c;padding:24px 12px">
      <tr><td align="center">
        <table role="presentation" cellpadding="0" cellspacing="0" width="600" style="max-width:600px;width:100%">
          <tr>
            <td align="center" style="padding:16px 0;color:#fff;font-family:system-ui,-apple-system,Segoe UI,Roboto,Ubuntu,Cantarell,Noto Sans,sans-serif;font-size:14px">
              ${data.appName}
            </td>
          </tr>
          <tr>
            <td style="padding:0">
              <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="background:#fff;border-radius:16px;overflow:hidden">
                <tr>
                  <td style="padding:28px 28px 16px;font-family:system-ui,-apple-system,Segoe UI,Roboto,Ubuntu,Cantarell,Noto Sans,sans-serif;color:#0f172a">
                    <div style="font-size:18px;font-weight:700;margin:0 0 8px">Recibimos tu comprobante</div>
                    <div style="color:#475569;font-size:14px">${greeting}</div>
                  </td>
                </tr>
                <tr>
                  <td style="padding:0 28px 28px">
                    <div style="border:1px solid #e2e8f0;border-radius:14px;padding:18px;color:#0f172a;font-size:14px;line-height:1.55">
                      <p style="margin:0 0 12px">Registramos tu comprobante por <strong>${amountFormatted}</strong>. Nuestro equipo revisará el pago y te avisará cuando esté aprobado.</p>
                      ${debtFormatted ? `<p style="margin:0 0 12px;color:#334155">Monto pendiente registrado: <strong>${debtFormatted}</strong>.</p>` : ''}
                      ${differenceFormatted ? `<p style="margin:0 0 12px;color:#b45309">Diferencia registrada: <strong>${differenceFormatted}</strong>. Si transferiste un monto distinto, lo consideraremos durante la revisión.</p>` : ''}
                      ${uploadedAt ? `<p style="margin:0;color:#64748b;font-size:12px">Enviado el ${uploadedAt}.</p>` : ''}
                    </div>
                    <div style="margin-top:18px;color:#475569;font-size:13px">
                      <p style="margin:0 0 6px">Si necesitas corregir el comprobante, puedes volver a subirlo desde tu panel.</p>
                      <p style="margin:0">Gracias por mantener tus comisiones al día.</p>
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

export function generateManualCashReceiptAdminEmailHtml(data: ManualCashReceiptAdminEmailData): string {
  const amountFormatted = `${data.currency.toUpperCase()} ${Number(data.amount || 0).toLocaleString('es-CL')}`;
  const debtFormatted = data.debtTotal === undefined || data.debtTotal === null
    ? null
    : `${data.currency.toUpperCase()} ${Number(data.debtTotal || 0).toLocaleString('es-CL')}`;
  const difference = Number(data.difference || 0);
  const differenceFormatted = Math.abs(difference) > 0.009
    ? `${data.currency.toUpperCase()} ${Number(difference).toLocaleString('es-CL')}`
    : null;
  const uploadedAt = data.uploadDateISO ? new Date(data.uploadDateISO).toLocaleString('es-CL') : null;
  const receiptLink = data.receiptUrl ? `<a href="${data.receiptUrl}" style="display:inline-block;margin-right:12px;font-weight:600;color:#2563eb;text-decoration:none">Ver comprobante</a>` : '';
  const panelLink = data.adminPanelUrl ? `<a href="${data.adminPanelUrl}" style="display:inline-block;font-weight:600;color:#2563eb;text-decoration:none">Abrir panel</a>` : '';

  return `
  <div style="margin:0;padding:0;background:#0b0b0c">
    <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="background:#0b0b0c;padding:24px 12px">
      <tr><td align="center">
        <table role="presentation" cellpadding="0" cellspacing="0" width="600" style="max-width:600px;width:100%">
          <tr>
            <td align="center" style="padding:16px 0;color:#fff;font-family:system-ui,-apple-system,Segoe UI,Roboto,Ubuntu,Cantarell,Noto Sans,sans-serif;font-size:14px">
              ${data.appName}
            </td>
          </tr>
          <tr>
            <td style="padding:0">
              <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="background:#fff;border-radius:16px;overflow:hidden">
                <tr>
                  <td style="padding:26px 28px 16px;font-family:system-ui,-apple-system,Segoe UI,Roboto,Ubuntu,Cantarell,Noto Sans,sans-serif;color:#0f172a">
                    <div style="font-size:18px;font-weight:700;margin:0 0 6px">Nuevo comprobante manual #${data.paymentId}</div>
                    <div style="color:#475569;font-size:13px">Proveedor #${data.providerId} · ${data.providerName || data.providerEmail || ''}</div>
                  </td>
                </tr>
                <tr>
                  <td style="padding:0 28px 28px">
                    <div style="border:1px solid #e2e8f0;border-radius:14px;padding:18px;color:#0f172a;font-size:14px;line-height:1.55">
                      <p style="margin:0 0 10px"><strong>Monto transferido:</strong> ${amountFormatted}</p>
                      ${debtFormatted ? `<p style="margin:0 0 10px"><strong>Deuda registrada:</strong> ${debtFormatted}</p>` : ''}
                      ${differenceFormatted ? `<p style="margin:0 0 10px;color:#b91c1c"><strong>Diferencia detectada:</strong> ${differenceFormatted}</p>` : ''}
                      <p style="margin:0 0 10px"><strong>Referencia:</strong> ${data.reference || '—'}</p>
                      <p style="margin:0 0 4px"><strong>Email proveedor:</strong> ${data.providerEmail || '—'}</p>
                      ${uploadedAt ? `<p style="margin:0;color:#64748b;font-size:12px">Enviado el ${uploadedAt}</p>` : ''}
                    </div>
                    <div style="margin-top:16px;display:flex;flex-wrap:wrap;gap:12px">${receiptLink}${panelLink}</div>
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


