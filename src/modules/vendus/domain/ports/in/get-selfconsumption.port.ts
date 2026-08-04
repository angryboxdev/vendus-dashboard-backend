import type { VendusSelfConsumptionResult } from "../../entities/vendus-selfconsumption.js";

export interface GetSelfConsumptionParams {
  since: string;
  until: string;
}

export interface GetSelfConsumptionPort {
  execute(params: GetSelfConsumptionParams): Promise<VendusSelfConsumptionResult>;
}
