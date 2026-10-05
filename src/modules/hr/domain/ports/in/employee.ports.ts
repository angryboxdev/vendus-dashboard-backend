import type { OrganizationId } from "../../../../../kernel/organization-id.js";
import type { EmploymentType, EmployeeStatus, JobRole, SalaryType } from "../../entities/employee.js";
import type { ViewerRole } from "../../services/sensitive-field-masking.service.js";
import type { HrAuditEntityType } from "../out/hr-audit-log.port.js";

export interface EmployeeDTO {
  id: string;
  fullName: string;
  email: string | null;
  phone: string | null;
  roleOrNotes: string | null;
  employmentType: EmploymentType;
  /** Categoria operacional (antiga "Função") — sempre a do cargo; mantida para Escalas/documentos (D4). */
  jobRole: JobRole;
  /** Cargo (ticket 07). O nome resolve-se pela lista de cargos (`GET /hr/positions`). */
  positionId: string | null;
  /** Local principal (ticket 08). */
  primaryLocationId: string | null;
  /** Outros locais autorizados (ticket 08). */
  authorizedLocationIds: string[];
  status: EmployeeStatus;
  hiredAt: string | null;
  endedAt: string | null;
  baseSalary: number | null;
  salaryType: SalaryType;
  hourlyRate: number | null;
  nif: string | null;
  iban: string | null;
  address: string | null;
  birthDate: string | null;
  socialSecurityNumber: string | null;
  idCardNumber: string | null;
  nationality: string | null;
  emergencyContactName: string | null;
  emergencyContactPhone: string | null;
  photoUrl: string | null;
  createdAt: string;
  updatedAt: string;
}

// ── Listar ────────────────────────────────────────────────────────────────

export type DocumentSituation = "ok" | "expiring" | "missing";

export interface ListEmployeesCommand {
  organizationId: OrganizationId;
  viewerRole: ViewerRole;
  search?: string;
  status?: "active" | "inactive" | "all";
  employmentType?: EmploymentType;
  documentSituation?: DocumentSituation;
  profileComplete?: "complete" | "incomplete";
  /** Cargo (ticket 07). */
  positionId?: string;
  /** Local principal ou autorizado (ticket 08). */
  locationId?: string;
  page: number;
  pageSize: number;
}

export interface EmployeeListRowDTO {
  id: string;
  fullName: string;
  jobRole: JobRole;
  positionId: string | null;
  primaryLocationId: string | null;
  employmentType: EmploymentType;
  email: string | null;
  phone: string | null;
  status: EmployeeStatus;
  photoUrl: string | null;
  profileCompletionPercent: number;
  documentSituation: DocumentSituation;
  updatedAt: string;
}

export interface ListEmployeesResultDTO {
  items: EmployeeListRowDTO[];
  total: number;
  page: number;
  pageSize: number;
}

export interface ListEmployeesPort {
  execute(command: ListEmployeesCommand): Promise<ListEmployeesResultDTO>;
}

// ── KPIs ──────────────────────────────────────────────────────────────────

export interface PriorityPendencyEmployeeRef {
  employeeId: string;
  employeeName: string;
  /** Só preenchido para `kind: "expiring_document"` — permite ao drawer da Visão Geral mostrar a validade/dias restantes sem uma 2ª chamada (task "Melhorar Visão Geral e reorganizar Pessoas", secção 10). */
  expiresAt?: string;
}

/**
 * Uma pendência agrupada por tipo (mesmo `kind`+`detail`) — várias linhas de
 * `hr_employees` com o mesmo problema (ex: "NIF em falta") viram um único
 * grupo com a lista de colaboradores afetados, em vez de uma linha por
 * pessoa. O agrupamento é feito aqui (backend), não no frontend.
 */
export interface PriorityPendencyGroupDTO {
  kind: "missing_field" | "missing_document" | "expiring_document";
  detail: string;
  employees: PriorityPendencyEmployeeRef[];
}

export interface PeopleKpisDTO {
  activeEmployees: number;
  incompleteProfiles: number;
  documentsExpiringSoon: number;
  priorityPendencies: PriorityPendencyGroupDTO[];
}

