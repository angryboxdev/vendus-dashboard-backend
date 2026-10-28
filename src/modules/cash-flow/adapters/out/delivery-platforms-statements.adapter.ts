import type { OrganizationId } from "../../../../kernel/organization-id.js";
import type { GetPlatformMarginReportPort } from "../../../delivery-platforms/domain/ports/in/platform-margin-report.port.js";
import type { DeliveryStatementResult } from "../../domain/entities/dre.js";
import type { DeliveryStatementsReadPort } from "../../domain/ports/out/delivery-statements-read.port.js";

/**
 * Bridges o relatório de margem do módulo `delivery-platforms` (D10): cada plataforma com extratos no
 * mês, já repartidos pelo mês. O IVA das taxas que não são comissão vai com o marketing.
 */
export class DeliveryPlatformsStatementsAdapter implements DeliveryStatementsReadPort {
  constructor(private readonly getReport: GetPlatformMarginReportPort) {}

  async forMonth(organizationId: OrganizationId, year: number, month: number): Promise<DeliveryStatementResult[]> {
    const report = await this.getReport.execute({ organizationId, year, month });
    return report.platforms.map((p) => ({
      platform: p.platform,
      salesGrossCents: p.salesGrossCents,
      salesNetCents: p.salesNetCents,
      salesVatCents: p.salesVatCents,
      promotionsNetCents: p.promotionsNetCents,
      commissionNetCents: p.commissionNetCents,
      commissionVatCents: p.commissionVatCents,
      marketingNetCents: p.marketingNetCents,
      marketingVatCents: p.feesVatCents - p.commissionVatCents,
      otherNetCents: p.otherNetCents,
    }));
  }
}
