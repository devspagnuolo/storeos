import { Injectable, Logger } from '@nestjs/common';

export const MAIL_PROVIDER = Symbol('MAIL_PROVIDER');
export type OutgoingMail = { to: string; subject: string; text: string; html: string; from: string };
export type MailResult = { status: 'SENT' | 'SIMULATED'; providerId?: string };
export interface MailProvider { send(mail: OutgoingMail): Promise<MailResult> }

/** Sem conta de e-mail configurada: nada sai da plataforma, mas o conteúdo fica registrado para conferência. */
@Injectable()
export class SimulatedMailProvider implements MailProvider {
  private readonly logger = new Logger(SimulatedMailProvider.name);
  async send(mail: OutgoingMail): Promise<MailResult> {
    this.logger.log(`E-mail simulado para ${mail.to}: ${mail.subject}`);
    return { status: 'SIMULATED' };
  }
}

@Injectable()
export class ResendMailProvider implements MailProvider {
  constructor(private readonly apiKey: string) {}
  async send(mail: OutgoingMail): Promise<MailResult> {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { authorization: `Bearer ${this.apiKey}`, 'content-type': 'application/json' },
      body: JSON.stringify({ from: mail.from, to: [mail.to], subject: mail.subject, text: mail.text, html: mail.html }),
      signal: AbortSignal.timeout(10_000),
    });
    const body = (await response.json().catch(() => ({}))) as { id?: string; message?: string };
    if (!response.ok) throw new Error(`Resend ${response.status}: ${body.message ?? 'erro desconhecido'}`);
    return { status: 'SENT', providerId: body.id };
  }
}

export function createMailProvider(env: NodeJS.ProcessEnv = process.env): MailProvider {
  return env.RESEND_API_KEY ? new ResendMailProvider(env.RESEND_API_KEY) : new SimulatedMailProvider();
}
