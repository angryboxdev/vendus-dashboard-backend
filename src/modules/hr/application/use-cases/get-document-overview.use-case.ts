import type { EmployeeRepositoryPort } from "../../domain/ports/out/employee-repository.port.js";
import type { EmployeeDocumentRepositoryPort } from "../../domain/ports/out/employee-document-repository.port.js";
import type { DocumentCategoryRepositoryPort } from "../../domain/ports/out/document-category-repository.port.js";
import { applicableCategoriesFor, computeDocumentRequirementRows } from "../../domain/services/document-status.service.js";
import type {
  DocumentOverviewRowDTO,
  GetDocumentOverviewCommand,
  GetDocumentOverviewPort,
} from "../../domain/ports/in/employee-document.ports.js";

/**
 * Visão agregada de todos os documentos de todos os colaboradores ativos —
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
    const documents = await this.employeeDocumentRepository.findCurrentByEmployeeIds(
      command.organizationId,
      employees.map((e) => e.id),
    );
    const documentsByEmployee = new Map<string, typeof documents>();
    for (const doc of documents) {
      const list = documentsByEmployee.get(doc.employeeId) ?? [];
      list.push(doc);
      documentsByEmployee.set(doc.employeeId, list);
    }

    const categoryDefs = await this.documentCategoryRepository.findMany(command.organizationId, { activeOnly: true });

    const rows: DocumentOverviewRowDTO[] = [];
    for (const employee of employees) {
      const applicable = applicableCategoriesFor(categoryDefs, employee.jobRole);
      const requirementRows = computeDocumentRequirementRows(applicable, documentsByEmployee.get(employee.id) ?? []);
      for (const r of requirementRows) {
        rows.push({ employeeId: employee.id, employeeName: employee.fullName, ...r });
      }
    }
    return rows;
  }
}
