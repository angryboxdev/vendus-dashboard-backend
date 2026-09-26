import { randomUUID } from "crypto";
import { EmployeeNotFoundError, DocumentCategoryAlreadyExistsError } from "../../domain/errors.js";
import { EmployeeDocument } from "../../domain/entities/employee-document.js";
import type { EmployeeRepositoryPort } from "../../domain/ports/out/employee-repository.port.js";
import type { EmployeeDocumentRepositoryPort } from "../../domain/ports/out/employee-document-repository.port.js";
import type { HrFileStoragePort } from "../../domain/ports/out/hr-file-storage.port.js";
import type { HrAuditLogPort } from "../../domain/ports/out/hr-audit-log.port.js";
import type {
  UploadEmployeeDocumentCommand,
  UploadEmployeeDocumentPort,
  EmployeeDocumentDTO,
} from "../../domain/ports/in/employee-document.ports.js";
import { toEmployeeDocumentDTO } from "./shared.js";

export class UploadEmployeeDocumentUseCase implements UploadEmployeeDocumentPort {
  constructor(
    private readonly employeeRepository: EmployeeRepositoryPort,
    private readonly employeeDocumentRepository: EmployeeDocumentRepositoryPort,
    private readonly hrFileStorage: HrFileStoragePort,
    private readonly auditLog: HrAuditLogPort,
  ) {}

  async execute(command: UploadEmployeeDocumentCommand): Promise<EmployeeDocumentDTO> {
    const employee = await this.employeeRepository.findById(command.organizationId, command.employeeId);
    if (!employee) throw new EmployeeNotFoundError(command.employeeId);

    const current = await this.employeeDocumentRepository.findCurrentByEmployeeId(
      command.organizationId,
      command.employeeId,
    );
    if (current.some((d) => d.category === command.category)) {
      throw new DocumentCategoryAlreadyExistsError(command.category);
    }

    const storagePath = await this.hrFileStorage.store(
      "document",
      command.buffer,
      command.filename,
      command.mimeType,
      command.organizationId,
    );

    const document = EmployeeDocument.createFirstVersion({
      employeeId: command.employeeId,
      category: command.category,
      mandatory: command.mandatory,
      fileName: command.filename,
      storagePath,
      mimeType: command.mimeType,
      fileSizeBytes: command.buffer.byteLength,
      origin: command.origin,
      expiresAt: command.expiresAt,
      uploadedBy: command.actor,
    });

    const saved = await this.employeeDocumentRepository.create(command.organizationId, document).catch(async (e) => {
      await this.hrFileStorage.remove("document", storagePath, command.organizationId).catch(() => {});
      throw e;
    });

    await this.auditLog.record({
      organizationId: command.organizationId,
      actor: command.actor,
      entityType: "employee_document",
      entityId: saved.id,
      employeeId: command.employeeId,
      action: "document_created",
      description: `Documento "${saved.category}" enviado para ${employee.fullName}`,
      after: saved.toProps(),
      correlationId: randomUUID(),
    });

    return toEmployeeDocumentDTO(saved);
  }
}
