import type { OrganizationId } from "../../../../kernel/organization-id.js";
import type { OccurrencePaymentPort } from "../../domain/ports/out/occurrence-payment.port.js";
import { OccurrenceRequiresInvoiceError } from "../../domain/errors.js";
import type {
  ReopenOccurrenceFromBankPort,
  SettleOccurrenceFromBankPort,
} from "../../../payable-recurrences/domain/ports/in/bank-payment.ports.js";

/** Delega nas portas de entrada do módulo payable-recurrences (mesmo padrão dos outros adapters cross-módulo). */
export class PayableRecurrencesOccurrencePaymentAdapter implements OccurrencePaymentPort {
  constructor(
    private readonly settleFromBank: SettleOccurrenceFromBankPort,
    private readonly reopenFromBank: ReopenOccurrenceFromBankPort,
  ) {}

  async settle(organizationId: OrganizationId, input: { occurrenceId: string; movementId: string; paidAt: string; bankAccountId: string | null }): Promise<void> {
    const result = await this.settleFromBank.execute({ organizationId, ...input });
    if (result === "invoice_required") throw new OccurrenceRequiresInvoiceError(input.occurrenceId);
  }

  async reopen(organizationId: OrganizationId, input: { occurrenceId: string; movementId: string }): Promise<void> {
    await this.reopenFromBank.execute({ organizationId, ...input });
  }
}
