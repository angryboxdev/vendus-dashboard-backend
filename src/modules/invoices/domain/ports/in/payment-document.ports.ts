import type { OrganizationId } from "../../../../../kernel/organization-id.js";
import type { PaymentDocumentReading } from "../../entities/payment-document.js";
import type { ObligationMatch } from "../../services/reading/obligation-match.js";

export interface PaymentDocumentImportDTO {
  kind: "payment_document";
  payment: PaymentDocumentReading;
  /** Obrigações já registadas que parecem ser esta (sugestão; nada é ligado automaticamente). */
  matches: ObligationMatch[];
  /** Fornecedor já usado para este organismo e a sua Categoria habitual (do catálogo real). */
  supplierSuggestion: { id: string; name: string; defaultCostCenterGroupId: string | null; defaultCostCenterCategoryId: string | null } | null;
  metrics: { totalMs: number; barcodeMs: number; aiCalls: 0 };
}

export interface ReadPaymentDocumentPort {
  /** null = não é um documento de cobrança AT/SS (segue o fluxo de faturas, sem alterações). */
  execute(organizationId: OrganizationId, file: { buffer: Buffer; mimeType: string }): Promise<PaymentDocumentImportDTO | null>;
}
