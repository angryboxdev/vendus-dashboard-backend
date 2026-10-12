import type { SettingData, SettingDefinition } from "../entities/setting-definition.js";
import { SettingRuleViolation, SettingValidationError } from "../errors.js";

const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

/** Valida o tipo e os limites de um valor (null = deixar de definir, sempre válido). */
export function validateSettingValue(def: SettingDefinition, value: SettingData | null): void {
  if (value === null) return;
  const fail = (msg: string): never => {
    throw new SettingValidationError(`${def.label}: ${msg}`, def.key);
  };
  switch (def.type) {
    case "bool":
      if (typeof value !== "boolean") fail("tem de ser sim ou não.");
      return;
    case "int":
    case "duration":
      if (typeof value !== "number" || !Number.isInteger(value)) fail("tem de ser um número inteiro.");
      if (def.min !== undefined && (value as number) < def.min) fail(`mínimo ${def.min}.`);
      if (def.max !== undefined && (value as number) > def.max) fail(`máximo ${def.max}.`);
      return;
    case "enum":
      if (typeof value !== "string" || !(def.allowed ?? []).includes(value)) fail("valor não permitido.");
      return;
    case "time":
      if (typeof value !== "string" || !TIME.test(value)) fail("hora inválida (HH:MM).");
      return;
    case "list":
      if (!Array.isArray(value) || value.some((v) => typeof v !== "string")) fail("tem de ser uma lista de textos.");
      if (def.allowed && (value as string[]).some((v) => !def.allowed!.includes(v))) fail("lista com valores não permitidos.");
      if (def.minItems !== undefined && (value as string[]).length < def.minItems) fail(def.minItems === 1 ? "tem de ficar pelo menos um ativo." : `mínimo de ${def.minItems}.`);
      return;
    case "json":
      if (typeof value !== "object" || Array.isArray(value)) fail("tem de ser um objeto.");
      return;
  }
}

/** Um parâmetro está "ativo" para efeitos de dependência: bool true; outros tipos, diferente do default. */
export function isActive(def: SettingDefinition, value: SettingData | null): boolean {
  if (value === null) return false;
  if (def.type === "bool") return value === true;
  return JSON.stringify(value) !== JSON.stringify(def.defaultValue);
}

const same = (a: SettingData | null, b: SettingData | null) => JSON.stringify(a) === JSON.stringify(b);

/**
 * TK-7 / C9: recusa um valor que deixe uma dependência por cumprir, nos dois
 * sentidos — ativar algo cujo requisito não está cumprido, ou desfazer um
 * requisito de que outro parâmetro ativo depende.
 *
 * `valueAt(key)` devolve o valor que o perfil vê para essa chave na data de
 * efeito (o próprio valor do perfil, senão o global, senão o default).
 */
export function checkDependencies(
  catalog: SettingDefinition[],
  key: string,
  proposed: SettingData,
  valueAt: (key: string) => SettingData | null,
): void {
  const byKey = new Map(catalog.map((d) => [d.key, d]));
  const def = byKey.get(key);
  if (!def) return;
  const view = (k: string) => (k === key ? proposed : valueAt(k));

  if (isActive(def, proposed)) {
    for (const req of def.requires ?? []) {
      if (!same(view(req.key), req.equals)) {
        const label = byKey.get(req.key)?.label ?? req.key;
        throw new SettingRuleViolation(`"${def.label}" só pode ficar ativo com "${label}" ativo.`, key, req);
      }
    }
  }
  for (const other of catalog) {
    for (const req of other.requires ?? []) {
      if (req.key !== key || same(proposed, req.equals)) continue;
      if (isActive(other, view(other.key))) {
        throw new SettingRuleViolation(`"${other.label}" está ativo e depende de "${def.label}". Desative-o primeiro.`, other.key, req);
      }
    }
  }
}
