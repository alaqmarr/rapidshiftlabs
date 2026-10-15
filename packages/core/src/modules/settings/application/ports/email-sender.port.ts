export interface SendEmailParams {
  to: string;
  subject: string;
  html: string;
  text?: string;
}

export interface EmailSenderPort {
  send(params: SendEmailParams): Promise<{ messageId?: string; accepted: boolean }>;
}
