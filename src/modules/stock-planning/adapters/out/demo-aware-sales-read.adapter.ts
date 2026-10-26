import type { OrganizationId } from "../../../../kernel/organization-id.js";
import type { DemandActualRow } from "../../domain/ports/out/demand-actuals-repository.port.js";
import type { DemoSalesSourcePort, VendusSalesReadPort } from "../../domain/ports/out/vendus-sales-read.port.js";

/**
 * Numa organização de demonstração do Stock as vendas vêm do POS fictício e **nunca** da Vendus (a chave da
 * Vendus é global: lê-la numa demo traria vendas reais). Fora de uma demo, segue para o leitor real.
 */
export class DemoAwareSalesReadAdapter implements VendusSalesReadPort {
  constructor(private readonly real: VendusSalesReadPort, private readonly demo: DemoSalesSourcePort) {}

  async fetchDailyActuals(organizationId: OrganizationId, locationId: string, date: string): Promise<DemandActualRow[]> {
    const demoRows = await this.demo.dailyDemand(organizationId, date);
    if (demoRows) return demoRows;
    return this.real.fetchDailyActuals(organizationId, locationId, date);
  }
}
