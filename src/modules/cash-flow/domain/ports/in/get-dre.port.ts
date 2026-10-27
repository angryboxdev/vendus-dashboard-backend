import type { OrganizationId } from "../../../../../kernel/organization-id.js";
import type { DreReport } from "../../entities/dre.js";

/** DRE do mês a partir da conciliação bancária (Mapa de rentabilidade). */
export interface GetDrePort {
  /**
   * `withRestaurantSales: false` → sem as vendas do restaurante (Vendus, a parte lenta): custos,
   * plataformas e ajustes chegam em segundos e o relatório diz `restaurantSalesLoaded: false`.
   */
  execute(params: { organizationId: OrganizationId; year: number; month: number; withRestaurantSales?: boolean }): Promise<DreReport>;
}
