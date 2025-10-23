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


