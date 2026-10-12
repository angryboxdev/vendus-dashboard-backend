import type { OrganizationId } from "../../../../../kernel/organization-id.js";
import type { DemoDataset } from "../../entities/demo-dataset.js";
import type { DemoOrg, DemoSeedSummary } from "../../entities/demo-org.js";

export interface DemoOrgRepositoryPort {
  organization(org: OrganizationId): Promise<{ name: string; isDemo: boolean } | null>;
  demoOf(realOrg: OrganizationId): Promise<DemoOrg | null>;
  /** Cria a organização demo ligada à real (is_demo = true, demo_of = real). */
  createDemo(realOrg: OrganizationId, input: { name: string; nif: string }): Promise<DemoOrg>;
}

/** Grava o conjunto sintético na organização demo (recusa se não for demo). */
export interface DemoSeedPort {
  seed(demoOrg: OrganizationId, dataset: DemoDataset, opts: { actor: string; year: number }): Promise<DemoSeedSummary>;
}

export interface DemoOrgSupportPort {
  today(org: OrganizationId): Promise<string>;
  audit(org: OrganizationId, e: { actor: string; action: string; resourceId: string; after: unknown }): Promise<void>;
}
