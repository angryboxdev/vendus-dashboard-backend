import { randomUUID } from "crypto";
import type { OrganizationId } from "../../../../kernel/organization-id.js";
import { ForecastRun } from "../../domain/entities/forecast-run.js";
import type {
  ForecastDemandPointRow,
  ForecastRunRepositoryPort,
  ForecastStockRequirementRow,
  ReplenishmentRecommendationDTO,
  SaveForecastRunResultCommand,
} from "../../domain/ports/out/forecast-run-repository.port.js";

export class FakeForecastRunRepository implements ForecastRunRepositoryPort {
  runs = new Map<string, ForecastRun>();
  demandPointsByRun = new Map<string, ForecastDemandPointRow[]>();
  stockRequirementsByRun = new Map<string, ForecastStockRequirementRow[]>();
  recommendationsByRun = new Map<string, ReplenishmentRecommendationDTO[]>();

  async insertRun(_organizationId: OrganizationId, run: ForecastRun): Promise<void> {
    this.runs.set(run.id, run);
  }

  async saveRunResult(command: SaveForecastRunResultCommand): Promise<void> {
    for (const existing of this.runs.values()) {
      if (existing.id !== command.run.id && existing.toProps().locationId === command.run.toProps().locationId && existing.toProps().isLatest) {
        this.runs.set(existing.id, ForecastRun.reconstitute({ ...existing.toProps(), isLatest: false }));
      }
    }
    this.runs.set(command.run.id, command.run);
    this.demandPointsByRun.set(command.run.id, command.demandPoints);
    this.stockRequirementsByRun.set(command.run.id, command.stockRequirements);
    this.recommendationsByRun.set(
      command.run.id,
      command.recommendations.map((r) => ({ ...r, id: randomUUID(), runId: command.run.id })),
    );
  }

  async markRunFailed(_organizationId: OrganizationId, run: ForecastRun): Promise<void> {
    this.runs.set(run.id, run);
  }

  async findLatestRun(organizationId: OrganizationId, locationId: string): Promise<ForecastRun | null> {
    return (
      [...this.runs.values()].find((r) => r.toProps().organizationId === organizationId && r.toProps().locationId === locationId && r.toProps().isLatest) ?? null
    );
  }

  async findRunById(organizationId: OrganizationId, runId: string): Promise<ForecastRun | null> {
    const run = this.runs.get(runId) ?? null;
    return run && run.toProps().organizationId === organizationId ? run : null;
  }

  async findStockRequirements(_organizationId: OrganizationId, runId: string, stockItemId: string): Promise<ForecastStockRequirementRow[]> {
    return (this.stockRequirementsByRun.get(runId) ?? []).filter((r) => r.stockItemId === stockItemId);
  }

  async findDemandPointsForRun(_organizationId: OrganizationId, runId: string): Promise<ForecastDemandPointRow[]> {
    return this.demandPointsByRun.get(runId) ?? [];
  }

  async findRecommendations(_organizationId: OrganizationId, runId: string): Promise<ReplenishmentRecommendationDTO[]> {
    return this.recommendationsByRun.get(runId) ?? [];
  }

  async findRecommendationById(_organizationId: OrganizationId, recommendationId: string): Promise<ReplenishmentRecommendationDTO | null> {
    for (const list of this.recommendationsByRun.values()) {
      const found = list.find((r) => r.id === recommendationId);
      if (found) return found;
    }
    return null;
  }

  async listPastRuns(organizationId: OrganizationId, locationId: string, limit: number): Promise<ForecastRun[]> {
    return [...this.runs.values()]
      .filter((r) => r.toProps().organizationId === organizationId && r.toProps().locationId === locationId)
      .sort((a, b) => b.toProps().generatedAt.getTime() - a.toProps().generatedAt.getTime())
      .slice(0, limit);
  }
}
