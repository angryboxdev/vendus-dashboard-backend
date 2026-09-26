import { EmployeeNotFoundError } from "../../domain/errors.js";
import type { EmployeeRepositoryPort } from "../../domain/ports/out/employee-repository.port.js";
import type { EmployeeDocumentRepositoryPort } from "../../domain/ports/out/employee-document-repository.port.js";
import type { HrFileStoragePort } from "../../domain/ports/out/hr-file-storage.port.js";
import {
  computeDocumentDisplayStatus,
  computeMandatoryDocumentsSummary,
  DEFAULT_MANDATORY_CATEGORIES,
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
  ) {}

  async execute(command: GetEmployeeProfileCommand): Promise<EmployeeProfileDTO> {
    const employee = await this.employeeRepository.findById(command.organizationId, command.id);
    if (!employee) throw new EmployeeNotFoundError(command.id);

    const currentDocuments = await this.employeeDocumentRepository.findCurrentByEmployeeId(
      command.organizationId,
      employee.id,
    );
    const summary = computeMandatoryDocumentsSummary(DEFAULT_MANDATORY_CATEGORIES, currentDocuments);
    const sections = computeProfileSections(employee);
    const completionPercent = computeProfileCompletionPercent(employee);

    const photoUrl = employee.photoStoragePath
      ? await this.hrFileStorage.getSignedUrl(
          "photo",
          employee.photoStoragePath,
          PHOTO_SIGNED_URL_TTL_SECONDS,
          command.organizationId,
        )
      : null;

    const alerts: EmployeeProfileDTO["alerts"] = [];
    for (const doc of currentDocuments) {
      if (computeDocumentDisplayStatus(doc) === "expiring") {
        alerts.push({
          type: "document_expiring",
          message: `${doc.category} expira em breve`,
        });
      }
    }
    for (const category of summary.missingCategories) {
      alerts.push({ type: "document_missing", message: `Documento em falta: ${category}` });
    }
    if (!isEmergencyContactComplete(employee)) {
      alerts.push({ type: "emergency_contact_pending", message: "Contacto de emergência por confirmar" });
    }

    const onboardingStatus: EmployeeProfileDTO["onboardingStatus"] =
      summary.missingCategories.length > 0 || completionPercent < 100 ? "pending" : "completed";

    return {
      employee: toEmployeeDTO(employee, command.viewerRole, photoUrl),
      profileCompletionPercent: completionPercent,
      sections,
      documents: {
        mandatoryTotal: summary.mandatoryTotal,
        mandatoryCompleted: summary.mandatoryCompleted,
        missingCategories: summary.missingCategories,
        expiringSoonCount: summary.expiringSoonCount,
      },
      onboardingStatus,
      alerts,
    };
  }
}
