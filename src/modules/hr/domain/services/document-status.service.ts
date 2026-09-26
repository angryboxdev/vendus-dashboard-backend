import type { EmployeeDocument } from "../entities/employee-document.js";

export type DocumentDisplayStatus =
  | "ok"
  | "expiring"
  | "expired"
  | "pending_validation"
  | "rejected"
  | "removed";

/**
 * Threshold de "a expirar" — constante nomeada, não persistida por
 * organização nesta fase (simplificação documentada no README do módulo).
 */
export const EXPIRING_SOON_DAYS = 30;

/** Deriva o estado de exibição de uma versão de documento (mockup: "Tudo ok" / "A expirar" / "A validar" / etc). */
export function computeDocumentDisplayStatus(
  doc: Pick<EmployeeDocument, "status" | "expiresAt" | "isCurrent">,
  now: Date = new Date(),
): DocumentDisplayStatus {
  if (!doc.isCurrent || doc.status === "removed") return "removed";
  if (doc.status === "rejected") return "rejected";
  if (doc.status === "pending_validation") return "pending_validation";
  if (doc.expiresAt) {
    const expiresAtMs = new Date(doc.expiresAt).getTime();
    const daysRemaining = Math.ceil((expiresAtMs - now.getTime()) / (1000 * 60 * 60 * 24));
    if (daysRemaining < 0) return "expired";
    if (daysRemaining <= EXPIRING_SOON_DAYS) return "expiring";
  }
  return "ok";
}

export interface MandatoryDocumentsSummary {
  mandatoryTotal: number;
  mandatoryCompleted: number;
  missingCategories: string[];
  expiringSoonCount: number;
}

/**
 * Compara as categorias obrigatórias esperadas com os documentos atuais do
 * colaborador. `mandatoryCategories` é a lista de categorias que a
 * organização exige — nesta fase é uma constante do módulo (ver
 * `DEFAULT_MANDATORY_CATEGORIES`), não configurável por organização.
 */
export function computeMandatoryDocumentsSummary(
  mandatoryCategories: readonly string[],
  currentDocuments: readonly Pick<EmployeeDocument, "category" | "status" | "expiresAt" | "isCurrent">[],
  now: Date = new Date(),
): MandatoryDocumentsSummary {
  const byCategory = new Map(currentDocuments.map((d) => [d.category, d]));
  let mandatoryCompleted = 0;
  let expiringSoonCount = 0;
  const missingCategories: string[] = [];

  for (const category of mandatoryCategories) {
    const doc = byCategory.get(category);
    if (!doc) {
      missingCategories.push(category);
      continue;
    }
    const displayStatus = computeDocumentDisplayStatus(doc, now);
    if (displayStatus === "ok" || displayStatus === "expiring") mandatoryCompleted++;
    if (displayStatus === "expiring") expiringSoonCount++;
  }

  for (const doc of currentDocuments) {
    if (!mandatoryCategories.includes(doc.category) && computeDocumentDisplayStatus(doc, now) === "expiring") {
      expiringSoonCount++;
    }
  }

  return {
    mandatoryTotal: mandatoryCategories.length,
    mandatoryCompleted,
    missingCategories,
    expiringSoonCount,
  };
}

export type OverallDocumentSituation = "ok" | "expiring" | "missing";

/** Resume o `MandatoryDocumentsSummary` de um colaborador num único estado — usado na lista e nos KPIs. */
export function deriveOverallDocumentSituation(summary: MandatoryDocumentsSummary): OverallDocumentSituation {
  if (summary.missingCategories.length > 0) return "missing";
  if (summary.expiringSoonCount > 0) return "expiring";
  return "ok";
}

/**
 * Categorias obrigatórias por omissão — placeholder ilustrativo (RH-02 nota
 * técnica: números/prazos apresentados não devem ser hardcoded na UI; a
 * *lista de categorias* em si ainda não tem um mecanismo de configuração por
 * organização nesta fase, e fica documentada como dívida conhecida).
 */
export const DEFAULT_MANDATORY_CATEGORIES = [
  "contrato_trabalho",
  "cartao_cidadao",
  "nif",
  "certificado_morada",
  "ficha_colaborador",
  "comprovativo_iban",
  "formacao_seguranca",
  "atestado_saude",
] as const;
