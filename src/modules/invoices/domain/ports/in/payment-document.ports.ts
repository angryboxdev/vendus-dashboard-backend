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

export interface CreateObligationDraftCommand {
  organizationId: OrganizationId;
  fileBuffer: Buffer;
  filename: string;
  mimeType: string;
  /** A pessoa viu o registo parecido e quer mesmo criar outro. */
  force?: boolean;
}

/** E3b-2: rascunho de obrigação (sem IVA, linhas nem Stock) a partir de um documento de cobrança. */
export interface CreateObligationDraftPort {
  execute(command: CreateObligationDraftCommand): Promise<import("./invoice.ports.js").InvoiceImportResultDTO>;
}

/** Ligar o documento de cobrança a um registo já existente (passa a obrigação; nada é criado). */
export interface LinkObligationCommand {
  organizationId: OrganizationId;
  invoiceId: string;
  fileBuffer: Buffer;
  filename: string;
  mimeType: string;
  actor: string;
}

export interface LinkObligationPort {
  execute(command: LinkObligationCommand): Promise<import("./invoice.ports.js").InvoiceDTO>;
}

export interface ReadPaymentDocumentPort {
  /** null = não é um documento de cobrança AT/SS (segue o fluxo de faturas, sem alterações). */
  execute(organizationId: OrganizationId, file: { buffer: Buffer; mimeType: string }): Promise<PaymentDocumentImportDTO | null>;
}
