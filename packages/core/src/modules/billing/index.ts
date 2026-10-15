import { DrizzleBillingRepository } from "./infrastructure/repositories/drizzle-billing.repository";
import { ReactPdfInvoiceRenderer } from "./infrastructure/pdf/react-pdf-invoice-renderer";
import { NodemailerBillingEmailService } from "./infrastructure/email/nodemailer-billing-email-service";
import { GenerateScheduleUseCase } from "./application/use-cases/generate-schedule.usecase";
import { CreateManualInvoiceUseCase } from "./application/use-cases/create-manual-invoice.usecase";
import { IssueInvoiceUseCase } from "./application/use-cases/issue-invoice.usecase";
import { RecordPaymentUseCase } from "./application/use-cases/record-payment.usecase";
import { CreateCreditNoteUseCase } from "./application/use-cases/create-credit-note.usecase";
import { CheckOverdueInvoicesUseCase } from "./application/use-cases/check-overdue-invoices.usecase";
import { GetBillingSummaryUseCase } from "./application/use-cases/get-billing-summary.usecase";
import type { BillingRepository } from "./domain/repositories/billing-repository.port";
import type { PdfRendererPort } from "./application/ports/pdf-renderer.port";
import type { BillingEmailServicePort } from "./application/ports/billing-email.port";
import { DrizzleEventOutboxRepository } from "../../shared/infrastructure/events/outbox-repository";
import { getSettingsModule } from "../settings";
import { getClientsModule } from "../clients";

export * from "./domain/entities/invoice.entity";
export * from "./domain/entities/invoice-line.entity";
export * from "./domain/entities/billing-period.entity";
export * from "./domain/entities/payment.entity";
export * from "./domain/entities/credit-note.entity";
export * from "./domain/events/billing-events";
export * from "./domain/services/billing-period-generator";
export * from "./domain/services/gst-calculator";
export * from "./domain/services/invoice-number-generator";
export * from "./domain/repositories/billing-repository.port";
export * from "./application/ports/pdf-renderer.port";
export * from "./application/ports/billing-email.port";
export * from "./application/use-cases/generate-schedule.usecase";
export * from "./application/use-cases/create-manual-invoice.usecase";
export * from "./application/use-cases/issue-invoice.usecase";
export * from "./application/use-cases/record-payment.usecase";
export * from "./application/use-cases/create-credit-note.usecase";
export * from "./application/use-cases/check-overdue-invoices.usecase";
export * from "./application/use-cases/get-billing-summary.usecase";
export * from "./infrastructure/repositories/drizzle-billing.repository";
export * from "./infrastructure/pdf/react-pdf-invoice-renderer";
export * from "./infrastructure/email/nodemailer-billing-email-service";

export class BillingModule {
  public readonly repo: BillingRepository;
  public readonly pdfRenderer: PdfRendererPort;
  public readonly emailService: BillingEmailServicePort;

  public readonly generateScheduleUseCase: GenerateScheduleUseCase;
  public readonly createManualInvoiceUseCase: CreateManualInvoiceUseCase;
  public readonly issueInvoiceUseCase: IssueInvoiceUseCase;
  public readonly recordPaymentUseCase: RecordPaymentUseCase;
  public readonly createCreditNoteUseCase: CreateCreditNoteUseCase;
  public readonly checkOverdueInvoicesUseCase: CheckOverdueInvoicesUseCase;
  public readonly getBillingSummaryUseCase: GetBillingSummaryUseCase;

  constructor(
    repo?: BillingRepository,
    pdfRenderer?: PdfRendererPort,
    emailService?: BillingEmailServicePort,
  ) {
    this.repo = repo ?? new DrizzleBillingRepository();
    this.pdfRenderer = pdfRenderer ?? new ReactPdfInvoiceRenderer();
    this.emailService = emailService ?? new NodemailerBillingEmailService();

    const outboxPublisher = new DrizzleEventOutboxRepository();
    const settingsModule = getSettingsModule();
    const clientsModule = getClientsModule();

    this.generateScheduleUseCase = new GenerateScheduleUseCase(this.repo);
    this.createManualInvoiceUseCase = new CreateManualInvoiceUseCase(
      this.repo,
      settingsModule.repo,
      clientsModule.repo,
    );
    this.issueInvoiceUseCase = new IssueInvoiceUseCase(
      this.repo,
      settingsModule.repo,
      outboxPublisher,
    );
    this.recordPaymentUseCase = new RecordPaymentUseCase(
      this.repo,
      outboxPublisher,
      this.emailService,
      clientsModule.repo,
    );
    this.createCreditNoteUseCase = new CreateCreditNoteUseCase(this.repo);
    this.checkOverdueInvoicesUseCase = new CheckOverdueInvoicesUseCase(this.repo, outboxPublisher);
    this.getBillingSummaryUseCase = new GetBillingSummaryUseCase(this.repo);
  }
}

let instance: BillingModule | null = null;

export function getBillingModule(): BillingModule {
  if (!instance) {
    instance = new BillingModule();
  }
  return instance;
}
