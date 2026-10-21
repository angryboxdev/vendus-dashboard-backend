import { EmployeeNotFoundError } from "../../domain/errors.js";
import type { EmployeeDocumentSummaryDTO, GetEmployeeDocumentSummaryPort } from "../../domain/ports/in/employee-document.ports.js";
import type { DocumentCategoryRepositoryPort } from "../../domain/ports/out/document-category-repository.port.js";
import type { DocumentRepositoryPort } from "../../domain/ports/out/document-repository.port.js";
import type { EmployeeDirectoryPort } from "../../domain/ports/out/employee-directory.port.js";
import type { OrganizationId } from "../../../../kernel/organization-id.js";
import {
  applicableCategoriesFor,
  buildDynamicRequirements,
  computeDocumentDisplayStatus,
  computeMandatoryDocumentsSummary,
  computeMissingOptional,
  DEFAULT_MANDATORY_REQUIREMENTS,
  DOCUMENT_CATEGORY_BASE_LABELS,
} from "../../domain/services/document-status.service.js";

/**
 * Resumo documental da ficha (ADR-0040, fase 1): obrigatórios completos, em
 * falta, a expirar e alertas — igual ao que o perfil do RH antigo devolvia.
 * Um colaborador inativo não tem pendências.
 */
export class GetEmployeeDocumentSummaryUseCase implements GetEmployeeDocumentSummaryPort {
  constructor(
    private readonly employees: EmployeeDirectoryPort,
    private readonly documents: DocumentRepositoryPort,
    private readonly categories: DocumentCategoryRepositoryPort,
  ) {}

  async execute(command: { organizationId: OrganizationId; employeeId: string }): Promise<EmployeeDocumentSummaryDTO> {
    const org = command.organizationId;
    const employee = await this.employees.findById(org, command.employeeId);
    if (!employee) throw new EmployeeNotFoundError(command.employeeId);
    const [current, defs] = await Promise.all([
      this.documents.findCurrentByOwners(org, "employee", [employee.id]),
      this.categories.findMany(org, { activeOnly: true }),
    ]);
    const applicable = applicableCategoriesFor(defs, employee);
    const summary = computeMandatoryDocumentsSummary([...DEFAULT_MANDATORY_REQUIREMENTS, ...buildDynamicRequirements(applicable)], current);
    const base = { employeeId: employee.id, positionId: employee.positionId, mandatoryTotal: summary.mandatoryTotal };
    if (employee.status !== "active") {
      return { ...base, mandatoryCompleted: summary.mandatoryTotal, missingRequirements: [], missingOptional: [], expiringSoonCount: 0, alerts: [] };
    }
    const labels = new Map<string, string>([...Object.entries(DOCUMENT_CATEGORY_BASE_LABELS), ...applicable.map((c): [string, string] => [c.slug, c.label])]);
    const alerts: EmployeeDocumentSummaryDTO["alerts"] = [
      ...current
        .filter((d) => computeDocumentDisplayStatus(d) === "expiring")
        .map((d) => ({ type: "document_expiring" as const, message: `${labels.get(d.category) ?? d.category} expira em breve` })),
      ...summary.missingRequirements.map((label) => ({ type: "document_missing" as const, message: `Documento em falta: ${label}` })),
    ];
    return {
      ...base,
      mandatoryCompleted: summary.mandatoryCompleted,
      missingRequirements: summary.missingRequirements,
      missingOptional: computeMissingOptional(applicable, current),
      expiringSoonCount: summary.expiringSoonCount,
      alerts,
    };
  }
}
