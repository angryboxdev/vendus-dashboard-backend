import type { OrganizationId } from "../../../../../kernel/organization-id.js";
import type { SettingData, SettingDomain } from "../../entities/setting-definition.js";
import type { EmployeeSegments, ProfileKind, SettingProfile, SettingTarget, SettingValue } from "../../entities/setting-profile.js";
import type { SettingsSnapshot } from "../../services/setting-resolution.js";

/** Persistência do motor. Valores e alvos são append-only do ponto de vista do domínio. */
export interface SettingsRepositoryPort {
  loadSnapshot(orgId: OrganizationId): Promise<SettingsSnapshot>;
  createProfile(orgId: OrganizationId, input: { domain: SettingDomain; name: string; kind: ProfileKind; createdBy: string }): Promise<SettingProfile>;
  addTarget(orgId: OrganizationId, input: Omit<SettingTarget, "id"> & { createdBy: string }): Promise<SettingTarget>;
  appendValue(
    orgId: OrganizationId,
    input: { profileId: string; key: string; value: SettingData | null; validFrom: string; createdBy: string; reason: string },
  ): Promise<SettingValue>;
}

/** Onde o colaborador está numa data (centros, departamentos, grupos). */
export interface EmployeeSegmentsPort {
  segmentsOf(orgId: OrganizationId, employeeId: string, date: string): Promise<EmployeeSegments>;
}

/** Colaboradores abrangidos por um conjunto de alvos numa data (pré-visualização de impacto). */
export interface SettingsImpactPort {
  countEmployees(orgId: OrganizationId, scope: { allEmployees: true } | { targets: Pick<SettingTarget, "targetType" | "targetId">[] }, date: string): Promise<number>;
}

/** Auditoria transversal (módulo audit, ligado no composition root). */
export interface SettingsAuditPort {
  record(
    orgId: OrganizationId,
    event: { actor: string; action: string; resourceType: string; resourceId: string | null; before: unknown; after: unknown; reason: string | null },
  ): Promise<void>;
}

/** Avisos (módulo notifications): uma alteração retroativa avisa os Admins. */
export interface SettingsNotifierPort {
  retroactiveChange(orgId: OrganizationId, info: { valueId: string; label: string; profileName: string; validFrom: string; employees: number; pastDays: number; actor: string }): Promise<void>;
}

/** "Hoje" no fuso da organização (AAAA-MM-DD). */
export interface SettingsClockPort {
  today(orgId: OrganizationId): Promise<string>;
}
