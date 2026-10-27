import type { CashFlowToHandle } from "../../domain/entities/cash-flow.js";
import type { GetCashFlowToHandlePort } from "../../domain/ports/in/get-cash-flow-to-handle.port.js";
import type { InvoicesToReviewReadPort } from "../../domain/ports/out/invoices-to-review-read.port.js";
import type { OrganizationId } from "../../../../kernel/organization-id.js";
import type { PayablesSummaryReadPort } from "../../domain/ports/out/payables-summary-read.port.js";

export class GetCashFlowToHandleUseCase implements GetCashFlowToHandlePort {
  constructor(
    private readonly payables: PayablesSummaryReadPort,
    private readonly invoicesToReview: InvoicesToReviewReadPort,
  ) {}

  async execute({ organizationId }: { organizationId: OrganizationId }): Promise<CashFlowToHandle> {
    const [payables, invoicesToReview] = await Promise.all([
      this.payables.summary(organizationId),
      this.invoicesToReview.count(organizationId),
    ]);
    return { payables, invoicesToReview };
  }
}
