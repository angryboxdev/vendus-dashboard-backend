import { EmployeeDocumentNotFoundError } from "../../domain/errors.js";
import type { EmployeeDocumentRepositoryPort } from "../../domain/ports/out/employee-document-repository.port.js";
import type { HrFileStoragePort } from "../../domain/ports/out/hr-file-storage.port.js";
import type {
  GetEmployeeDocumentDownloadUrlCommand,
  GetEmployeeDocumentDownloadUrlPort,
} from "../../domain/ports/in/employee-document.ports.js";
import { DOCUMENT_SIGNED_URL_TTL_SECONDS } from "./shared.js";

export class GetEmployeeDocumentDownloadUrlUseCase implements GetEmployeeDocumentDownloadUrlPort {
  constructor(
    private readonly employeeDocumentRepository: EmployeeDocumentRepositoryPort,
    private readonly hrFileStorage: HrFileStoragePort,
  ) {}

  async execute(command: GetEmployeeDocumentDownloadUrlCommand): Promise<{ url: string }> {
    const doc = await this.employeeDocumentRepository.findById(command.organizationId, command.documentId);
    if (!doc || doc.employeeId !== command.employeeId) {
      throw new EmployeeDocumentNotFoundError(command.documentId);
    }
    const url = await this.hrFileStorage.getSignedUrl(
      "document",
      doc.storagePath,
      DOCUMENT_SIGNED_URL_TTL_SECONDS,
      command.organizationId,
    );
    return { url };
  }
}
