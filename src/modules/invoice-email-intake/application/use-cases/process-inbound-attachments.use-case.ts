import type { OrganizationId } from "../../../../kernel/organization-id.js";
import {
  STALE_PROCESSING_MS,
  nextAttemptAfterFailure,
  type InboundAttachment,
} from "../../domain/entities/inbound-attachment.js";
import { MAX_ATTACHMENT_BYTES, looksLikePdf } from "../../domain/services/intake-rules.js";
import type {
  ProcessInboundAttachmentsPort,
  ProcessInboundAttachmentsResult,
} from "../../domain/ports/in/email-intake.ports.js";
import type {
  InboundAttachmentRepositoryPort,
  InvoiceIntakePort,
  ReceivedAttachmentInfo,
  ResendReceivingPort,
} from "../../domain/ports/out/email-intake.out-ports.js";

type Outcome = "imported" | "duplicate" | "rejected" | "failed";

/**
 * Processa os anexos pendentes de uma empresa, um de cada vez: reserva (atualização condicional — dois
 * processos nunca tratam o mesmo), descarrega da Resend, confirma que é mesmo PDF e importa pelo pipeline das
 * faturas. Falha passageira → «Erro de leitura» com nova tentativa; os anexos já concluídos não se repetem.
 */
export class ProcessInboundAttachmentsUseCase implements ProcessInboundAttachmentsPort {
  constructor(
    private readonly attachments: InboundAttachmentRepositoryPort,
    private readonly resend: ResendReceivingPort,
    private readonly intake: InvoiceIntakePort,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async execute(command: { organizationId: OrganizationId; limit?: number }): Promise<ProcessInboundAttachmentsResult> {
    const { organizationId } = command;
    const start = this.now();
    const due = await this.attachments.findDue(organizationId, start, new Date(start.getTime() - STALE_PROCESSING_MS), command.limit ?? 20);
    const result: ProcessInboundAttachmentsResult = { processed: 0, imported: 0, duplicates: 0, rejected: 0, failed: 0 };
    const listed = new Map<string, ReceivedAttachmentInfo[]>();

    for (const candidate of due) {
      const claimed = await this.attachments.claim(organizationId, candidate, this.now());
      if (!claimed) continue;
      const outcome = await this.processOne(organizationId, claimed, listed);
      result.processed++;
      if (outcome === "imported") result.imported++;
      else if (outcome === "duplicate") result.duplicates++;
      else if (outcome === "rejected") result.rejected++;
      else result.failed++;
    }
    return result;
  }

  private async processOne(organizationId: OrganizationId, a: InboundAttachment, listed: Map<string, ReceivedAttachmentInfo[]>): Promise<Outcome> {
    const finish = async (patch: Partial<InboundAttachment>, outcome: Outcome): Promise<Outcome> => {
      await this.attachments.update(organizationId, { ...a, ...patch, lockedAt: null, updatedAt: this.now() });
      return outcome;
    };
    const fail = (message: string) =>
      finish({ status: "read_error", errorCode: "transient", errorMessage: message.slice(0, 500), nextAttemptAt: nextAttemptAfterFailure(a.attempts, this.now()) }, "failed");

    try {
      let infos = listed.get(a.emailId);
      if (!infos) {
        infos = await this.resend.listAttachments(a.emailId);
        listed.set(a.emailId, infos);
      }
      const info = infos.find((i) => i.id === a.attachmentId);
      if (!info) return finish({ status: "rejected", errorCode: "attachment_missing", errorMessage: "O anexo já não está disponível na Resend.", nextAttemptAt: null }, "rejected");

      const { bytes, sha256 } = await this.resend.download(info.downloadUrl, MAX_ATTACHMENT_BYTES);
      if (!looksLikePdf(bytes)) {
        return finish({ status: "rejected", fileSha256: sha256, errorCode: "not_pdf_content", errorMessage: "O ficheiro não é um PDF válido.", nextAttemptAt: null }, "rejected");
      }

      const r = await this.intake.import(organizationId, { bytes, filename: a.filename }, a.destination);
      switch (r.outcome) {
        case "imported":
          return finish({ status: "imported", fileSha256: sha256, invoiceId: r.invoiceIds[0] ?? null, errorCode: null, errorMessage: null, nextAttemptAt: null }, "imported");
        case "duplicate":
          return finish({ status: "duplicate", fileSha256: sha256, invoiceId: r.invoiceId, errorCode: "duplicate", errorMessage: r.message, nextAttemptAt: null }, "duplicate");
        case "rejected":
          return finish({ status: "rejected", fileSha256: sha256, errorCode: r.code, errorMessage: r.message, nextAttemptAt: null }, "rejected");
        case "retry_later":
          return fail(r.message);
      }
    } catch (e) {
      // Erro passageiro (API da Resend, armazenamento, leitor): volta a tentar mais tarde; a mensagem não leva segredos.
      return fail(e instanceof Error ? e.message : "Erro desconhecido.");
    }
  }
}
