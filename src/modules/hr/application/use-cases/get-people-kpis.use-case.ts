import type { OrganizationId } from "../../../../kernel/organization-id.js";
import type { EmployeeRepositoryPort } from "../../domain/ports/out/employee-repository.port.js";
import type { EmployeeDocumentRepositoryPort } from "../../domain/ports/out/employee-document-repository.port.js";
import {
  computeMandatoryDocumentsSummary,
  DEFAULT_MANDATORY_CATEGORIES,
} from "../../domain/services/document-status.service.js";
import {
  computeProfileCompletionPercent,
  computeProfileSections,
} from "../../domain/services/profile-completeness.service.js";
import type { GetPeopleKpisPort, PeopleKpisDTO, PriorityPendencyDTO } from "../../domain/ports/in/employee.ports.js";

const PROFILE_COMPLETE_THRESHOLD = 100;
const RECENTLY_HIRED_DAYS = 30;

export class GetPeopleKpisUseCase implements GetPeopleKpisPort {
  constructor(
    private readonly employeeRepository: EmployeeRepositoryPort,
    private readonly employeeDocumentRepository: EmployeeDocumentRepositoryPort,
  ) {}

  async execute(organizationId: OrganizationId): Promise<PeopleKpisDTO> {
    const employees = await this.employeeRepository.findMany(organizationId, { status: "active" });
    const documents = await this.employeeDocumentRepository.findCurrentByEmployeeIds(
      organizationId,
      employees.map((e) => e.id),
    );
    const documentsByEmployee = new Map<string, typeof documents>();
    for (const doc of documents) {
      const list = documentsByEmployee.get(doc.employeeId) ?? [];
      list.push(doc);
      documentsByEmployee.set(doc.employeeId, list);
    }

    const now = new Date();
    let onboardingPending = 0;
    let incompleteProfiles = 0;
    let documentsExpiringSoon = 0;
    const priorityPendencies: PriorityPendencyDTO[] = [];

    for (const employee of employees) {
      const summary = computeMandatoryDocumentsSummary(
        DEFAULT_MANDATORY_CATEGORIES,
        documentsByEmployee.get(employee.id) ?? [],
        now,
      );
      const completionPercent = computeProfileCompletionPercent(employee);
      documentsExpiringSoon += summary.expiringSoonCount;

      if (completionPercent < PROFILE_COMPLETE_THRESHOLD) {
        incompleteProfiles++;
        priorityPendencies.push({
          kind: "missing_field",
          employeeId: employee.id,
          employeeName: employee.fullName,
          detail: "Dados pessoais incompletos",
        });
      }

      const hiredRecently =
        employee.hiredAt != null &&
        (now.getTime() - new Date(employee.hiredAt).getTime()) / (1000 * 60 * 60 * 24) <= RECENTLY_HIRED_DAYS;
      if (hiredRecently && (summary.missingCategories.length > 0 || completionPercent < PROFILE_COMPLETE_THRESHOLD)) {
        onboardingPending++;
      }

      for (const category of summary.missingCategories) {
        priorityPendencies.push({
          kind: "missing_document",
          employeeId: employee.id,
          employeeName: employee.fullName,
          detail: `Documento em falta: ${category}`,
        });
      }

      if (!computeProfileSections(employee).emergencyContact) {
        priorityPendencies.push({
          kind: "missing_field",
          employeeId: employee.id,
          employeeName: employee.fullName,
          detail: "Contacto de emergência por confirmar",
        });
      }
    }

    return {
      activeEmployees: employees.length,
      onboardingPending,
      incompleteProfiles,
      documentsExpiringSoon,
      priorityPendencies,
    };
  }
}
