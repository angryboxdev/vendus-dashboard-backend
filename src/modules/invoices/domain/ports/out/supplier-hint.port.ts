import type { OrganizationId } from "../../../../../kernel/organization-id.js";
import type { SupplierSummary } from "./supplier-lookup.port.js";

/**
 * Port para guardar e recuperar associações confirmadas entre nomes extraídos
 * pela IA e fornecedores reais. Permite que confirmações manuais passadas
 * sirvam de sugestão em importações futuras com o mesmo fornecedor.
 */
export interface SupplierHintPort {
  /** Procura hint por nome normalizado (match exacto). */
  findByNormalizedName(organizationId: OrganizationId, normalizedName: string): Promise<SupplierSummary | null>;

  /**
   * Persiste (ou incrementa contador de) uma associação nome→fornecedor.
   * @param normalizedName Nome já normalizado via normalizeSupplierName().
   * @param supplierId     ID do fornecedor confirmado pelo utilizador.
   */
  save(organizationId: OrganizationId, normalizedName: string, supplierId: string): Promise<void>;
}
