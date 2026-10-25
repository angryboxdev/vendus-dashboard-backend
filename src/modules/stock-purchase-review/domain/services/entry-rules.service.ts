/**
 * Regras de entrada no Stock por tipo de artigo (task «Stock inteligente» V4 §2), sem I/O.
 * O Tipo de artigo decide se a mercadoria é inventariada; a Categoria financeira só classifica o custo.
 */

export const ITEM_TYPES = ["ingredient", "beverage", "packaging", "cleaning", "consumable", "other", "unknown"] as const;
export type RuleItemType = (typeof ITEM_TYPES)[number];
export type EntryMode = "stock" | "no_stock" | "review";

/** Predefinições (alteráveis por empresa). «unknown» = linha ainda sem artigo associado. */
export const DEFAULT_ENTRY_RULES: Record<RuleItemType, EntryMode> = {
  ingredient: "stock",
  beverage: "stock",
  packaging: "stock",
  cleaning: "no_stock",
  consumable: "review",
  other: "review",
  unknown: "review",
};

export type EntryRules = Record<RuleItemType, EntryMode>;

/** Regras efetivas: as gravadas pela empresa por cima das predefinições. */
export function effectiveRules(stored: Partial<Record<string, EntryMode>>): EntryRules {
  const out = { ...DEFAULT_ENTRY_RULES };
  for (const t of ITEM_TYPES) if (stored[t]) out[t] = stored[t]!;
  return out;
}

export function isRuleItemType(t: string): t is RuleItemType {
  return (ITEM_TYPES as readonly string[]).includes(t);
}

/** Modo para o tipo de um artigo (tipos desconhecidos da regra contam como «other»). */
export function modeForItemType(rules: EntryRules, itemType: string | null | undefined): EntryMode {
  if (!itemType) return rules.unknown;
  return isRuleItemType(itemType) ? rules[itemType] : rules.other;
}
