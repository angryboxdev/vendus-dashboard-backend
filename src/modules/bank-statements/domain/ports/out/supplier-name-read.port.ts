import type { OrganizationId } from "../../../../../kernel/organization-id.js";

export interface SupplierNameSnapshot {
  id: string;
  name: string;
}

/**
 * D10 — leitura fina do fornecedor (só `id`/`name`) a partir de
 * `financial-base`, usada como último sinal de identificação de fornecedor
 * na liquidação agrupada (secção 6 da task: reutilizar mecanismos já
 * existentes, nunca criar um segundo cadastro/aprendizagem de fornecedor).
 */
export interface SupplierNameReadPort {
  listActive(organizationId: OrganizationId): Promise<SupplierNameSnapshot[]>;
}
