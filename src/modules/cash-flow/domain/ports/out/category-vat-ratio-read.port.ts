import type { OrganizationId } from "../../../../../kernel/organization-id.js";

/** Quantas faturas recentes de cada categoria entram na média do IVA (decisão do utilizador: 10). */
export const CATEGORY_VAT_SAMPLE = 10;

export interface CategoryVatRatioReadPort {
  /**
   * Rácio sem IVA ÷ com IVA das últimas `sample` faturas de cada categoria até `until` (ponderado
   * pelo valor). Categorias sem faturas ficam fora do mapa.
   */
  recentNetRatios(organizationId: OrganizationId, until: string, sample: number): Promise<Map<string, number>>;
}
