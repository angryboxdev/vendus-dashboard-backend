import type { OrganizationId } from "../../../../../kernel/organization-id.js";
import type { AirMenuMonthStatus, DateRange, SalesAnalysisData, SalesForecast, SourceSelection } from "../../entities/sales-analysis.js";

/** Dados da página para um período (máx. 12 meses). Nunca chama a AirMenu. */
export interface GetSalesAnalysisPort {
  execute(input: { organizationId: OrganizationId; range: DateRange; source: SourceSelection }): Promise<SalesAnalysisData>;
}

/** Busca UM mês da AirMenu (em segundo plano) e guarda os dias fechados. */
export interface FetchAirMenuMonthPort {
  execute(input: { organizationId: OrganizationId; month: string }): Promise<AirMenuMonthStatus>;
}

/** Previsão (IA) do resto do mês corrente. null = ainda não há histórico guardado suficiente. */
export interface GetSalesForecastPort {
  execute(input: { organizationId: OrganizationId; source: SourceSelection }): Promise<{ status: "ready"; forecast: SalesForecast } | { status: "pending"; missingDays: number }>;
}
