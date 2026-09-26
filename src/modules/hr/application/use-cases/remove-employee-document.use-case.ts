import { randomUUID } from "crypto";
import { EmployeeDocumentNotFoundError } from "../../domain/errors.js";
import type { EmployeeDocumentRepositoryPort } from "../../domain/ports/out/employee-document-repository.port.js";
import type { HrAuditLogPort } from "../../domain/ports/out/hr-audit-log.port.js";
import type {
  RemoveEmployeeDocumentCommand,
  RemoveEmployeeDocumentPort,
} from "../../domain/ports/in/employee-document.ports.js";

/** Remoção lógica — nunca apaga o ficheiro nem a linha (RH-02: nunca apagar evidência). */
export class RemoveEmployeeDocumentUseCase implements RemoveEmployeeDocumentPort {
  constructor(
    private readonly employeeDocumentRepository: EmployeeDocumentRepositoryPort,
    private readonly auditLog: HrAuditLogPort,
  ) {}

  async execute(command: RemoveEmployeeDocumentCommand): Promise<void> {
    const existing = await this.employeeDocumentRepository.findById(command.organizationId, command.documentId);
    if (!existing || existing.employeeId !== command.employeeId) {
      throw new EmployeeDocumentNotFoundError(command.documentId);
    }

    const removed = existing.remove();
    await this.employeeDocumentRepository.update(command.organizationId, removed);

    await this.auditLog.record({
      organizationId: command.organizationId,
      actor: command.actor,
      entityType: "employee_document",
      entityId: existing.id,
      employeeId: command.employeeId,
      action: "document_removed",
      description: `Documento "${existing.category}" removido (versão mantida para auditoria)`,
      before: existing.toProps(),
      after: removed.toProps(),
      correlationId: randomUUID(),
    });
  }
}
