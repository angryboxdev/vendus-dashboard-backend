import type { OrganizationId } from "../../../../../kernel/organization-id.js";
import type { Employee, EmployeeInput } from "../../entities/employee.js";
import type {
  Agreement,
  CompensationAssignment,
  CompensationItem,
  Contract,
  ContractInput,
  CustomFieldDefinition,
  ManagerLink,
} from "../../entities/employment.js";

export type EmployeeWrite = EmployeeInput & { fullName?: string };

export interface PeopleRepositoryPort {
  list(org: OrganizationId, filter: { status: "active" | "inactive" | "all"; q?: string; locationId?: string }): Promise<Employee[]>;
  get(org: OrganizationId, id: string): Promise<Employee | null>;
  /** Outra ficha com este NIF normalizado (RE-2). */
  findIdByNif(org: OrganizationId, nif: string): Promise<string | null>;
  create(org: OrganizationId, data: EmployeeWrite & { fullName: string }): Promise<Employee>;
  /** null = versão desatualizada. */
  update(org: OrganizationId, id: string, data: EmployeeWrite, expectedVersion: number): Promise<Employee | null>;
  setStatus(org: OrganizationId, id: string, s: { status: "active" | "inactive"; deactivatedAt: string | null; reason: string | null }, expectedVersion: number): Promise<Employee | null>;
  locationIdByCode(org: OrganizationId, codeOrId: string): Promise<string | null>;
  /** Centros ativos da organização (catálogo do Novo RH). */
  listLocations(org: OrganizationId): Promise<{ id: string; name: string; code: string }[]>;
  /** Cargos ativos da organização (catálogo do Novo RH). */
  listPositions(org: OrganizationId): Promise<{ id: string; name: string }[]>;

  listContracts(org: OrganizationId, employeeId: string): Promise<Contract[]>;
  /** Contratos ativos já iniciados em `date` (todos os colaboradores, uma leitura) — a vigência fina é `weeklyHoursOn`. */
  listContractsStartedBy(org: OrganizationId, date: string): Promise<Contract[]>;
  createContract(org: OrganizationId, employeeId: string, input: ContractInput, createdBy: string): Promise<Contract>;
  updateContract(org: OrganizationId, id: string, input: ContractInput, expectedVersion: number): Promise<Contract | null>;
  cancelContract(org: OrganizationId, id: string, expectedVersion: number): Promise<Contract | null>;

  listAgreements(org: OrganizationId): Promise<Agreement[]>;
  createAgreement(org: OrganizationId, input: { name: string; code: string | null }, createdBy: string): Promise<Agreement>;
  archiveAgreement(org: OrganizationId, id: string): Promise<void>;

  listManagers(org: OrganizationId, employeeId: string): Promise<ManagerLink[]>;
  createManager(org: OrganizationId, input: Omit<ManagerLink, "id">, createdBy: string): Promise<ManagerLink>;
  endManager(org: OrganizationId, id: string, validTo: string): Promise<ManagerLink>;

  listCompensationItems(org: OrganizationId): Promise<CompensationItem[]>;
  createCompensationItem(org: OrganizationId, input: Omit<CompensationItem, "id" | "active">, createdBy: string): Promise<CompensationItem>;
  deactivateCompensationItem(org: OrganizationId, id: string): Promise<void>;
  listEmployeeCompensations(org: OrganizationId, employeeId: string): Promise<CompensationAssignment[]>;
  assignCompensation(org: OrganizationId, input: Omit<CompensationAssignment, "id">, createdBy: string): Promise<CompensationAssignment>;
  endCompensation(org: OrganizationId, id: string, validTo: string): Promise<CompensationAssignment>;

  listCustomFields(org: OrganizationId): Promise<CustomFieldDefinition[]>;
  createCustomField(org: OrganizationId, input: Omit<CustomFieldDefinition, "id" | "archived">, createdBy: string): Promise<CustomFieldDefinition>;
  archiveCustomField(org: OrganizationId, id: string): Promise<void>;
  getCustomValues(org: OrganizationId, employeeId: string): Promise<Record<string, string | null>>;
  setCustomValues(org: OrganizationId, employeeId: string, values: Record<string, string | null>, updatedBy: string): Promise<void>;
}

/** Conta ligada à ficha: desativar a ficha desativa a conta e revoga as sessões (RE-4). */
export interface PeopleAccountPort {
  disableLinkedUser(org: OrganizationId, userId: string, actor: string): Promise<void>;
}

export interface PeopleAuditPort {
  record(
    org: OrganizationId,
    e: { actor: string; action: string; resourceType: string; resourceId: string | null; before: unknown; after: unknown; reason: string | null },
  ): Promise<void>;
}

/** Fotos das fichas: URLs de leitura (assinados, curta duração) por caminho guardado. */
export interface PeoplePhotoPort {
  urls(org: OrganizationId, paths: string[]): Promise<Map<string, string>>;
}

/** "Hoje" no fuso da organização. */
export interface PeopleClockPort {
  today(org: OrganizationId): Promise<string>;
}
