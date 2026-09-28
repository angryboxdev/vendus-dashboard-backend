import type { AccountingDocument } from "../../domain/entities/accounting-document.js";
import type { AccountingDocumentDTO } from "../../domain/ports/in/accounting-document.ports.js";
import type { AccountingDocumentAttachmentDTO } from "../../domain/ports/out/accounting-document-attachment-repository.port.js";
import type { CostCenterCategoryDTO } from "../../../financial-base/domain/ports/in/cost-center-category.ports.js";

/** TTL curto, mesmo espírito do bucket de documentos do `hr` (nunca público). */
export const ATTACHMENT_SIGNED_URL_TTL_SECONDS = 120;

/**
 * A subcategoria só sugere (`vatDeductible` boolean → 100 ou 0); nunca decide
 * sozinha. Um `deductiblePercentage` explícito (override do gestor, com
 * motivo obrigatório) tem sempre prioridade. Sem categoria e sem override,
 * assume-se dedutível por omissão — mesmo comportamento já usado em
 * `GetVatOverviewUseCase` para linhas de fatura não classificadas, fica
 * visível como pendência, nunca some do saldo.
 */
export function resolveDeductibility(
  vatAmount: number,
  deductiblePercentage: number | null,
  costCenterCategoryId: string | null,
  categories: CostCenterCategoryDTO[],
): { vatDeductibleAmount: number; vatNonDeductibleAmount: number } {
  let effectivePercentage: number;
  if (deductiblePercentage !== null) {
    effectivePercentage = deductiblePercentage;
  } else {
    const category = costCenterCategoryId ? categories.find((c) => c.id === costCenterCategoryId) : undefined;
    effectivePercentage = category ? (category.vatDeductible ? 100 : 0) : 100;
  }
  const vatDeductibleAmount = Math.round((vatAmount * effectivePercentage) / 100);
  return { vatDeductibleAmount, vatNonDeductibleAmount: vatAmount - vatDeductibleAmount };
}

/** Função pura — recebe os anexos já resolvidos, para não misturar I/O com mapeamento. */
export function toAccountingDocumentDTO(
  document: AccountingDocument,
  attachments: AccountingDocumentAttachmentDTO[],
): AccountingDocumentDTO {
  const props = document.toProps();
  return {
    id: props.id,
    documentType: props.documentType,
    fundingSource: props.fundingSource,
    entityName: props.entityName,
    nif: props.nif,
    documentNumber: props.documentNumber,
    issueDate: props.issueDate,
    receivedDate: props.receivedDate,
    competenceDate: props.competenceDate,
    currency: props.currency,
    country: props.country,
    subtotalWithoutVat: props.subtotalWithoutVat,
    vatAmount: props.vatAmount,
    totalWithVat: props.totalWithVat,
    costCenterCategoryId: props.costCenterCategoryId,
    deductiblePercentage: props.deductiblePercentage,
    deductibilityOverrideReason: props.deductibilityOverrideReason,
    vatDeductibleAmount: props.vatDeductibleAmount,
    vatNonDeductibleAmount: props.vatNonDeductibleAmount,
    settlementMethod: props.settlementMethod,
    status: props.status,
    cancellationReason: props.cancellationReason,
    notes: props.notes,
    attachments,
    createdBy: props.createdBy,
    updatedBy: props.updatedBy,
    createdAt: props.createdAt.toISOString(),
    updatedAt: props.updatedAt.toISOString(),
  };
}
