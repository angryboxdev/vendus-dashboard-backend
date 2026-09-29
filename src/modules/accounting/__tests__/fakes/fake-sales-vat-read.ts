import type { OrganizationId } from "../../../../kernel/organization-id.js";
import type { SalesVatRateStatsDTO, SalesVatReadPort } from "../../domain/ports/out/sales-vat-read.port.js";

export class FakeSalesVatRead implements SalesVatReadPort {
  rows: SalesVatRateStatsDTO[] = [];

  async getVatByRate(_organizationId: OrganizationId, _from: string, _to: string): Promise<SalesVatRateStatsDTO[]> {
    return this.rows;
  }
}
