import type { OrganizationId } from "../../../../kernel/organization-id.js";
import type { InvoicePaymentPort } from "../../domain/ports/out/invoice-payment.port.js";
import type { ReopenInvoiceFromBankPort, SettleInvoiceFromBankPort } from "../../../invoices/domain/ports/in/bank-payment.ports.js";

/** Delega nas portas de entrada do módulo invoices (mesmo padrão dos outros adapters cross-módulo). */
export class InvoicesInvoicePaymentAdapter implements InvoicePaymentPort {
  constructor(
    private readonly settleFromBank: SettleInvoiceFromBankPort,
    private readonly reopenFromBank: ReopenInvoiceFromBankPort,
  ) {}

  async settle(
    organizationId: OrganizationId,
    input: { invoiceId: string; paidAt: string; bankAccountId: string | null; paidByThisReconciliation: boolean },
  ): Promise<void> {
    await this.settleFromBank.execute({ organizationId, ...input });
  }

  async reopen(organizationId: OrganizationId, invoiceId: string): Promise<void> {
    await this.reopenFromBank.execute({ organizationId, invoiceId });
  }
}
