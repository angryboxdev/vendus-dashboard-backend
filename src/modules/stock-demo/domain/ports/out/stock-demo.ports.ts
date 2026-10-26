import type { OrganizationId } from "../../../../../kernel/organization-id.js";
import type { PosProduct, StockDemoLink, StockDemoScenario } from "../../entities/stock-demo.js";
import type { StockDemoPlan } from "../../services/demo-plan.service.js";

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

/** Criação da organização fictícia e da ligação ao cenário (não-scoped, só para a demonstração do Stock). */
export interface StockDemoProvisioningPort {
  realOrgInfo(realOrg: OrganizationId): Promise<{ name: string; timezone: string | null } | null>;
  createOrganization(input: { name: string; nif: string; timezone: string | null }): Promise<OrganizationId>;
  insertLink(link: Omit<StockDemoLink, "createdAt"> & { createdBy: string }): Promise<void>;
}

/** Gravação do cenário na organização fictícia. Recusa organizações que não sejam demos do Stock. */
export interface StockDemoSeederPort {
  ensureLocation(demoOrg: OrganizationId, name: string): Promise<string>;
  insertPlan(demoOrg: OrganizationId, plan: StockDemoPlan): Promise<void>;
  /** Apaga os dados do Stock da organização fictícia (para recomeçar). */
  wipe(demoOrg: OrganizationId): Promise<void>;
}

/** Previsão e recomendações de reposição da organização fictícia (módulo stock-planning). */
export interface StockDemoForecastPort {
  run(demoOrg: OrganizationId): Promise<void>;
}
