import type { OrganizationId } from "../../../../../kernel/organization-id.js";
import type { SupplierDTO } from "./supplier.ports.js";
import type { SupplierInvoiceRowDTO, SupplierStatsDTO } from "./supplier-detail.ports.js";

export interface GetSupplierStatementCommand {
  organizationId: OrganizationId;
  id: string;
  startDate?: Date;
  endDate?: Date;
  /** Saldo transitado de antes do período do extrato, em euros (mesma unidade que o resto deste DTO — ver SupplierInvoiceRowDTO). Default 0 — nunca persistido, só afeta este documento. */
  openingBalance?: number;
  /** Saldo real conhecido externamente (ex: extrato do próprio fornecedor), em euros. Quando presente e diferente do saldo documental, gera uma linha de fecho "Conciliação final" pelo valor da diferença. */
  informedFinalBalance?: number;
}

/**
 * Uma linha da "conta corrente": um documento (fatura/nota de crédito) ou um
 * evento sintético (pagamento real já registado, ou o fecho manual contra o
 * saldo informado). Nunca persistido — calculado a cada pedido de extrato.
 * Valores em euros, como o resto deste DTO.
 */
export interface StatementLineDTO {
  date: string | null; // YYYY-MM-DD — null só na linha de fecho manual ("-" no PDF)
  documentNumber: string | null; // nº da fatura/NC, ou rótulo ("Conciliação final") nas linhas sintéticas
  kind: "invoice" | "credit_note" | "payment" | "settlement";
  /** Preenchido só quando kind === "invoice". */
  invoicedAmount: number | null;
  /** Preenchido em credit_note/payment/settlement — sempre reduz o saldo. */
  creditOrSettlementAmount: number | null;
  runningBalance: number;
}

export interface SupplierStatementDTO {
  supplier: SupplierDTO;
  /** Stats calculados sobre o conjunto filtrado de faturas (não sobre o histórico completo). */
  stats: SupplierStatsDTO;
  invoices: SupplierInvoiceRowDTO[];
  /** Período do extrato (undefined = histórico completo). */
  period: { startDate: Date | null; endDate: Date | null };
  openingBalance: number;
  lines: StatementLineDTO[];
  totalInvoiced: number;
  totalCreditNotes: number;
  totalMovement: number;
  /** Saldo depois de documentos + pagamentos reais, antes de qualquer fecho manual. */
  netDocumentBalanceBeforeSettlement: number;
  /** Saldo final da conta — depois do fecho manual, quando existir. */
  finalBalance: number;
  isReconciled: boolean;
  documentCounts: { invoices: number; creditNotes: number };
}

export interface GetSupplierStatementPort {
  execute(command: GetSupplierStatementCommand): Promise<SupplierStatementDTO>;
}
