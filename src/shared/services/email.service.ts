import nodemailer from 'nodemailer';
import { Logger } from '../utils/logger.util';
import {
  generateClientReceiptEmailHtml,
  generateProviderPaymentEmailHtml,
  generatePasswordResetEmailHtml,
  generateRefundDecisionEmailHtml,
  generateRefundReceivedEmailHtml,
  generateVerificationStatusEmailHtml,
  generateAppointmentClientEmailHtml,
  generateAppointmentProviderEmailHtml,
  ClientReceiptEmailData,
  ProviderPaymentEmailData,
  PasswordResetEmailData,
  RefundDecisionEmailData,
  RefundReceivedEmailData,
  VerificationStatusEmailData,
  AppointmentClientEmailData,
  AppointmentProviderEmailData,
  ManualCashReceiptEmailData,
  ManualCashReceiptAdminEmailData,
  generateManualCashReceiptProviderEmailHtml,
  generateManualCashReceiptAdminEmailHtml,
  ManualCashDecisionEmailData,
  generateManualCashDecisionEmailHtml
} from './email-templates';

const MODULE = 'EMAIL_SERVICE';

export class EmailService {
  private static transporter: nodemailer.Transporter | null = null;
  private static fromEmail = process.env.FROM_EMAIL || process.env.SMTP_USER || 'no-reply@example.com';
  private static fromName = process.env.FROM_NAME || 'AdomiApp';

  private static getTransporter() {
    if (this.transporter) return this.transporter;
    const host = process.env.SMTP_HOST;
    const port = Number(process.env.SMTP_PORT || 587);
    const user = process.env.SMTP_USER;
    const pass = process.env.SMTP_PASS;

    if (!host || !user || !pass) {
      Logger.warn(MODULE, 'SMTP not fully configured. Emails will be skipped.', { host: !!host, user: !!user });
      throw new Error('SMTP configuration missing');
    }

    this.transporter = nodemailer.createTransport({
      host,
      port,
      secure: port === 465,
      auth: { user, pass }
    });
    return this.transporter;
  }

  static async sendRaw(to: string, subject: string, html: string) {
    try {
      Logger.info(MODULE, 'Preparing to send email', { to, subject, from: this.fromEmail });
      const transporter = this.getTransporter();
      Logger.info(MODULE, 'SMTP transport ready');
      const info = await transporter.sendMail({
        from: `${this.fromName} <${this.fromEmail}>`,
        to,
        subject,
        html
      });
      Logger.info(MODULE, 'Email sent', { to, subject, messageId: info.messageId });
      return info;
    } catch (err: any) {
      Logger.error(MODULE, 'Email send failed', { to, subject, error: err?.message });
      throw err;
    }
  }

  static async sendClientReceipt(to: string, data: ClientReceiptEmailData) {
    Logger.info(MODULE, 'sendClientReceipt called', { to, data: { amount: data.amount, currency: data.currency, hasInvoice: !!data.invoicePdfUrl, hasReceipt: !!data.receiptUrl } });
    const html = generateClientReceiptEmailHtml(data);
    const subject = `${data.appName} – Confirmación de pago ${data.amount.toFixed(2)} ${data.currency.toUpperCase()}`;
    return this.sendRaw(to, subject, html);
  }

  static async sendProviderPaymentSummary(to: string, data: ProviderPaymentEmailData) {
    Logger.info(MODULE, 'sendProviderPaymentSummary called', { to, data: { amount: data.amount, commissionAmount: data.commissionAmount, providerAmount: data.providerAmount } });
    const html = generateProviderPaymentEmailHtml(data);
    const subject = `${data.appName} – Pago confirmado cita #${data.appointmentId}`;
    return this.sendRaw(to, subject, html);
  }

  static async sendPasswordReset(to: string, data: PasswordResetEmailData) {
    Logger.info(MODULE, 'sendPasswordReset called', { to });
    const html = generatePasswordResetEmailHtml(data);
    const subject = `${data.appName} – Restablecer contraseña`;
    return this.sendRaw(to, subject, html);
  }

