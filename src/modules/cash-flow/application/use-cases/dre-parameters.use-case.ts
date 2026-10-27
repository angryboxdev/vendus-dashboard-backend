import type { DreParameters, ResolvedDreParameters } from "../../domain/entities/dre-parameters.js";
import type { GetDreParametersPort, SaveDreParametersPort } from "../../domain/ports/in/dre-parameters.port.js";
import type { DreParametersRepositoryPort } from "../../domain/ports/out/dre-parameters-repository.port.js";
import type { OrganizationId } from "../../../../kernel/organization-id.js";
import { cashFlowPeriod } from "../../domain/services/cash-flow-period.js";
import { resolveDreParameters, validateDreParameters } from "../../domain/services/dre-parameters.service.js";

const todayIso = () => new Date().toISOString().slice(0, 10);

export class GetDreParametersUseCase implements GetDreParametersPort {
  constructor(
    private readonly repository: DreParametersRepositoryPort,
    private readonly today: () => string = todayIso,
  ) {}

  async execute({ organizationId, year, month }: { organizationId: OrganizationId; year: number; month: number }): Promise<ResolvedDreParameters> {
    cashFlowPeriod(year, month, this.today());
    const { own, previous } = await this.repository.forMonth(organizationId, year, month);
    return resolveDreParameters(own, previous);
  }
}

export class SaveDreParametersUseCase implements SaveDreParametersPort {
  constructor(
    private readonly repository: DreParametersRepositoryPort,
    private readonly today: () => string = todayIso,
  ) {}

  async execute(params: {
    organizationId: OrganizationId;
    year: number;
    month: number;
    parameters: DreParameters;
    updatedBy: string | null;
  }): Promise<ResolvedDreParameters> {
    const { organizationId, year, month, parameters, updatedBy } = params;
    cashFlowPeriod(year, month, this.today());
    const clean: DreParameters = {
      deliverySalesVatPct: parameters.deliverySalesVatPct,
      platformCommissionPct: parameters.platformCommissionPct,
      platformCommissionVatPct: parameters.platformCommissionVatPct,
      commissionOnGross: parameters.commissionOnGross,
      marketingVatPct: parameters.marketingVatPct,
      cardFeePct: parameters.cardFeePct,
      expenseDefaultVatPct: parameters.expenseDefaultVatPct,
      marketingNetCents: {
        uber_eats: parameters.marketingNetCents?.uber_eats ?? 0,
        glovo: parameters.marketingNetCents?.glovo ?? 0,
        bolt_food: parameters.marketingNetCents?.bolt_food ?? 0,
      },
    };
    validateDreParameters(clean);
    await this.repository.save(organizationId, year, month, clean, updatedBy);
    return { ...clean, source: "month" };
  }
}
