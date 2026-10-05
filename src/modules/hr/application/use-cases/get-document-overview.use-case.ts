import type { EmployeeRepositoryPort } from "../../domain/ports/out/employee-repository.port.js";
import type { DocumentRepositoryPort as EmployeeDocumentRepositoryPort } from "../../../documents/domain/ports/out/document-repository.port.js";
import type { DocumentCategoryRepositoryPort } from "../../../documents/domain/ports/out/document-category-repository.port.js";
import { applicableCategoriesFor, computeDocumentRequirementRows, computePeriodicDocumentRows } from "../../domain/services/document-status.service.js";
import type {
  DocumentOverviewRowDTO,
  GetDocumentOverviewCommand,
  GetDocumentOverviewPort,
} from "../../domain/ports/in/employee-document.ports.js";

/**
 * Visão agregada dos documentos de todos os colaboradores ativos: todos os
 * requisitos obrigatórios (com ou sem documento) e os opcionais que já têm
 * documento —
 * fonte única da aba "Pessoas > Documentos" (task "Melhorar Visão Geral e
 * reorganizar Pessoas"). Reaproveita `computeDocumentRequirementRows`
 * (mesma função pura já usada, de forma mais restrita, pelos KPIs/perfil)
 * — nunca reimplementa a lógica de estado documental.
 */
export class GetDocumentOverviewUseCase implements GetDocumentOverviewPort {
  constructor(
    private readonly employeeRepository: EmployeeRepositoryPort,
    private readonly employeeDocumentRepository: EmployeeDocumentRepositoryPort,
    private readonly documentCategoryRepository: DocumentCategoryRepositoryPort,
  ) {}

  async execute(command: GetDocumentOverviewCommand): Promise<DocumentOverviewRowDTO[]> {
    const employees = await this.employeeRepository.findMany(command.organizationId, { status: "active" });
    const documents = await this.employeeDocumentRepository.findCurrentByOwners(command.organizationId, "employee", employees.map((e) => e.id),
    );
    const documentsByEmployee = new Map<string, typeof documents>();
    for (const doc of documents) {
      const list = documentsByEmployee.get(doc.ownerId) ?? [];
      list.push(doc);
      documentsByEmployee.set(doc.ownerId, list);
    }

    const categoryDefs = await this.documentCategoryRepository.findMany(command.organizationId, { activeOnly: true });

    const rows: DocumentOverviewRowDTO[] = [];
    for (const employee of employees) {
      const applicable = applicableCategoriesFor(categoryDefs, employee);
      const requirementRows = computeDocumentRequirementRows(applicable, documentsByEmployee.get(employee.id) ?? []);
      for (const r of requirementRows) {
        // Ticket 09: uma categoria opcional sem documento não é pendência — não
        // aparece como "Em falta" (evita KPIs falsos). Com documento aparece,
        // para se acompanhar a validade.
        if (!r.mandatory && r.documentId === null) continue;
        rows.push({ employeeId: employee.id, employeeName: employee.fullName, ...r });
      }
      // Ticket 10: recibos (e outras categorias periódicas) — uma linha por período.
      for (const r of computePeriodicDocumentRows(categoryDefs, documentsByEmployee.get(employee.id) ?? [])) {
        rows.push({ employeeId: employee.id, employeeName: employee.fullName, ...r });
      }
    }
    return rows;
  }
}
