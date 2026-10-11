import type { SettingData, SettingDomain } from "./setting-definition.js";

/**
 * Perfis, alvos e valores (C11.1). Datas de efeito são datas locais
 * `AAAA-MM-DD` no fuso da organização; inclusivas.
 */

export type ProfileKind = "global" | "segment" | "personal";

export interface SettingProfile {
  id: string;
  domain: SettingDomain;
  name: string;
  kind: ProfileKind;
  archived: boolean;
}

/** A quem um perfil se aplica. Perfil global não tem alvos (aplica-se a todos). */
export type TargetType = "employee" | "group" | "department" | "location";

export interface SettingTarget {
  id: string;
  profileId: string;
  targetType: TargetType;
  targetId: string;
  validFrom: string;
  /** Inclusivo; null = sem fim. */
  validTo: string | null;
}

/**
 * Valor de uma chave num perfil a partir de `validFrom`. Append-only:
 * alterar = nova linha. `value: null` = o perfil deixa de definir a chave
 * (passa a herdar).
 */
export interface SettingValue {
  id: string;
  profileId: string;
  key: string;
  value: SettingData | null;
  validFrom: string;
  createdAt: string;
  createdBy: string;
  reason: string;
}

/** Onde um colaborador está, numa data (para escolher os perfis de segmento). */
export interface EmployeeSegments {
  employeeId: string;
  locationIds: string[];
  departmentIds: string[];
  groupIds: string[];
}

export type Level = "personal" | "group" | "department" | "location" | "global" | "system";

/** D3 (ADR-0024): ordem de prioridade, do mais forte para o mais fraco. */
export const LEVEL_PRIORITY: Level[] = ["personal", "group", "department", "location", "global", "system"];

export interface ValueOrigin {
  level: Level;
  profileId: string | null;
  profileName: string | null;
  valueId: string | null;
  validFrom: string | null;
}

export interface EffectiveSetting {
  key: string;
  /** null = parâmetro sem valor definido (ADR-0026). */
  value: SettingData | null;
  origin: ValueOrigin;
  /** O que valeria sem o perfil vencedor (C11.4 "valor herdado"); null quando a origem é o default. */
  inherited: { value: SettingData | null; origin: ValueOrigin } | null;
}
