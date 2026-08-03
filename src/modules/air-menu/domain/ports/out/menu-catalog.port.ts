import type { AirMenuMenuItem } from "../../entities/air-menu-menu-item.js";

export interface MenuCatalogPort {
  /** Devolve um mapa PLU → AirMenuMenuItem para a enterprise indicada. */
  getMenuItems(enterpriseId: string): Promise<Map<string, AirMenuMenuItem>>;
}
