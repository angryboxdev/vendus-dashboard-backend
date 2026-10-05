import { randomUUID } from "crypto";
import {
  EmployeeNotFoundError,
  DocumentCategoryAlreadyExistsError,
  DocumentPeriodAlreadyExistsError,
  InvalidDocumentError,
} from "../../domain/errors.js";
import { Document as EmployeeDocument, isValidDocumentPeriod } from "../../../documents/domain/entities/document.js";
import type { DocumentCategoryRepositoryPort } from "../../../documents/domain/ports/out/document-category-repository.port.js";
import type { EmployeeRepositoryPort } from "../../domain/ports/out/employee-repository.port.js";
import type { DocumentRepositoryPort as EmployeeDocumentRepositoryPort } from "../../../documents/domain/ports/out/document-repository.port.js";
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
    private readonly documentCategoryRepository: DocumentCategoryRepositoryPort,
  ) {}

  async execute(command: UploadEmployeeDocumentCommand): Promise<EmployeeDocumentDTO> {
    const employee = await this.employeeRepository.findById(command.organizationId, command.employeeId);
    if (!employee) throw new EmployeeNotFoundError(command.employeeId);

    // Categorias periódicas (ex: Recibo de vencimento, ticket 10): um documento
    // atual por período — as restantes, um por categoria.
    const definition = await this.documentCategoryRepository.findBySlug(command.organizationId, command.category);
    const requiresPeriod = definition?.requiresPeriod ?? false;
    const period = command.period ?? null;
    if (requiresPeriod && (period === null || !isValidDocumentPeriod(period))) {
      throw new InvalidDocumentError("Período (Mês/Ano) é obrigatório para esta categoria");
    }
    if (!requiresPeriod && period !== null) {
      throw new InvalidDocumentError("Esta categoria não tem período");
    }

    const current = await this.employeeDocumentRepository.findCurrentByOwners(command.organizationId, "employee", [command.employeeId]);
    const sameCategory = current.filter((d) => d.category === command.category);
    if (requiresPeriod) {
      const duplicate = sameCategory.find((d) => d.period === period);
      if (duplicate) throw new DocumentPeriodAlreadyExistsError(command.category, period as string, duplicate.id);
    } else if (sameCategory.length > 0) {
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
      owner: { type: "employee", id: command.employeeId },
      category: command.category,
      // Um documento periódico nunca é requisito obrigatório (task §26).
      mandatory: requiresPeriod ? false : command.mandatory,
      fileName: command.filename,
      storagePath,
      mimeType: command.mimeType,
      fileSizeBytes: command.buffer.byteLength,
      origin: command.origin,
      expiresAt: command.expiresAt,
      period,
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
      description: `Documento "${saved.category}"${period ? ` (${period})` : ""} enviado para ${employee.fullName}${command.importBatchId ? " — importação de recibos" : ""}`,
      after: saved.toProps(),
      correlationId: command.importBatchId ?? randomUUID(),
    });

    return toEmployeeDocumentDTO(saved);
  }
}
