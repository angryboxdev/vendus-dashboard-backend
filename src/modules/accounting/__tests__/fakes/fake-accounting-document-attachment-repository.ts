import type { OrganizationId } from "../../../../kernel/organization-id.js";
import type {
  AccountingDocumentAttachmentDTO,
  AccountingDocumentAttachmentRepositoryPort,
  AddAccountingDocumentAttachmentData,
} from "../../domain/ports/out/accounting-document-attachment-repository.port.js";

export class FakeAccountingDocumentAttachmentRepository implements AccountingDocumentAttachmentRepositoryPort {
  rows: AccountingDocumentAttachmentDTO[] = [];

  async add(
    _organizationId: OrganizationId,
    data: AddAccountingDocumentAttachmentData,
  ): Promise<AccountingDocumentAttachmentDTO> {
    const version = this.rows.filter((r) => r.documentId === data.documentId).length + 1;
    const dto: AccountingDocumentAttachmentDTO = {
      id: `att-${this.rows.length + 1}`,
      documentId: data.documentId,
      storagePath: data.storagePath,
      fileType: data.fileType,
      fileHash: data.fileHash,
      version,
      uploadedBy: data.uploadedBy,
      uploadedAt: new Date().toISOString(),
    };
    this.rows.push(dto);
    return dto;
  }

  async listByDocument(_organizationId: OrganizationId, documentId: string): Promise<AccountingDocumentAttachmentDTO[]> {
    return this.rows.filter((r) => r.documentId === documentId).sort((a, b) => b.version - a.version);
  }
}
