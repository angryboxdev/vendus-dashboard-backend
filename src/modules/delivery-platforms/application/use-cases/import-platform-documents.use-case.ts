import type { ImportPlatformDocumentsPort, ImportedPlatformDocument, RejectedPlatformDocument } from "../../domain/ports/in/import-platform-documents.port.js";
import type { DocumentTextPort } from "../../domain/ports/out/document-text.port.js";
import type { PlatformStatementRepositoryPort } from "../../domain/ports/out/platform-statement-repository.port.js";
import type { OrganizationId } from "../../../../kernel/organization-id.js";
import { InvalidPlatformDocumentError, UnsupportedPlatformDocumentError } from "../../domain/errors.js";
import { readPlatformDocument } from "../../domain/services/platform-document-reader.js";

export class ImportPlatformDocumentsUseCase implements ImportPlatformDocumentsPort {
  constructor(
    private readonly documentText: DocumentTextPort,
    private readonly statements: PlatformStatementRepositoryPort,
  ) {}

  async execute({
    organizationId,
    files,
    importedBy,
  }: {
    organizationId: OrganizationId;
    files: { name: string; content: Uint8Array }[];
    importedBy: string | null;
  }): Promise<{ imported: ImportedPlatformDocument[]; rejected: RejectedPlatformDocument[] }> {
    const imported: ImportedPlatformDocument[] = [];
    const rejected: RejectedPlatformDocument[] = [];
    for (const file of files) {
      try {
        const statement = readPlatformDocument(file.name, await this.documentText.extract(file.name, file.content));
        const { replaced } = await this.statements.save(organizationId, statement, { fileName: file.name, importedBy });
        imported.push({
          fileName: file.name,
          platform: statement.platform,
          documentNumber: statement.documentNumber,
          periodFrom: statement.periodFrom,
          periodTo: statement.periodTo,
          netPayoutCents: statement.netPayoutCents,
          replaced,
        });
      } catch (e) {
        if (e instanceof UnsupportedPlatformDocumentError) rejected.push({ fileName: file.name, reason: "Documento não reconhecido" });
        else if (e instanceof InvalidPlatformDocumentError) rejected.push({ fileName: file.name, reason: e.reason });
        else throw e;
      }
    }
    return { imported, rejected };
  }
}
