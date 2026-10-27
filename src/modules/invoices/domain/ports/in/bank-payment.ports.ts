import type { OrganizationId } from "../../../../../kernel/organization-id.js";

/**
 * Pagamento de faturas pela conciliação bancária (para o módulo bank-statements, ligado em server.ts):
 * a fatura conciliada por inteiro fica paga e a conta a pagar e a ocorrência ligadas acompanham, como em
 * «marcar como paga»; ao anular a conciliação, o que a conciliação pagou volta a «por pagar».
 */
export interface SettleInvoiceFromBankCommand {
  organizationId: OrganizationId;
  invoiceId: string;
  /** Data do movimento (YYYY-MM-DD). */
  paidAt: string;
  bankAccountId: string | null;
  /** A fatura não estava paga antes desta conciliação (só então leva a marca «paga pela conciliação»). */
  paidByThisReconciliation: boolean;
}

export interface SettleInvoiceFromBankPort {
  execute(command: SettleInvoiceFromBankCommand): Promise<void>;
}

export interface ReopenInvoiceFromBankCommand {
  organizationId: OrganizationId;
  invoiceId: string;
}

export interface ReopenInvoiceFromBankPort {
  /** Só desfaz se foi a conciliação a pagá-la (nunca um pagamento marcado à mão). `true` se reabriu. */
  execute(command: ReopenInvoiceFromBankCommand): Promise<boolean>;
}
