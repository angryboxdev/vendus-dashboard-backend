import type { OrganizationId } from "../../../../kernel/organization-id.js";
import { DEMO_POS_NAME, STOCK_DEMO_SCENARIO_LABELS, type StockDemoScenario } from "../../domain/entities/stock-demo.js";
import {
  StockDemoForbiddenError,
  StockDemoNotCreatedError,
  type CreateStockDemoPort,
  type ResetStockDemoPort,
  type StockDemoSeedResultDTO,
} from "../../domain/ports/in/stock-demo.ports.js";
import type { StockDemoForecastPort, StockDemoProvisioningPort, StockDemoRepositoryPort, StockDemoSeederPort } from "../../domain/ports/out/stock-demo.ports.js";
import { buildStockDemoPlan } from "../../domain/services/demo-plan.service.js";
import { unit } from "../../domain/services/pos-sales.service.js";
import { STOCK_DEMO_SCENARIO_DEFS, STOCK_DEMO_SEEDS } from "../../domain/services/scenarios/index.js";

/** Hoje no fuso de Lisboa (YYYY-MM-DD). */
export function lisbonToday(now: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Lisbon", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}

/** Semeia o cenário na organização fictícia e calcula a previsão de reposição. */
async function seedScenario(
  deps: { seeder: StockDemoSeederPort; forecast: StockDemoForecastPort },
  demoOrg: OrganizationId,
  scenario: StockDemoScenario,
  seed: number,
  today: string,
): Promise<Omit<StockDemoSeedResultDTO, "created" | "scenario">> {
  const def = STOCK_DEMO_SCENARIO_DEFS[scenario];
  const locationId = await deps.seeder.ensureLocation(demoOrg, def.locationName);
  const plan = buildStockDemoPlan(def, { seed, today, locationId });
  await deps.seeder.insertPlan(demoOrg, plan);
  let forecast: "ok" | "failed" = "ok";
  try {
    await deps.forecast.run(demoOrg);
  } catch {
    forecast = "failed";
  }
  return { summary: plan.summary, forecast };
}

export class CreateStockDemoUseCase implements CreateStockDemoPort {
  constructor(
    private readonly repo: StockDemoRepositoryPort,
    private readonly provisioning: StockDemoProvisioningPort,
    private readonly seeder: StockDemoSeederPort,
    private readonly forecast: StockDemoForecastPort,
    private readonly onChanged: (realOrg: OrganizationId) => void = () => {},
    private readonly today: () => string = () => lisbonToday(),
  ) {}

  async execute(command: { realOrgId: OrganizationId; isAdmin: boolean; actor: string; scenario: StockDemoScenario }): Promise<StockDemoSeedResultDTO> {
    if (!command.isAdmin) throw new StockDemoForbiddenError("A demonstração do Stock está disponível só para Admins.");
    const { realOrgId, scenario } = command;
    if (await this.repo.findByScenario(realOrgId, scenario)) return { scenario, created: false, summary: null, forecast: "ok" };
    const real = await this.provisioning.realOrgInfo(realOrgId);
    if (!real) throw new Error("Empresa não encontrada.");
    const def = STOCK_DEMO_SCENARIO_DEFS[scenario];
    const seed = STOCK_DEMO_SEEDS[scenario];
    const demoOrgId = await this.provisioning.createOrganization({
      name: `${real.name} — Demonstração do Stock: ${STOCK_DEMO_SCENARIO_LABELS[scenario]}`,
      nif: `DEMO-STK-${scenario.toUpperCase()}-${realOrgId.slice(0, 8)}`,
      timezone: real.timezone,
    });
    // Chave fictícia do POS fictício: só a pista é guardada e mostrada (não existe chave real nenhuma).
    const hint = `demo-pos-••••${Math.floor(unit(seed, `${realOrgId}:${scenario}:key`) * 0xffff).toString(16).toUpperCase().padStart(4, "0")}`;
    await this.provisioning.insertLink({ realOrgId, scenario, demoOrgId, seed, monthlySalesTargetCents: def.monthlySales * 100, posName: DEMO_POS_NAME, posApiKeyHint: hint, createdBy: command.actor });
    this.onChanged(realOrgId);
    const result = await seedScenario({ seeder: this.seeder, forecast: this.forecast }, demoOrgId, scenario, seed, this.today());
    return { scenario, created: true, ...result };
  }
}

export class ResetStockDemoUseCase implements ResetStockDemoPort {
  constructor(
    private readonly repo: StockDemoRepositoryPort,
    private readonly seeder: StockDemoSeederPort,
    private readonly forecast: StockDemoForecastPort,
    private readonly today: () => string = () => lisbonToday(),
  ) {}

  async execute(command: { realOrgId: OrganizationId; isAdmin: boolean; scenario: StockDemoScenario }): Promise<StockDemoSeedResultDTO> {
    if (!command.isAdmin) throw new StockDemoForbiddenError("A demonstração do Stock está disponível só para Admins.");
    const link = await this.repo.findByScenario(command.realOrgId, command.scenario);
    if (!link) throw new StockDemoNotCreatedError("Este cenário de demonstração ainda não foi criado.");
    await this.seeder.wipe(link.demoOrgId);
    const result = await seedScenario({ seeder: this.seeder, forecast: this.forecast }, link.demoOrgId, command.scenario, link.seed, this.today());
    return { scenario: command.scenario, created: false, ...result };
  }
}
