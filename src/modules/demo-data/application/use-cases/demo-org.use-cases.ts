import { DateTime } from "luxon";
import type { OrganizationId } from "../../../../kernel/organization-id.js";
import { DemoOrgError, type DemoOrg } from "../../domain/entities/demo-org.js";
import type { DemoOrgRepositoryPort, DemoOrgSupportPort, DemoSeedPort } from "../../domain/ports/out/demo-org.ports.js";
import { generateDemoDataset } from "../../domain/services/demo-dataset.generator.js";

const SEED = 20261012;
const EMPLOYEES_PER_CENTER = 5;
const HISTORY_DAYS = 28;
/** Cache curto da ligação real → demo (lida em cada pedido em modo Demonstração). */
const CACHE_MS = 60_000;

export class DemoOrgUseCases {
  private readonly cache = new Map<string, { at: number; demo: DemoOrg | null }>();

  constructor(
    private readonly repo: DemoOrgRepositoryPort,
    private readonly seeder: DemoSeedPort,
    private readonly support: DemoOrgSupportPort,
    private readonly now: () => number = () => Date.now(),
  ) {}

  async status(realOrg: OrganizationId) {
    const demo = await this.repo.demoOf(realOrg);
    return { exists: !!demo, name: demo?.name ?? null };
  }

  /** Para o middleware: a organização demo ligada a esta organização real (ou null). */
  async resolve(realOrg: OrganizationId): Promise<OrganizationId | null> {
    const hit = this.cache.get(realOrg);
    if (hit && this.now() - hit.at < CACHE_MS) return hit.demo?.id ?? null;
    const demo = await this.repo.demoOf(realOrg);
    this.cache.set(realOrg, { at: this.now(), demo });
    return demo?.id ?? null;
  }

  /**
   * Criar a organização de demonstração e carregar os dados fictícios
   * (centros, cargos, horários, colaboradores, contratos, marcações das
   * últimas 4 semanas, feriados de PT, tipos de ausência).
   */
  async create(realOrg: OrganizationId, actor: { email: string; isAdmin: boolean }) {
    if (!actor.isAdmin) throw new DemoOrgError("Só um Admin pode criar a organização de demonstração.", "admin_only");
    const real = await this.repo.organization(realOrg);
    if (!real) throw new DemoOrgError("Organização não encontrada.", "not_found");
    if (real.isDemo) throw new DemoOrgError("Esta já é uma organização de demonstração.", "is_demo");
    if (await this.repo.demoOf(realOrg)) throw new DemoOrgError("A organização de demonstração já existe.", "already_exists");

    const demo = await this.repo.createDemo(realOrg, { name: `${real.name} — Demonstração`, nif: `DEMO-${realOrg.slice(0, 8).toUpperCase()}` });
    this.cache.delete(realOrg);
    const today = await this.support.today(realOrg);
    const to = DateTime.fromISO(today, { zone: "utc" }).minus({ days: 1 }).toISODate()!;
    const from = DateTime.fromISO(today, { zone: "utc" }).minus({ days: HISTORY_DAYS }).toISODate()!;
    const dataset = generateDemoDataset({ seed: SEED, employeesPerCenter: EMPLOYEES_PER_CENTER, from, to });
    const summary = await this.seeder.seed(demo.id, dataset, { actor: actor.email, year: Number(today.slice(0, 4)) });
    await this.support.audit(realOrg, { actor: actor.email, action: "demo.organization.create", resourceId: demo.id, after: { name: demo.name, ...summary } });
    return { demo, summary };
  }
}
