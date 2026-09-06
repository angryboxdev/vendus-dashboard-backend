import type { OrganizationId } from "../../../../../kernel/organization-id.js";

export interface ResolveVendusBootConfigParams {
  organizationId: OrganizationId;
  locationId: string;
}

export interface VendusBootConfig {
  apiKey: string;
  registerId: string;
  eatzPaymentId: number;
  appsPaymentId: number;
  salaoPriceGroupId: number;
  eatzPriceGroupId: number;
}

/**
 * Resolves everything `vendusClient.ts`, `vendus.module.ts` and
 * `cash-closings.module.ts` used to read from `ENV` (D3 of ticket 03's
 * architecture decision), from the database instead. Called once at server
 * boot — see `ResolveVendusBootConfigUseCase` for the fail-fast behaviour.
 */
export interface ResolveVendusBootConfigPort {
  execute(params: ResolveVendusBootConfigParams): Promise<VendusBootConfig>;
}
