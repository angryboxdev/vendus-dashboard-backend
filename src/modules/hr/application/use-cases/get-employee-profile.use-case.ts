import { EmployeeNotFoundError } from "../../domain/errors.js";
import type { EmployeeRepositoryPort } from "../../domain/ports/out/employee-repository.port.js";
import type { EmployeeDocumentRepositoryPort } from "../../domain/ports/out/employee-document-repository.port.js";
import type { HrFileStoragePort } from "../../domain/ports/out/hr-file-storage.port.js";
import type { DocumentCategoryRepositoryPort } from "../../domain/ports/out/document-category-repository.port.js";
import {
  applicableCategoriesFor,
  buildDynamicRequirements,
  computeDocumentDisplayStatus,
  computeMandatoryDocumentsSummary,
  computeMissingOptional,
  DEFAULT_MANDATORY_REQUIREMENTS,
  DOCUMENT_CATEGORY_BASE_LABELS,
} from "../../domain/services/document-status.service.js";
import {
  computeProfileCompletionPercent,
  computeProfileSections,
  isEmergencyContactComplete,
} from "../../domain/services/profile-completeness.service.js";
import type {
  GetEmployeeProfileCommand,
  GetEmployeeProfilePort,
  EmployeeProfileDTO,
} from "../../domain/ports/in/employee.ports.js";
import { toEmployeeDTO, PHOTO_SIGNED_URL_TTL_SECONDS } from "./shared.js";

export class GetEmployeeProfileUseCase implements GetEmployeeProfilePort {
  constructor(
    private readonly employeeRepository: EmployeeRepositoryPort,
    private readonly employeeDocumentRepository: EmployeeDocumentRepositoryPort,
    private readonly hrFileStorage: HrFileStoragePort,
    private readonly documentCategoryRepository: DocumentCategoryRepositoryPort,
  ) {}

  async execute(command: GetEmployeeProfileCommand): Promise<EmployeeProfileDTO> {
    const employee = await this.employeeRepository.findById(command.organizationId, command.id);
    if (!employee) throw new EmployeeNotFoundError(command.id);

    const currentDocuments = await this.employeeDocumentRepository.findCurrentByEmployeeId(
      command.organizationId,
      employee.id,
    );
    const categoryDefs = await this.documentCategoryRepository.findMany(command.organizationId, { activeOnly: true });
    const applicable = applicableCategoriesFor(categoryDefs, employee.jobRole);
    const requirements = [...DEFAULT_MANDATORY_REQUIREMENTS, ...buildDynamicRequirements(applicable)];
    const categoryLabelBySlug = new Map<string, string>([
      ...Object.entries(DOCUMENT_CATEGORY_BASE_LABELS),
      ...applicable.map((c): [string, string] => [c.slug, c.label]),
    ]);

    // Documentos obrigatórios e completude de perfil só geram alerta/estado
    // pendente para colaboradores ativos — um colaborador inativo não tem
    // ações pendentes por definição (ver README, "Design decisions").
    const isActive = employee.status === "active";
    const rawSummary = computeMandatoryDocumentsSummary(requirements, currentDocuments);
    const summary = isActive
      ? rawSummary
      : { ...rawSummary, mandatoryCompleted: rawSummary.mandatoryTotal, missingRequirements: [], expiringSoonCount: 0 };
    const missingOptional = isActive ? computeMissingOptional(applicable, currentDocuments) : [];
    const sections = isActive
      ? computeProfileSections(employee)
      : { personalData: true, address: true, contractData: true, bankAccount: true, emergencyContact: true };
    const completionPercent = isActive ? computeProfileCompletionPercent(employee) : 100;

    const photoUrl = employee.photoStoragePath
      ? await this.hrFileStorage.getSignedUrl(
          "photo",
          employee.photoStoragePath,
          PHOTO_SIGNED_URL_TTL_SECONDS,
          command.organizationId,
        )
      : null;

    const alerts: EmployeeProfileDTO["alerts"] = [];
    if (isActive) {
      for (const doc of currentDocuments) {
        if (computeDocumentDisplayStatus(doc) === "expiring") {
          const label = categoryLabelBySlug.get(doc.category) ?? doc.category;
          alerts.push({ type: "document_expiring", message: `${label} expira em breve` });
        }
      }
      for (const label of summary.missingRequirements) {
        alerts.push({ type: "document_missing", message: `Documento em falta: ${label}` });
      }
      if (!isEmergencyContactComplete(employee)) {
        alerts.push({ type: "emergency_contact_pending", message: "Contacto de emergência por confirmar" });
      }
    }

    return {
      employee: toEmployeeDTO(employee, command.viewerRole, photoUrl),
      profileCompletionPercent: completionPercent,
      sections,
      documents: {
        mandatoryTotal: summary.mandatoryTotal,
        mandatoryCompleted: summary.mandatoryCompleted,
        missingRequirements: summary.missingRequirements,
        missingOptional,
        expiringSoonCount: summary.expiringSoonCount,
      },
      alerts,
    };
  }
}
