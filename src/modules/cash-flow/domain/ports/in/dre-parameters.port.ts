import type { OrganizationId } from "../../../../../kernel/organization-id.js";
import type { DreParameters, ResolvedDreParameters } from "../../entities/dre-parameters.js";

/** Parâmetros da DRE de um mês (próprios, herdados ou de omissão). */
export interface GetDreParametersPort {
  execute(params: { organizationId: OrganizationId; year: number; month: number }): Promise<ResolvedDreParameters>;
}

/** Grava os parâmetros da DRE de um mês (taxas e marketing das plataformas). */
export interface SaveDreParametersPort {
  execute(params: {
    organizationId: OrganizationId;
    year: number;
    month: number;
    parameters: DreParameters;
    updatedBy: string | null;
  }): Promise<ResolvedDreParameters>;
}
