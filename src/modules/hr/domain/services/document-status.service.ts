import type { EmployeeDocument } from "../entities/employee-document.js";
import type { DocumentCategoryDefinition } from "../entities/document-category.js";
import type { JobRole } from "../entities/employee.js";

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
  /** Nomes amigáveis dos requisitos por cumprir (ex: "Documento de identificação"), não slugs de categoria. */
  missingRequirements: string[];
  expiringSoonCount: number;
}

/**
 * Um requisito documental obrigatório — satisfeito por QUALQUER UMA das
 * categorias em `categories` (ex: "Documento de identificação" é satisfeito
 * por Cartão de Cidadão OU Título de Residência OU Passaporte — não é
 * preciso ter os 3). Confirmado com o utilizador (RH-02, revisão de
 * pendências): a lista de requisitos é uma constante do módulo — ver
 * `DEFAULT_MANDATORY_REQUIREMENTS` — ainda não configurável por organização.
 */
export interface MandatoryDocumentRequirement {
  id: string;
  label: string;
  categories: readonly string[];
}

/**
 * Compara os requisitos documentais obrigatórios com os documentos atuais do
 * colaborador. Cada requisito conta como cumprido se QUALQUER UMA das suas
 * categorias tiver uma versão atual em estado "ok"/"expiring". Documentos
 * expirados/rejeitados/em validação contam como requisito por cumprir
 * (aparecem em `missingRequirements`), em vez de desaparecerem
 * silenciosamente — corrigido face à versão anterior desta função.
 */
export function computeMandatoryDocumentsSummary(
  requirements: readonly MandatoryDocumentRequirement[],
  currentDocuments: readonly Pick<EmployeeDocument, "category" | "status" | "expiresAt" | "isCurrent">[],
  now: Date = new Date(),
): MandatoryDocumentsSummary {
  const byCategory = new Map(currentDocuments.map((d) => [d.category, d]));
  let mandatoryCompleted = 0;
  const missingRequirements: string[] = [];

  for (const requirement of requirements) {
    const doc = requirement.categories.map((c) => byCategory.get(c)).find((d) => d != null);
    if (!doc) {
      missingRequirements.push(requirement.label);
      continue;
    }
    const displayStatus = computeDocumentDisplayStatus(doc, now);
    if (displayStatus === "ok" || displayStatus === "expiring") {
      mandatoryCompleted++;
    } else {
      missingRequirements.push(requirement.label);
    }
  }

  // Documentos a expirar contam para o KPI/alerta independentemente de a
  // categoria pertencer a um requisito obrigatório ou ser opcional.
  let expiringSoonCount = 0;
  for (const doc of currentDocuments) {
    if (computeDocumentDisplayStatus(doc, now) === "expiring") expiringSoonCount++;
  }

  return {
    mandatoryTotal: requirements.length,
    mandatoryCompleted,
    missingRequirements,
    expiringSoonCount,
  };
}

export type OverallDocumentSituation = "ok" | "expiring" | "missing";

/** Resume o `MandatoryDocumentsSummary` de um colaborador num único estado — usado na lista e nos KPIs. */
export function deriveOverallDocumentSituation(summary: MandatoryDocumentsSummary): OverallDocumentSituation {
  if (summary.missingRequirements.length > 0) return "missing";
  if (summary.expiringSoonCount > 0) return "expiring";
  return "ok";
}

/**
 * Requisito obrigatório fixo — o único que continua "hardcoded" após as
 * categorias passarem a ser configuráveis por organização (decisão
 * confirmada com o utilizador: o grupo de identificação fica fora da nova
 * tela "Categorias de documentos"). Cumprido por QUALQUER UMA das 3
 * categorias — não é preciso ter as três.
 */
export const DEFAULT_MANDATORY_REQUIREMENTS: MandatoryDocumentRequirement[] = [
  {
    id: "identificacao",
    label: "Documento de identificação",
    categories: ["cartao_cidadao", "titulo_residencia", "passaporte"],
  },
];

/** As 3 categorias de identificação — únicas que continuam fixas no código. */
export const IDENTIFICATION_DOCUMENT_CATEGORIES = ["cartao_cidadao", "titulo_residencia", "passaporte"] as const;

/** Nome amigável das categorias fixas de identificação. As restantes categorias (configuráveis) trazem o próprio `label` na `DocumentCategoryDefinition`. */
export const DOCUMENT_CATEGORY_BASE_LABELS: Record<string, string> = {
  cartao_cidadao: "Cartão de Cidadão",
  titulo_residencia: "Título de Residência",
  passaporte: "Passaporte",
};

/** Categorias de uma organização aplicáveis a um cargo — ativas e sem restrição de cargo, ou cujo `jobRoles` inclui este cargo. */
export function applicableCategoriesFor(
  definitions: readonly DocumentCategoryDefinition[],
  jobRole: JobRole,
): DocumentCategoryDefinition[] {
  return definitions.filter((d) => d.active && (d.jobRoles.length === 0 || d.jobRoles.includes(jobRole)));
}

/** Converte cada categoria configurável obrigatória num requisito de categoria única, para somar a `DEFAULT_MANDATORY_REQUIREMENTS`. */
export function buildDynamicRequirements(
  applicableCategories: readonly DocumentCategoryDefinition[],
): MandatoryDocumentRequirement[] {
  return applicableCategories
    .filter((c) => c.mandatory)
    .map((c) => ({ id: c.slug, label: c.label, categories: [c.slug] }));
}

/**
 * Labels das categorias opcionais (configuráveis, `mandatory=false`) ainda
 * sem documento atual em estado "ok"/"expiring" — mostrado só dentro do
 * perfil do colaborador (nunca nas pendências prioritárias, que só devem
 * listar obrigatórios — pedido explícito do utilizador).
 */
export function computeMissingOptional(
  applicableCategories: readonly DocumentCategoryDefinition[],
  currentDocuments: readonly Pick<EmployeeDocument, "category" | "status" | "expiresAt" | "isCurrent">[],
  now: Date = new Date(),
): string[] {
  const byCategory = new Map(currentDocuments.map((d) => [d.category, d]));
  const missing: string[] = [];
  for (const c of applicableCategories) {
    if (c.mandatory) continue;
    const doc = byCategory.get(c.slug);
    if (!doc) {
      missing.push(c.label);
      continue;
    }
    const displayStatus = computeDocumentDisplayStatus(doc, now);
    if (displayStatus !== "ok" && displayStatus !== "expiring") missing.push(c.label);
  }
  return missing;
}
