import type { SettingData, SettingDefinition } from "../entities/setting-definition.js";
import {
  LEVEL_PRIORITY,
  type EffectiveSetting,
  type EmployeeSegments,
  type Level,
  type SettingProfile,
  type SettingTarget,
  type SettingValue,
  type ValueOrigin,
} from "../entities/setting-profile.js";

/**
 * Resolução em cascata por chave e por data (C11.2, ADR-0024 D3):
 * pessoal > grupo > departamento > centro > global > default do catálogo.
 * Ganha o primeiro perfil que DEFINE a chave na data (por chave, não o
 * perfil inteiro). Empate no mesmo nível: alvo com `validFrom` mais recente,
 * depois `profileId` — determinístico (TK-8).
 */

export interface SettingsSnapshot {
  profiles: SettingProfile[];
  targets: SettingTarget[];
  values: SettingValue[];
}

const LEVEL_OF_TARGET: Record<SettingTarget["targetType"], Level> = {
  employee: "personal",
  group: "group",
  department: "department",
  location: "location",
};

export const activeOn = (t: { validFrom: string; validTo: string | null }, date: string) =>
  t.validFrom <= date && (t.validTo === null || date <= t.validTo);

/** Valor de um perfil para uma chave numa data: a linha mais recente com `validFrom` ≤ data. */
export function profileValueAt(values: SettingValue[], profileId: string, key: string, date: string): SettingValue | null {
  let best: SettingValue | null = null;
  for (const v of values) {
    if (v.profileId !== profileId || v.key !== key || v.validFrom > date) continue;
    if (
      !best ||
      v.validFrom > best.validFrom ||
      (v.validFrom === best.validFrom && (v.createdAt > best.createdAt || (v.createdAt === best.createdAt && v.id > best.id)))
    ) {
      best = v;
    }
  }
  return best;
}

interface Candidate {
  level: Level;
  profile: SettingProfile;
  targetFrom: string;
}

/** Perfis que se aplicam ao colaborador na data, já ordenados por prioridade. */
export function applicableProfiles(def: SettingDefinition, segments: EmployeeSegments, date: string, snap: SettingsSnapshot): Candidate[] {
  const byId = new Map(snap.profiles.filter((p) => !p.archived && p.domain === def.domain).map((p) => [p.id, p]));
  const members: Record<Level, Set<string>> = {
    personal: new Set([segments.employeeId]),
    group: new Set(segments.groupIds),
    department: new Set(segments.departmentIds),
    location: new Set(segments.locationIds),
    global: new Set(),
    system: new Set(),
  };
  const out: Candidate[] = [];
  for (const p of byId.values()) if (p.kind === "global") out.push({ level: "global", profile: p, targetFrom: "0000-00-00" });
  for (const t of snap.targets) {
    const profile = byId.get(t.profileId);
    if (!profile || profile.kind === "global" || !activeOn(t, date)) continue;
    const level = LEVEL_OF_TARGET[t.targetType];
    // Um perfil pessoal só conta por alvo de colaborador; um de segmento só por grupo/departamento/centro.
    if ((profile.kind === "personal") !== (level === "personal")) continue;
    if (members[level].has(t.targetId)) out.push({ level, profile, targetFrom: t.validFrom });
  }
  const rank = (l: Level) => LEVEL_PRIORITY.indexOf(l);
  return out.sort(
    (a, b) => rank(a.level) - rank(b.level) || b.targetFrom.localeCompare(a.targetFrom) || a.profile.id.localeCompare(b.profile.id),
  );
}

const SYSTEM: ValueOrigin = { level: "system", profileId: null, profileName: null, valueId: null, validFrom: null };

export function resolveSetting(def: SettingDefinition, segments: EmployeeSegments, date: string, snap: SettingsSnapshot): EffectiveSetting {
  const found: { value: SettingData; origin: ValueOrigin }[] = [];
  const seen = new Set<string>();
  for (const c of applicableProfiles(def, segments, date, snap)) {
    if (seen.has(c.profile.id)) continue; // o mesmo perfil por dois alvos conta uma vez (no nível mais forte)
    seen.add(c.profile.id);
    const v = profileValueAt(snap.values, c.profile.id, def.key, date);
    if (!v || v.value === null) continue;
    found.push({
      value: v.value,
      origin: { level: c.level, profileId: c.profile.id, profileName: c.profile.name, valueId: v.id, validFrom: v.validFrom },
    });
    if (found.length === 2) break;
  }
  const system = { value: def.defaultValue, origin: SYSTEM };
  const winner = found[0] ?? system;
  const inherited = found[0] ? (found[1] ?? system) : null;
  return { key: def.key, value: winner.value, origin: winner.origin, inherited };
}

/**
 * O que um perfil "vê" numa chave, na data de efeito, para validar
 * dependências: o próprio valor; senão o do perfil global do domínio; senão
 * o default. (Para perfis de segmento/pessoais é uma aproximação segura —
 * exige que a dependência esteja cumprida ao nível do próprio perfil ou do global.)
 */
export function profileViewAt(catalog: SettingDefinition[], profile: SettingProfile, date: string, snap: SettingsSnapshot) {
  return (key: string): SettingData => {
    const def = catalog.find((d) => d.key === key);
    if (!def) throw new Error(`Parâmetro fora do catálogo: ${key}`);
    const own = profileValueAt(snap.values, profile.id, key, date);
    if (own && own.value !== null) return own.value;
    const globals = snap.profiles.filter((p) => p.kind === "global" && !p.archived && p.domain === def.domain).sort((a, b) => a.id.localeCompare(b.id));
    for (const g of globals) {
      const gv = profileValueAt(snap.values, g.id, key, date);
      if (gv && gv.value !== null) return gv.value;
    }
    return def.defaultValue;
  };
}
