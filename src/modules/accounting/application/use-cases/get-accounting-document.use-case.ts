import { AccountingDocumentNotFoundError } from "../../domain/errors.js";
import type { AccountingDocumentRepositoryPort } from "../../domain/ports/out/accounting-document-repository.port.js";
import type { AccountingDocumentAttachmentRepositoryPort } from "../../domain/ports/out/accounting-document-attachment-repository.port.js";
import type {
  GetAccountingDocumentCommand,
  GetAccountingDocumentPort,
  AccountingDocumentDTO,
} from "../../domain/ports/in/accounting-document.ports.js";
import { toAccountingDocumentDTO } from "./shared.js";

export class GetAccountingDocumentUseCase implements GetAccountingDocumentPort {
  constructor(
    private readonly repository: AccountingDocumentRepositoryPort,
    private readonly attachmentRepository: AccountingDocumentAttachmentRepositoryPort,
  ) {}

  async execute(command: GetAccountingDocumentCommand): Promise<AccountingDocumentDTO> {
    const document = await this.repository.findById(command.organizationId, command.id);
    if (!document) throw new AccountingDocumentNotFoundError(command.id);
    const attachments = await this.attachmentRepository.listByDocument(command.organizationId, command.id);
    return toAccountingDocumentDTO(document, attachments);
  }
}
