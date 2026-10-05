import type { Document as EmployeeDocument } from "../../../documents/domain/entities/document.js";
import type { DocumentCategoryDefinition } from "../../../documents/domain/entities/document-category.js";
import type { JobRole } from "../entities/employee.js";

// Estado de validade genérico — vive no motor de documentos (Base Organizacional, ticket 03).
export {
  computeDocumentDisplayStatus,
  EXPIRING_SOON_DAYS,
  type DocumentDisplayStatus,
} from "../../../documents/domain/services/document-validity.service.js";
import { computeDocumentDisplayStatus } from "../../../documents/domain/services/document-validity.service.js";

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

export interface DocumentRequirementRow {
  requirementId: string;
  requirementLabel: string;
  mandatory: boolean;
  /** Simplificação face a `DocumentDisplayStatus`: "pending_validation"/"rejected"/"removed" contam como "missing" nesta vista agregada (task "Melhorar Visão Geral e reorganizar Pessoas" — a aba Documentos só distingue 4 estados). O detalhe completo continua disponível no perfil do colaborador. */
  status: "ok" | "expiring" | "expired" | "missing";
  expiresAt: string | null;
  /** Null só quando nunca houve nenhum upload para este requisito ("Adicionar"). Não-null sempre que existe um documento — mesmo "pending_validation"/"rejected" (status="missing" aqui) — para a Ação poder ser "Ver", não "Adicionar" do zero. */
  documentId: string | null;
}

interface DocumentRequirementDef {
  id: string;
  label: string;
  categories: readonly string[];
  mandatory: boolean;
}

/** 1 requisito por categoria aplicável (obrigatória ou opcional) + o grupo fixo de identificação — para a aba "Pessoas > Documentos" mostrar TODOS os estados (não só os em falta, ao contrário de `computeMandatoryDocumentsSummary`/`computeMissingOptional`). */
function buildAllDocumentRequirements(
  applicableCategories: readonly DocumentCategoryDefinition[],
): DocumentRequirementDef[] {
  return [
    {
      id: "identificacao",
      label: "Documento de identificação",
      categories: IDENTIFICATION_DOCUMENT_CATEGORIES,
      mandatory: true,
    },
    ...applicableCategories.map((c) => ({ id: c.slug, label: c.label, categories: [c.slug], mandatory: c.mandatory })),
  ];
}

/**
 * 1 linha por requisito aplicável ao colaborador (identificação + cada
 * categoria configurável), com o estado atual — usado pela aba "Pessoas >
 * Documentos" (visão agregada de todos os colaboradores, todos os
 * estados). Ao contrário de `computeMandatoryDocumentsSummary`, não filtra
 * só os que faltam — devolve sempre uma linha por requisito, para a tabela
 * mostrar "válidos" também.
 */
export function computeDocumentRequirementRows(
  applicableCategories: readonly DocumentCategoryDefinition[],
  currentDocuments: readonly Pick<EmployeeDocument, "id" | "category" | "status" | "expiresAt" | "isCurrent">[],
  now: Date = new Date(),
): DocumentRequirementRow[] {
  const byCategory = new Map(currentDocuments.map((d) => [d.category, d]));
  return buildAllDocumentRequirements(applicableCategories).map((req) => {
    const doc = req.categories.map((c) => byCategory.get(c)).find((d) => d != null);
    if (!doc) {
      return { requirementId: req.id, requirementLabel: req.label, mandatory: req.mandatory, status: "missing", expiresAt: null, documentId: null };
    }
    const displayStatus = computeDocumentDisplayStatus(doc, now);
    const status: DocumentRequirementRow["status"] =
      displayStatus === "ok" || displayStatus === "expiring" || displayStatus === "expired" ? displayStatus : "missing";
    return { requirementId: req.id, requirementLabel: req.label, mandatory: req.mandatory, status, expiresAt: doc.expiresAt, documentId: doc.id };
  });
}

/** Categorias de uma organização aplicáveis a um cargo — ativas e sem restrição de cargo, ou cujo `jobRoles` inclui este cargo. */
export function applicableCategoriesFor(
  definitions: readonly DocumentCategoryDefinition[],
  jobRole: JobRole,
): DocumentCategoryDefinition[] {
  return definitions.filter(
    (d) =>
      d.active &&
      // Base Organizacional §11: uma categoria só da Empresa nunca gera requisito (nem "Em falta") individual.
      d.scope !== "company" &&
      (d.jobRoles.length === 0 || d.jobRoles.includes(jobRole)),
  );
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
