import { EmployeeNotFoundError, EmployeeDocumentNotFoundError } from "../../domain/errors.js";
import type { EmployeeDirectoryPort } from "../../domain/ports/out/employee-directory.port.js";
import type { DocumentRepositoryPort as EmployeeDocumentRepositoryPort } from "../../domain/ports/out/document-repository.port.js";
import type { EmployeeFileStoragePort } from "../../domain/ports/out/employee-file-storage.port.js";
import type { DocumentAuditLogPort } from "../../domain/ports/out/document-audit-log.port.js";
import type {
  ReplaceEmployeeDocumentCommand,
  ReplaceEmployeeDocumentPort,
  EmployeeDocumentDTO,
} from "../../domain/ports/in/employee-document.ports.js";
import { toEmployeeDocumentDTO } from "./employee-document-shared.js";

/**
 * "Substituir": nunca apaga a versão anterior — cria uma nova linha
 * (`supersede`) e marca a anterior `isCurrent=false` (`markSuperseded`). O
 * ficheiro antigo também nunca é removido do storage (RH-02: "substituir ...
 * não pode apagar a evidência anterior").
 */
export class ReplaceEmployeeDocumentUseCase implements ReplaceEmployeeDocumentPort {
  constructor(
    private readonly employeeRepository: EmployeeDirectoryPort,
    private readonly employeeDocumentRepository: EmployeeDocumentRepositoryPort,
    private readonly hrFileStorage: EmployeeFileStoragePort,
    private readonly auditLog: DocumentAuditLogPort,
  ) {}

  async execute(command: ReplaceEmployeeDocumentCommand): Promise<EmployeeDocumentDTO> {
    const employee = await this.employeeRepository.findById(command.organizationId, command.employeeId);
    if (!employee) throw new EmployeeNotFoundError(command.employeeId);

    const previous = await this.employeeDocumentRepository.findById(command.organizationId, command.documentId);
    if (!previous || previous.ownerId !== command.employeeId) {
      throw new EmployeeDocumentNotFoundError(command.documentId);
    }

    const storagePath = await this.hrFileStorage.store(command.buffer,
      command.filename,
      command.mimeType,
      command.organizationId,
    );

    const nextVersion = previous.supersede({
      fileName: command.filename,
      storagePath,
      mimeType: command.mimeType,
      fileSizeBytes: command.buffer.byteLength,
      expiresAt: command.expiresAt !== undefined ? command.expiresAt : previous.expiresAt,
      uploadedBy: command.actor,
    });

    const saved = await this.employeeDocumentRepository.create(command.organizationId, nextVersion).catch(async (e) => {
      await this.hrFileStorage.remove(storagePath, command.organizationId).catch(() => {});
      throw e;
    });
    await this.employeeDocumentRepository.update(command.organizationId, previous.markSuperseded());

    await this.auditLog.record({
      organizationId: command.organizationId,
      actor: command.actor,
      entityType: "employee_document",
      entityId: saved.id,
      action: "document_replaced",
      reason: `Documento "${saved.category}"${saved.period ? ` (${saved.period})` : ""} substituído (v${previous.version} → v${saved.version}) para ${employee.fullName}${command.importBatchId ? ` — importação de recibos (lote ${command.importBatchId})` : ""}`,
      before: previous.toProps(),
      after: saved.toProps(),
    });

    return toEmployeeDocumentDTO(saved);
  }
}
