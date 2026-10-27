import type { OrganizationId } from "../../../../kernel/organization-id.js";
import type { GetPayableSummaryPort } from "../../../payable-entries/domain/ports/in/payable-entry.ports.js";
import type { PayablesSummaryReadPort } from "../../domain/ports/out/payables-summary-read.port.js";

/** Bridges o `GetPayableSummaryPort` do módulo `payable-entries` (D10). Os valores já vêm em cêntimos. */
export class PayableEntriesSummaryAdapter implements PayablesSummaryReadPort {
  constructor(private readonly getPayableSummary: GetPayableSummaryPort) {}

  async summary(organizationId: OrganizationId): Promise<{ dueCents: number; overdueCents: number }> {
    const s = await this.getPayableSummary.execute({ organizationId });
    return { dueCents: s.totalDue, overdueCents: s.totalOverdue };
  }
}
