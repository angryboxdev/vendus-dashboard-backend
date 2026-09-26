import { randomUUID } from "crypto";
import { EmployeeNotFoundError, EmployeeDocumentNotFoundError } from "../../domain/errors.js";
import type { EmployeeRepositoryPort } from "../../domain/ports/out/employee-repository.port.js";
import type { EmployeeDocumentRepositoryPort } from "../../domain/ports/out/employee-document-repository.port.js";
import type { HrFileStoragePort } from "../../domain/ports/out/hr-file-storage.port.js";
import type { HrAuditLogPort } from "../../domain/ports/out/hr-audit-log.port.js";
import type {
  ReplaceEmployeeDocumentCommand,
  ReplaceEmployeeDocumentPort,
  EmployeeDocumentDTO,
} from "../../domain/ports/in/employee-document.ports.js";
import { toEmployeeDocumentDTO } from "./shared.js";

/**
 * "Substituir": nunca apaga a versão anterior — cria uma nova linha
 * (`supersede`) e marca a anterior `isCurrent=false` (`markSuperseded`). O
 * ficheiro antigo também nunca é removido do storage (RH-02: "substituir ...
 * não pode apagar a evidência anterior").
 */
export class ReplaceEmployeeDocumentUseCase implements ReplaceEmployeeDocumentPort {
  constructor(
    private readonly employeeRepository: EmployeeRepositoryPort,
    private readonly employeeDocumentRepository: EmployeeDocumentRepositoryPort,
    private readonly hrFileStorage: HrFileStoragePort,
    private readonly auditLog: HrAuditLogPort,
  ) {}

  async execute(command: ReplaceEmployeeDocumentCommand): Promise<EmployeeDocumentDTO> {
    const employee = await this.employeeRepository.findById(command.organizationId, command.employeeId);
    if (!employee) throw new EmployeeNotFoundError(command.employeeId);

    const previous = await this.employeeDocumentRepository.findById(command.organizationId, command.documentId);
    if (!previous || previous.employeeId !== command.employeeId) {
      throw new EmployeeDocumentNotFoundError(command.documentId);
    }

    const storagePath = await this.hrFileStorage.store(
      "document",
      command.buffer,
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
      await this.hrFileStorage.remove("document", storagePath, command.organizationId).catch(() => {});
      throw e;
    });
    await this.employeeDocumentRepository.update(command.organizationId, previous.markSuperseded());

    await this.auditLog.record({
      organizationId: command.organizationId,
      actor: command.actor,
      entityType: "employee_document",
      entityId: saved.id,
      employeeId: command.employeeId,
      action: "document_replaced",
      description: `Documento "${saved.category}" substituído (v${previous.version} → v${saved.version}) para ${employee.fullName}`,
      before: previous.toProps(),
      after: saved.toProps(),
      correlationId: randomUUID(),
    });

    return toEmployeeDocumentDTO(saved);
  }
}
