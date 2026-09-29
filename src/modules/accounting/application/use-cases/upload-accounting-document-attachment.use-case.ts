import { createHash } from "crypto";
import { AccountingDocumentNotFoundError } from "../../domain/errors.js";
import type { AccountingDocumentRepositoryPort } from "../../domain/ports/out/accounting-document-repository.port.js";
import type { AccountingDocumentAttachmentRepositoryPort } from "../../domain/ports/out/accounting-document-attachment-repository.port.js";
import type { AccountingDocumentStoragePort } from "../../domain/ports/out/accounting-document-storage.port.js";
import type { AccountingAuditLogPort } from "../../domain/ports/out/accounting-audit-log.port.js";
import type {
  UploadAccountingDocumentAttachmentCommand,
  UploadAccountingDocumentAttachmentPort,
  AccountingDocumentDTO,
} from "../../domain/ports/in/accounting-document.ports.js";
import { toAccountingDocumentDTO } from "./shared.js";

/**
 * "Documento original" (secção 16) — cada upload cria uma versão nova em vez
 * de substituir a anterior; o hash SHA-256 fica gravado para o utilizador
 * poder confirmar que é o mesmo ficheiro sem o reabrir.
 */
export class UploadAccountingDocumentAttachmentUseCase implements UploadAccountingDocumentAttachmentPort {
  constructor(
    private readonly repository: AccountingDocumentRepositoryPort,
    private readonly attachmentRepository: AccountingDocumentAttachmentRepositoryPort,
    private readonly storage: AccountingDocumentStoragePort,
    private readonly auditLog: AccountingAuditLogPort,
  ) {}

  async execute(command: UploadAccountingDocumentAttachmentCommand): Promise<AccountingDocumentDTO> {
    const document = await this.repository.findById(command.organizationId, command.id);
    if (!document) throw new AccountingDocumentNotFoundError(command.id);

    const fileHash = createHash("sha256").update(command.buffer).digest("hex");
    const storagePath = await this.storage.store(command.buffer, command.filename, command.mimeType, command.organizationId);
    await this.attachmentRepository.add(command.organizationId, {
      documentId: command.id,
      storagePath,
      fileType: command.mimeType,
      fileHash,
      uploadedBy: command.actor,
    });

    await this.auditLog.record({
      organizationId: command.organizationId,
      actor: command.actor,
      entityType: "accounting_document",
      entityId: command.id,
      action: "upload_attachment",
      after: { storagePath, fileHash, filename: command.filename },
    });

    const attachments = await this.attachmentRepository.listByDocument(command.organizationId, command.id);
    return toAccountingDocumentDTO(document, attachments);
  }
}
