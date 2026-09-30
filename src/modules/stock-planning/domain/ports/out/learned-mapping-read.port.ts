import type { OrganizationId } from "../../../../../kernel/organization-id.js";

export interface LearnedPackagingSnapshot {
  supplierId: string;
  stockItemId: string;
  conversionFactor: number;
  purchaseUnit: string;
}

/**
 * D10 → `stock_review_learned_mappings` (tabela do módulo
 * `stock-purchase-review`, reaproveitada como fonte de embalagem/conversão
 * — secção 51, nunca duplicada). Lida diretamente por `ScopedQuery` (a
 * mesma tabela partilhada, já registada em `table-registry.ts`) em vez de
 * via um port exportado por `stock-purchase-review.module.ts`, porque esse
 * módulo não expõe hoje a sua repository de mapeamento aprendido como uma
 * porta pública e alterá-lo está fora do âmbito aprovado desta ronda — ver
 * README "Design decisions". Esta consulta é nova (por `stock_item_id`,
 * nunca por referência/descrição de fatura) — não duplica `suggest()`.
 */
export interface LearnedMappingReadPort {
  /** A embalagem mais recentemente usada para este par fornecedor×item; `null` quando nunca foi aprendida (nunca inventa). */
  findPackaging(organizationId: OrganizationId, supplierId: string, stockItemId: string): Promise<LearnedPackagingSnapshot | null>;
  /** Melhor fornecedor conhecido para o item (todas as embalagens aprendidas, para comparação de preço normalizada por unidade base — secções 53-56). */
  findAllForItem(organizationId: OrganizationId, stockItemId: string): Promise<LearnedPackagingSnapshot[]>;
}
