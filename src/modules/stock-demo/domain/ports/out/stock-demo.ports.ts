import type { OrganizationId } from "../../../../../kernel/organization-id.js";
import type { PosProduct, StockDemoLink, StockDemoScenario } from "../../entities/stock-demo.js";

/** Ligações empresa real → organização fictícia de cada cenário (`stock_demo_organizations`). */
export interface StockDemoRepositoryPort {
  listForRealOrg(realOrg: OrganizationId): Promise<StockDemoLink[]>;
  findByScenario(realOrg: OrganizationId, scenario: StockDemoScenario): Promise<StockDemoLink | null>;
  /** Pela organização fictícia (as rotas em demonstração já trocaram para ela). `null` = não é uma demo do Stock. */
  findByDemoOrg(demoOrg: OrganizationId): Promise<StockDemoLink | null>;
}

/** Produtos do POS fictício de uma organização de demonstração: pratos mapeados por referência + PVP. */
export interface PosCatalogReadPort {
  listProducts(demoOrg: OrganizationId): Promise<PosProduct[]>;
}
