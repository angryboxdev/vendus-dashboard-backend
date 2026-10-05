import type { OrganizationId } from "../../../../../kernel/organization-id.js";
import type { PayslipMatchReason, PayslipReviewReason } from "../../services/payslip-identification.service.js";

/**
 * Categorias periódicas que a importação em massa aceita: recibo de
 * vencimento (contratados) e recibo verde (prestadores independentes) —
 * migrações `20261006120000_payslips_period.sql` e
 * `20261006130000_recibo_verde_category.sql`.
 */
export const PAYSLIP_CATEGORY_SLUGS = ["recibo_vencimento", "recibo_verde"] as const;
export type PayslipCategorySlug = (typeof PAYSLIP_CATEGORY_SLUGS)[number];

export function isPayslipCategory(value: unknown): value is PayslipCategorySlug {
  return typeof value === "string" && (PAYSLIP_CATEGORY_SLUGS as readonly string[]).includes(value);
}

export interface PayslipFile {
  fileName: string;
  buffer: Buffer;
  mimeType: string;
}

// ── Pré-visualização (nada é gravado) ────────────────────────────────────

export interface PreviewPayslipImportCommand {
  organizationId: OrganizationId;
  category: PayslipCategorySlug;
  /** `YYYY-MM`. */
  period: string;
  files: PayslipFile[];
}

/**
 * - `identified` — um único colaborador, sem recibo atual neste período;
 * - `duplicate` — identificado, mas já existe recibo deste colaborador para
 *   o período (Cancelar ou Substituir versão, task §26);
 * - `review` — por identificar, ambíguo ou repetido no lote: o utilizador
 *   escolhe o colaborador (§24, nunca automático).
 */
export type PayslipPreviewStatus = "identified" | "duplicate" | "review";

export interface PayslipPreviewRowDTO {
  fileName: string;
  period: string;
  status: PayslipPreviewStatus;
  employeeId: string | null;
  employeeName: string | null;
  matchReason: PayslipMatchReason | null;
  reviewReason: PayslipReviewReason | "repeated_in_batch" | null;
  /** Colaboradores possíveis quando ambíguo (para o utilizador escolher). */
  candidates: { id: string; name: string }[];
  /** Recibo atual do colaborador no período, quando `duplicate`. */
  existingDocumentId: string | null;
  /** O PDF tinha texto legível (senão só o nome do ficheiro foi usado). */
  hasText: boolean;
}

export interface PreviewPayslipImportPort {
  execute(command: PreviewPayslipImportCommand): Promise<PayslipPreviewRowDTO[]>;
}

// ── Importar (grava o que o utilizador confirmou) ────────────────────────

export interface PayslipImportItem extends PayslipFile {
  employeeId: string;
  /** `replace` só quando o utilizador escolheu "Substituir versão" para um recibo já existente. */
  action: "create" | "replace";
}

export interface ImportPayslipsCommand {
  organizationId: OrganizationId;
  category: PayslipCategorySlug;
  actor: string;
  period: string;
  items: PayslipImportItem[];
}

export type PayslipImportOutcome = "created" | "replaced" | "duplicate" | "failed";

export interface PayslipImportResultDTO {
  fileName: string;
  employeeId: string;
  outcome: PayslipImportOutcome;
  documentId: string | null;
  message: string | null;
}

export interface ImportPayslipsPort {
  execute(command: ImportPayslipsCommand): Promise<PayslipImportResultDTO[]>;
}