  static async sendRefundDecision(to: string, data: RefundDecisionEmailData) {
    Logger.info(MODULE, 'sendRefundDecision called', { to, decision: data.decision, amount: data.refundAmount });
    const html = generateRefundDecisionEmailHtml(data);
    const subject = data.decision === 'approved'
      ? `${data.appName} – Devolución aprobada`
      : `${data.appName} – Devolución denegada`;
    return this.sendRaw(to, subject, html);
  }

  static async sendRefundReceived(to: string, data: RefundReceivedEmailData) {
    Logger.info(MODULE, 'sendRefundReceived called', { to, amount: data.originalAmount });
    const html = generateRefundReceivedEmailHtml(data);
    const subject = `${data.appName} – Recibimos tu solicitud de devolución`;
    return this.sendRaw(to, subject, html);
  }

  static async sendVerificationStatus(to: string, data: VerificationStatusEmailData) {
    Logger.info(MODULE, 'sendVerificationStatus called', { to, status: data.status });
    const html = generateVerificationStatusEmailHtml(data);
    const subject = data.status === 'approved'
      ? `${data.appName} – Tu identidad ha sido verificada`
      : `${data.appName} – Necesitamos nuevos documentos para verificar tu identidad`;
    return this.sendRaw(to, subject, html);
  }

  static async sendAppointmentBookedClient(to: string, data: AppointmentClientEmailData) {
    Logger.info(MODULE, 'sendAppointmentBookedClient called', {
      to,
      service: data.serviceName,
      provider: data.providerName
    });
    const html = generateAppointmentClientEmailHtml(data);
    const subject = `${data.appName} – Tu cita con ${data.providerName || 'tu profesional'} está agendada`;
    return this.sendRaw(to, subject, html);
  }

  static async sendAppointmentBookedProvider(to: string, data: AppointmentProviderEmailData) {
    Logger.info(MODULE, 'sendAppointmentBookedProvider called', {
      to,
      service: data.serviceName,
      client: data.clientName
    });
    const html = generateAppointmentProviderEmailHtml(data);
    const subject = `${data.appName} – Nueva cita con ${data.clientName || 'un cliente'}`;
    return this.sendRaw(to, subject, html);
  }

  static async sendManualCashReceiptProvider(to: string, data: ManualCashReceiptEmailData) {
    Logger.info(MODULE, 'sendManualCashReceiptProvider called', {
      to,
      amount: data.amount,
      currency: data.currency
    });
    const html = generateManualCashReceiptProviderEmailHtml(data);
    const subject = `${data.appName} – Recibimos tu comprobante de pago`; 
    return this.sendRaw(to, subject, html);
  }

  static async sendManualCashReceiptAdmin(to: string, data: ManualCashReceiptAdminEmailData) {
    Logger.info(MODULE, 'sendManualCashReceiptAdmin called', {
      to,
      paymentId: data.paymentId,
      providerId: data.providerId
    });
    const html = generateManualCashReceiptAdminEmailHtml(data);
    const subject = `${data.appName} – Nuevo comprobante manual #${data.paymentId}`;
    return this.sendRaw(to, subject, html);
  }

  static async sendManualCashDecision(to: string, data: ManualCashDecisionEmailData) {
    Logger.info(MODULE, 'sendManualCashDecision called', {
      to,
      status: data.status,
      amount: data.amount,
      currency: data.currency
    });
    const html = generateManualCashDecisionEmailHtml(data);
    const statusSubjectMap: Record<ManualCashDecisionEmailData['status'], string> = {
      approved: `${data.appName} – Comprobante aprobado`,
      rejected: `${data.appName} – Debes subir un nuevo comprobante`,
      resubmission_requested: `${data.appName} – Necesitamos un nuevo comprobante`
    };
    const subject = statusSubjectMap[data.status] || `${data.appName} – Actualización comprobante`;
    return this.sendRaw(to, subject, html);
  }
}


