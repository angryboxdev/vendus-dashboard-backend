import type { OrganizationId } from "../../../../../kernel/organization-id.js";
import type { WeeklyDishCost } from "../../entities/weekly-dish-cost.js";

export interface GetDishWeeklyCostCommand {
  organizationId: OrganizationId;
  pizzaId: string;
  /** Semanas até à semana atual (1–104). */
  weeks?: number;
}

/** Custo teórico semanal de uma pizza por tamanho; `null` = pizza inexistente nesta empresa. */
export interface GetDishWeeklyCostPort {
  execute(command: GetDishWeeklyCostCommand): Promise<WeeklyDishCost | null>;
}
