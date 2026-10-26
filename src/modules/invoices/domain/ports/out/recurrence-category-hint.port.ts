import type { OrganizationId } from "../../../../../kernel/organization-id.js";

/**
 * Cross-módulo (recorrências): a sub-categoria que o utilizador deu às recorrências ativas deste
 * fornecedor — usada como sugestão para linhas que nenhuma regra/histórico/IA classificou (ex.:
 * linhas lidas do QR fiscal, sem descrição útil). Só quando todas apontam para a mesma sub-categoria.
 */
export interface RecurrenceCategoryHintPort {
  forSupplier(organizationId: OrganizationId, supplierId: string): Promise<{ categoryId: string; recurrenceName: string } | null>;
}
