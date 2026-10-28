import type { OrganizationId } from "../../../../kernel/organization-id.js";
import type { PayoutReconciliation } from "../../domain/entities/payout-reconciliation.js";
import { InvalidStatementPeriodError } from "../../domain/errors.js";
import type { GetPayoutReconciliationPort } from "../../domain/ports/in/payout-reconciliation.port.js";
import type { PlatformBankCreditsReadPort } from "../../domain/ports/out/platform-bank-credits.port.js";
import type { PlatformStatementRepositoryPort } from "../../domain/ports/out/platform-statement-repository.port.js";
import { buildPayoutReconciliation, PAYOUT_WINDOW_DAYS } from "../../domain/services/payout-reconciliation.service.js";

const pad = (n: number) => String(n).padStart(2, "0");
const shift = (iso: string, days: number) => {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
};

export class GetPayoutReconciliationUseCase implements GetPayoutReconciliationPort {
  constructor(
    private readonly statements: PlatformStatementRepositoryPort,
    private readonly credits: PlatformBankCreditsReadPort,
  ) {}

  async execute({ organizationId, year, month }: { organizationId: OrganizationId; year: number; month: number }): Promise<PayoutReconciliation> {
    if (!Number.isInteger(year) || year < 2000 || year > 2100 || !Number.isInteger(month) || month < 1 || month > 12) {
      throw new InvalidStatementPeriodError();
    }
    const from = `${year}-${pad(month)}-01`;
    const to = `${year}-${pad(month)}-${pad(new Date(Date.UTC(year, month, 0)).getUTCDate())}`;
    // Um pagamento de uma semana do mês pode vir no extrato do mês seguinte (pago já nesse mês).
    const [statements, credits, bankCoverageTo] = await Promise.all([
      this.statements.listOverlapping(organizationId, shift(from, -31), shift(to, 31)),
      this.credits.credits(organizationId, from, shift(to, PAYOUT_WINDOW_DAYS)),
      this.credits.lastBookingDate(organizationId),
    ]);
    return buildPayoutReconciliation(year, month, statements, credits, bankCoverageTo);
  }
}