export interface GetPeopleKpisPort {
  execute(organizationId: OrganizationId): Promise<PeopleKpisDTO>;
}

// ── Perfil 360º ───────────────────────────────────────────────────────────

export interface EmployeeProfileDTO {
  employee: EmployeeDTO;
  profileCompletionPercent: number;
  sections: {
    personalData: boolean;
    address: boolean;
    contractData: boolean;
    bankAccount: boolean;
    emergencyContact: boolean;
  };
  documents: {
    mandatoryTotal: number;
    mandatoryCompleted: number;
    /** Nomes amigáveis dos requisitos obrigatórios por cumprir (ex: "Documento de identificação"), não slugs de categoria. */
    missingRequirements: string[];
    /** Categorias opcionais (configuráveis) ainda sem documento — só aparece aqui, nunca nas pendências prioritárias. */
    missingOptional: string[];
    expiringSoonCount: number;
  };
  alerts: Array<{ type: "document_expiring" | "document_missing" | "emergency_contact_pending"; message: string }>;
}

export interface GetEmployeeProfileCommand {
  organizationId: OrganizationId;
  viewerRole: ViewerRole;
  id: string;
}

export interface GetEmployeeProfilePort {
  execute(command: GetEmployeeProfileCommand): Promise<EmployeeProfileDTO>;
}

// ── Criar / editar / estado ───────────────────────────────────────────────

export interface CreateEmployeeCommand {
  organizationId: OrganizationId;
  actor: string;
  fullName: string;
  email?: string | null;
  phone?: string | null;
  roleOrNotes?: string | null;
  employmentType?: EmploymentType;
  /**
   * Cargo (ticket 07) — substitui a antiga "Função": o `jobRole` do
   * colaborador passa a ser derivado da categoria operacional do cargo (D4),
   * nunca enviado diretamente.
   */
  positionId?: string | null;
  primaryLocationId?: string | null;
  authorizedLocationIds?: string[];
  hiredAt?: string | null;
  baseSalary?: number | null;
  salaryType?: SalaryType;
  hourlyRate?: number | null;
  nif?: string | null;
  iban?: string | null;
  address?: string | null;
  birthDate?: string | null;
  socialSecurityNumber?: string | null;
  idCardNumber?: string | null;
  nationality?: string | null;
  emergencyContactName?: string | null;
  emergencyContactPhone?: string | null;
}

export interface CreateEmployeePort {
  execute(command: CreateEmployeeCommand): Promise<EmployeeDTO>;
}

export interface UpdateEmployeeCommand {
  organizationId: OrganizationId;
  actor: string;
  id: string;
  data: Omit<CreateEmployeeCommand, "organizationId" | "actor" | "fullName"> & { fullName?: string };
}

export interface UpdateEmployeePort {
  execute(command: UpdateEmployeeCommand): Promise<EmployeeDTO>;
}

export interface SetEmployeeStatusCommand {
  organizationId: OrganizationId;
  actor: string;
  id: string;
  status: EmployeeStatus;
}

export interface SetEmployeeStatusPort {
  execute(command: SetEmployeeStatusCommand): Promise<EmployeeDTO>;
}

// ── Foto ──────────────────────────────────────────────────────────────────

export interface UploadEmployeePhotoCommand {
  organizationId: OrganizationId;
  actor: string;
  id: string;
  buffer: Buffer;
  filename: string;
  mimeType: string;
}

export interface UploadEmployeePhotoPort {
  execute(command: UploadEmployeePhotoCommand): Promise<{ photoUrl: string }>;
}

// ── Histórico agregado (auditoria) ────────────────────────────────────────

export interface EmployeeHistoryEntryDTO {
  id: string;
  createdAt: string;
  entityType: HrAuditEntityType;
  action: string;
  actor: string;
  description: string;
}

export interface GetEmployeeHistoryCommand {
  organizationId: OrganizationId;
  id: string;
  page: number;
  pageSize: number;
}

export interface GetEmployeeHistoryPort {
  execute(command: GetEmployeeHistoryCommand): Promise<{ items: EmployeeHistoryEntryDTO[]; total: number }>;
}
