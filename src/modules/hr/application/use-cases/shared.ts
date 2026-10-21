import type { Employee } from "../../domain/entities/employee.js";
import type { EmployeeDTO } from "../../domain/ports/in/employee.ports.js";
import {
  maskSensitiveValue,
  shouldMaskSensitiveFields,
  type ViewerRole,
} from "../../domain/services/sensitive-field-masking.service.js";

/** Bucket de fotos é privado com TTL longo — evita reassinar em cada render de uma lista com várias linhas (decisão confirmada com o utilizador, ver plano). */
export const PHOTO_SIGNED_URL_TTL_SECONDS = 3600;
/** Bucket de documentos é privado com TTL curto — gerado só on-demand, mesma política do fluxo legacy. */
export const DOCUMENT_SIGNED_URL_TTL_SECONDS = 120;

export function toEmployeeDTO(employee: Employee, viewerRole: ViewerRole, photoUrl: string | null): EmployeeDTO {
  const mask = shouldMaskSensitiveFields(viewerRole);
  return {
    id: employee.id,
    fullName: employee.fullName,
    email: employee.email,
    phone: employee.phone,
    roleOrNotes: employee.roleOrNotes,
    employmentType: employee.employmentType,
    positionId: employee.positionId,
    primaryLocationId: employee.primaryLocationId,
    authorizedLocationIds: employee.authorizedLocationIds,
    status: employee.status,
    hiredAt: employee.hiredAt,
    endedAt: employee.endedAt,
    baseSalary: employee.baseSalary,
    salaryType: employee.salaryType,
    hourlyRate: employee.hourlyRate,
    nif: mask ? maskSensitiveValue(employee.nif) : employee.nif,
    iban: mask ? maskSensitiveValue(employee.iban) : employee.iban,
    address: employee.address,
    birthDate: employee.birthDate,
    socialSecurityNumber: mask ? maskSensitiveValue(employee.socialSecurityNumber) : employee.socialSecurityNumber,
    idCardNumber: mask ? maskSensitiveValue(employee.idCardNumber) : employee.idCardNumber,
    nationality: employee.nationality,
    emergencyContactName: employee.emergencyContactName,
    emergencyContactPhone: employee.emergencyContactPhone,
    photoUrl,
    createdAt: employee.createdAt,
    updatedAt: employee.updatedAt,
  };
}

