import type { OrganizationId } from "../../../../../kernel/organization-id.js";
import type { DemoDataset } from "../../entities/demo-dataset.js";
import type { DemoOrg, DemoSeedSummary } from "../../entities/demo-org.js";
import type { ScenarioPlan } from "../../services/demo-scenario.js";

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

/** Dados vivos da organização demo (só leitura + marcações novas). */
export interface DemoLivePort {
  /** Colaboradores da demo (o e-mail fictício traz a chave do gerador). */
  employees(demoOrg: OrganizationId): Promise<{ id: string; email: string | null; locationId: string | null }[]>;
  /** `client_event_id` das marcações desde o instante (UTC). */
  existingEventIds(demoOrg: OrganizationId, sinceUtc: string): Promise<Set<string>>;
  /** Ausências aprovadas ou pendentes que tocam o período (não se marca ponto nesses dias). */
  absenceDays(demoOrg: OrganizationId, from: string, to: string): Promise<{ employeeId: string; startDate: string; endDate: string }[]>;
  insertPunches(demoOrg: OrganizationId, rows: { employeeId: string; occurredAt: string; segmentType: string; clientEventId: string; locationId: string | null }[]): Promise<number>;
  /** Garante o tipo "Férias (demo)" (organizações demo criadas antes de existir). */
  ensureVacationType(demoOrg: OrganizationId, actor: string): Promise<void>;
}

/** Cenário (escalas e ausências) criado pelos casos de uso dos módulos donos — ligado no server.ts. */
export interface DemoScenarioPort {
  hasScenario(demoOrg: OrganizationId): Promise<boolean>;
  build(demoOrg: OrganizationId, actor: { userId: string; email: string }, plan: ScenarioPlan): Promise<{ rosters: number; approved: number; pending: number }>;
}
