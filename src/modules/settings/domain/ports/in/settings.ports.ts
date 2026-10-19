import type { OrganizationId } from "../../../../../kernel/organization-id.js";
import type { SettingData, SettingDefinition, SettingDomain } from "../../entities/setting-definition.js";
import type { EffectiveSetting, ProfileKind, SettingProfile, SettingTarget, SettingValue, TargetType } from "../../entities/setting-profile.js";

export interface Actor {
  userId: string;
  /** Permissão especial `company.settings_retroactive`. */
  canRetroactive: boolean;
}

export interface ImpactPreview {
  employees: number;
  /** Dias já decorridos desde a data de efeito (0 quando é hoje ou futura). */
  pastDays: number;
  validFrom: string;
}

export interface ProfileDetail {
  profile: SettingProfile;
  targets: SettingTarget[];
  /** Valor atual (hoje) de cada chave definida neste perfil. */
  values: SettingValue[];
  /** Versão do perfil para ETag/If-Match. */
  version: string;
}

export interface HistoryEntry {
  valueId: string;
  profileId: string;
  profileName: string;
  key: string;
  label: string;
  before: SettingData | null;
  after: SettingData | null;
  validFrom: string;
  createdAt: string;
  createdBy: string;
  reason: string;
}

export interface SettingsPorts {
  listDefinitions(domain?: SettingDomain): SettingDefinition[];
  listProfiles(orgId: OrganizationId): Promise<SettingProfile[]>;
  getProfile(orgId: OrganizationId, profileId: string): Promise<ProfileDetail>;
  createProfile(orgId: OrganizationId, input: { domain: SettingDomain; name: string; kind: ProfileKind }, actor: Actor): Promise<SettingProfile>;
  addTarget(
    orgId: OrganizationId,
    profileId: string,
    input: { targetType: TargetType; targetId: string; validFrom: string; validTo: string | null },
    actor: Actor,
  ): Promise<SettingTarget>;
  setValue(
    orgId: OrganizationId,
    profileId: string,
    input: { key: string; value: SettingData | null; validFrom: string; reason: string },
    actor: Actor,
  ): Promise<{ value: SettingValue; impact: ImpactPreview | null }>;
  impactPreview(orgId: OrganizationId, profileId: string, validFrom: string): Promise<ImpactPreview>;
  effectiveFor(orgId: OrganizationId, employeeId: string, date: string, domain?: SettingDomain): Promise<EffectiveSetting[]>;
  history(orgId: OrganizationId, filter: { key?: string; profileId?: string }): Promise<HistoryEntry[]>;
  /** Política de sessão da organização hoje (configuração global ou predefinição) — para todos os utilizadores. */
  sessionPolicy(orgId: OrganizationId): Promise<{ inactivityMinutes: number }>;
  /** Valor de hoje para a empresa (perfil global ou predefinição), sem exceções por pessoa ou centro. */
  companyValue(orgId: OrganizationId, key: string): Promise<SettingData | null>;
  /** Grava um valor da empresa a partir de hoje (perfil geral do domínio; cria-o se faltar), com motivo e auditoria. */
  setCompanyValue(orgId: OrganizationId, key: string, value: SettingData, reason: string, actor: Actor): Promise<void>;
}
