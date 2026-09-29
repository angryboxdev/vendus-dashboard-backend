import { AccountingDocumentNotFoundError } from "../../domain/errors.js";
import type { AccountingDocumentRepositoryPort } from "../../domain/ports/out/accounting-document-repository.port.js";
import type { AccountingDocumentAttachmentRepositoryPort } from "../../domain/ports/out/accounting-document-attachment-repository.port.js";
import type { AccountingAuditLogPort } from "../../domain/ports/out/accounting-audit-log.port.js";
import type {
  ValidateAccountingDocumentCommand,
  ValidateAccountingDocumentPort,
  AccountingDocumentDTO,
} from "../../domain/ports/in/accounting-document.ports.js";
import { toAccountingDocumentDTO } from "./shared.js";

export class ValidateAccountingDocumentUseCase implements ValidateAccountingDocumentPort {
  constructor(
    private readonly repository: AccountingDocumentRepositoryPort,
    private readonly attachmentRepository: AccountingDocumentAttachmentRepositoryPort,
    private readonly auditLog: AccountingAuditLogPort,
  ) {}

  async execute(command: ValidateAccountingDocumentCommand): Promise<AccountingDocumentDTO> {
    const existing = await this.repository.findById(command.organizationId, command.id);
    if (!existing) throw new AccountingDocumentNotFoundError(command.id);

    const before = existing.toProps();
    const updated = existing.validate(command.actor);
    await this.repository.save(command.organizationId, updated);
    await this.auditLog.record({
      organizationId: command.organizationId,
      actor: command.actor,
      entityType: "accounting_document",
      entityId: updated.id,
      action: "validate",
      before,
      after: updated.toProps(),
    });

    const attachments = await this.attachmentRepository.listByDocument(command.organizationId, updated.id);
    return toAccountingDocumentDTO(updated, attachments);
  }
}
