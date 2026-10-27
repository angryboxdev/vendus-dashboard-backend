import type { OrganizationId } from "../../../../kernel/organization-id.js";
import type { RecurrenceRuleTarget, RecurrenceRuleTargetPort } from "../../domain/ports/out/recurrence-rule-target.port.js";
import type {
  GetRecurrenceForBankRulePort,
  SettleRecurrenceFromBankPort,
} from "../../../payable-recurrences/domain/ports/in/bank-payment.ports.js";

/** Delega nas portas de entrada do módulo payable-recurrences (mesmo padrão dos outros adapters cross-módulo). */
export class PayableRecurrencesRuleTargetAdapter implements RecurrenceRuleTargetPort {
  constructor(
    private readonly getRecurrence: GetRecurrenceForBankRulePort,
    private readonly settleRecurrence: SettleRecurrenceFromBankPort,
  ) {}

  async describe(organizationId: OrganizationId, recurrenceId: string): Promise<RecurrenceRuleTarget | null> {
    const r = await this.getRecurrence.execute({ organizationId, recurrenceId });
    return r && { id: r.id, name: r.name, status: r.status, requireInvoice: r.requireInvoice };
  }

  async settle(
    organizationId: OrganizationId,
    input: { recurrenceId: string; movementId: string; paidAt: string; bankAccountId: string | null },
  ): Promise<{ occurrenceId: string; paidNow: boolean } | null> {
    const r = await this.settleRecurrence.execute({ organizationId, ...input });
    return r.result === "not_applicable" ? null : { occurrenceId: r.occurrenceId, paidNow: r.result === "paid" };
  }
}
