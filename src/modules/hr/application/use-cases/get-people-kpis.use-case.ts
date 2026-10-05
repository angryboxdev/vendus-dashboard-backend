import type { OrganizationId } from "../../../../kernel/organization-id.js";
import type { EmployeeRepositoryPort } from "../../domain/ports/out/employee-repository.port.js";
import type { DocumentRepositoryPort as EmployeeDocumentRepositoryPort } from "../../../documents/domain/ports/out/document-repository.port.js";
import type { DocumentCategoryRepositoryPort } from "../../../documents/domain/ports/out/document-category-repository.port.js";
import {
  applicableCategoriesFor,
  buildDynamicRequirements,
  computeDocumentDisplayStatus,
  computeMandatoryDocumentsSummary,
  DEFAULT_MANDATORY_REQUIREMENTS,
  DOCUMENT_CATEGORY_BASE_LABELS,
} from "../../domain/services/document-status.service.js";
import {
  computeProfileCompletionPercent,
  computeProfileSections,
} from "../../domain/services/profile-completeness.service.js";
import type {
  GetPeopleKpisPort,
  PeopleKpisDTO,
  PriorityPendencyGroupDTO,
} from "../../domain/ports/in/employee.ports.js";

const PROFILE_COMPLETE_THRESHOLD = 100;

interface Candidate {
  kind: PriorityPendencyGroupDTO["kind"];
  detail: string;
  employeeId: string;
  employeeName: string;
  expiresAt?: string;
}

function categoryLabel(category: string, labelBySlug: ReadonlyMap<string, string>): string {
  return labelBySlug.get(category) ?? DOCUMENT_CATEGORY_BASE_LABELS[category] ?? category;
}

/** Agrupa candidatos por `kind`+`detail`, preservando a primeira ordem de aparição. */
function groupPendencies(candidates: Candidate[]): PriorityPendencyGroupDTO[] {
  const groups = new Map<string, PriorityPendencyGroupDTO>();
  for (const c of candidates) {
    const key = `${c.kind}:${c.detail}`;
    const group = groups.get(key);
    const ref = { employeeId: c.employeeId, employeeName: c.employeeName, ...(c.expiresAt && { expiresAt: c.expiresAt }) };
    if (group) {
      group.employees.push(ref);
    } else {
      groups.set(key, { kind: c.kind, detail: c.detail, employees: [ref] });
    }
  }
  return [...groups.values()].sort((a, b) => b.employees.length - a.employees.length);
}

export class GetPeopleKpisUseCase implements GetPeopleKpisPort {
  constructor(
    private readonly employeeRepository: EmployeeRepositoryPort,
    private readonly employeeDocumentRepository: EmployeeDocumentRepositoryPort,
    private readonly documentCategoryRepository: DocumentCategoryRepositoryPort,
  ) {}

  async execute(organizationId: OrganizationId): Promise<PeopleKpisDTO> {
    const employees = await this.employeeRepository.findMany(organizationId, { status: "active" });
    const documents = await this.employeeDocumentRepository.findCurrentByOwners(organizationId, "employee", employees.map((e) => e.id),
    );
    const documentsByEmployee = new Map<string, typeof documents>();
    for (const doc of documents) {
      const list = documentsByEmployee.get(doc.ownerId) ?? [];
      list.push(doc);
      documentsByEmployee.set(doc.ownerId, list);
    }

    const categoryDefs = await this.documentCategoryRepository.findMany(organizationId, { activeOnly: true });
    const labelBySlug = new Map(categoryDefs.map((c): [string, string] => [c.slug, c.label]));

    const now = new Date();
    let incompleteProfiles = 0;
    let documentsExpiringSoon = 0;
    const candidates: Candidate[] = [];

    for (const employee of employees) {
      const employeeDocuments = documentsByEmployee.get(employee.id) ?? [];
      const applicable = applicableCategoriesFor(categoryDefs, employee.jobRole);
      const requirements = [...DEFAULT_MANDATORY_REQUIREMENTS, ...buildDynamicRequirements(applicable)];
      const summary = computeMandatoryDocumentsSummary(requirements, employeeDocuments, now);
      const completionPercent = computeProfileCompletionPercent(employee);
      documentsExpiringSoon += summary.expiringSoonCount;

      if (completionPercent < PROFILE_COMPLETE_THRESHOLD) {
        incompleteProfiles++;
        candidates.push({
          kind: "missing_field",
          employeeId: employee.id,
          employeeName: employee.fullName,
          detail: "Dados pessoais incompletos",
        });
      }

      for (const label of summary.missingRequirements) {
        candidates.push({
          kind: "missing_document",
          employeeId: employee.id,
          employeeName: employee.fullName,
          detail: `${label} em falta`,
        });
      }

      for (const doc of employeeDocuments) {
        if (computeDocumentDisplayStatus(doc, now) === "expiring") {
          candidates.push({
            kind: "expiring_document",
            employeeId: employee.id,
            employeeName: employee.fullName,
            detail: `${categoryLabel(doc.category, labelBySlug)} a expirar`,
            ...(doc.expiresAt && { expiresAt: doc.expiresAt }),
          });
        }
      }

      if (!computeProfileSections(employee).emergencyContact) {
        candidates.push({
          kind: "missing_field",
          employeeId: employee.id,
          employeeName: employee.fullName,
          detail: "Contacto de emergência por confirmar",
        });
      }
    }

    return {
      activeEmployees: employees.length,
      incompleteProfiles,
      documentsExpiringSoon,
      priorityPendencies: groupPendencies(candidates),
    };
  }
}
