import { ACCESS_CATALOG, ALL_FUNCTION_KEYS, ALL_SPECIAL_KEYS, isSpecialKey, type AccessLevel, type PermissionMap } from "../catalog.js";

/**
 * Permissão efetiva = perfil + exceções individuais (task §2). Uma exceção
 * prevalece; sem exceção herda o valor ATUAL do perfil (herança dinâmica —
 * mudar o perfil muda quem está em INHERIT). Admin tem sempre tudo.
 * Permissões especiais só admitem NONE/MANAGE (READ conta como NONE).
 */

const RANK: Record<AccessLevel, number> = { NONE: 0, READ: 1, MANAGE: 2 };

function normalize(key: string, level: AccessLevel | undefined): AccessLevel {
  if (!level) return "NONE";
  return isSpecialKey(key) && level === "READ" ? "NONE" : level;
}

export function effectivePermissions(profile: PermissionMap, overrides: PermissionMap, isAdmin: boolean): PermissionMap {
  const out: PermissionMap = {};
  for (const key of [...ALL_FUNCTION_KEYS, ...ALL_SPECIAL_KEYS]) {
    out[key] = isAdmin ? "MANAGE" : normalize(key, overrides[key] ?? profile[key]);
  }
  return out;
}

export interface AccessSubject {
  isAdmin: boolean;
  active: boolean;
  permissions: PermissionMap;
}

/** A verificação única (`can(user, permission)`, task §15). Utilizador desativado nunca pode nada. */
export function can(subject: AccessSubject, key: string, level: Exclude<AccessLevel, "NONE">): boolean {
  if (!subject.active) return false;
  if (subject.isAdmin) return true;
  const required = isSpecialKey(key) ? "MANAGE" : level;
  return RANK[subject.permissions[key] ?? "NONE"] >= RANK[required];
}

/** Só valores válidos e chaves do catálogo — o que vem da UI/BD nunca introduz chaves soltas. */
export function sanitizePermissionMap(raw: Record<string, unknown>): PermissionMap {
  const out: PermissionMap = {};
  for (const [key, value] of Object.entries(raw)) {
    if (!ALL_FUNCTION_KEYS.includes(key) && !ALL_SPECIAL_KEYS.includes(key)) continue;
    if (value !== "NONE" && value !== "READ" && value !== "MANAGE") continue;
    out[key] = normalize(key, value);
  }
  return out;
}

export type ModuleState = "none" | "read_all" | "manage_all" | "mixed";

export interface ModuleSummary {
  moduleKey: string;
  label: string;
  state: ModuleState;
  /** Funcionalidades com algum acesso / total. */
  granted: number;
  total: number;
  /** Alguma exceção individual neste módulo (indicador "Personalizado"). */
  customized: boolean;
}

/** Resumo por módulo para a lista de utilizadores e o Editar (Sem acesso / Ver tudo / Gerir tudo / Personalizado). */
export function summarizeModules(effective: PermissionMap, overrides: PermissionMap): ModuleSummary[] {
  return ACCESS_CATALOG.map((mod) => {
    const levels = mod.functions.map((f) => effective[f.key] ?? "NONE");
    const granted = levels.filter((l) => l !== "NONE").length;
    const state: ModuleState = levels.every((l) => l === "NONE")
      ? "none"
      : levels.every((l) => l === "MANAGE")
        ? "manage_all"
        : levels.every((l) => l === "READ")
          ? "read_all"
          : "mixed";
    const keys = [...mod.functions.map((f) => f.key), ...mod.specials.map((s) => s.key)];
    return { moduleKey: mod.key, label: mod.label, state, granted, total: mod.functions.length, customized: keys.some((k) => k in overrides) };
  });
}

/** "Sem acesso / Ver tudo / Gerir tudo" de um módulo aplicado como mapa (para perfis ou exceções). */
export function moduleBulk(moduleKey: string, level: AccessLevel): PermissionMap {
  const mod = ACCESS_CATALOG.find((m) => m.key === moduleKey);
  if (!mod) return {};
  return Object.fromEntries(mod.functions.map((f) => [f.key, level]));
}
