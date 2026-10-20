import { EmployeeDocumentNotFoundError } from "../../domain/errors.js";
import type { DocumentRepositoryPort as EmployeeDocumentRepositoryPort } from "../../domain/ports/out/document-repository.port.js";
import type { EmployeeFileStoragePort } from "../../domain/ports/out/employee-file-storage.port.js";
import type {
  GetEmployeeDocumentDownloadUrlCommand,
  GetEmployeeDocumentDownloadUrlPort,
} from "../../domain/ports/in/employee-document.ports.js";
import { DOCUMENT_SIGNED_URL_TTL_SECONDS } from "./employee-document-shared.js";

export class GetEmployeeDocumentDownloadUrlUseCase implements GetEmployeeDocumentDownloadUrlPort {
  constructor(
    private readonly employeeDocumentRepository: EmployeeDocumentRepositoryPort,
    private readonly hrFileStorage: EmployeeFileStoragePort,
  ) {}

  async execute(command: GetEmployeeDocumentDownloadUrlCommand): Promise<{ url: string }> {
    const doc = await this.employeeDocumentRepository.findById(command.organizationId, command.documentId);
    if (!doc || doc.ownerId !== command.employeeId) {
      throw new EmployeeDocumentNotFoundError(command.documentId);
    }
    const url = await this.hrFileStorage.getSignedUrl(doc.storagePath,
      DOCUMENT_SIGNED_URL_TTL_SECONDS,
      command.organizationId,
    );
    return { url };
  }
}
