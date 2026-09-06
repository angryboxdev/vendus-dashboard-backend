import type {
  ResolveVendusBootConfigPort,
  ResolveVendusBootConfigParams,
  VendusBootConfig,
} from "../../domain/ports/in/resolve-vendus-boot-config.port.js";
import type { VendusCredentialsPort } from "../../domain/ports/out/vendus-credentials.port.js";
import type { VendusLocationConfigPort } from "../../domain/ports/out/vendus-location-config.port.js";

/**
 * Boot-time resolution (org-integration-credentials spec, ticket 03):
 * replaces `VENDUS_API_KEY`/`VENDUS_REGISTER_ID`/the four price-group and
 * payment-method env vars as the source of the module's Vendus config.
 * Called once, at server startup, before any route is mounted — not a
 * per-request use case, and not exposed via any controller.
 *
 * Fails loudly (throws) if either the organization's credentials or the
 * location's config is missing: a silently half-configured production boot
 * is worse than a crash — same fail-fast spirit as `must(...)` in
 * `src/config/env.ts`. The one-time seed/cutover script is what guarantees
 * these rows exist before this ever runs without the old env vars.
 */
export class ResolveVendusBootConfigUseCase implements ResolveVendusBootConfigPort {
  constructor(
    private readonly credentials: VendusCredentialsPort,
    private readonly locationConfig: VendusLocationConfigPort,
  ) {}

  async execute({ organizationId, locationId }: ResolveVendusBootConfigParams): Promise<VendusBootConfig> {
    const credentialsResult = await this.credentials.getByOrganization(organizationId);
    if (credentialsResult.status === "not_configured") {
      throw new Error(`Vendus credentials not configured for organization ${organizationId}`);
    }

    const configResult = await this.locationConfig.getByOrganizationAndLocation(organizationId, locationId);
    if (configResult.status === "not_configured") {
      throw new Error(
        `Vendus location config not configured for organization ${organizationId}, location ${locationId}`,
      );
    }

    return {
      apiKey: credentialsResult.credentials.apiKey,
      registerId: configResult.config.registerId,
      eatzPaymentId: configResult.config.eatzPaymentId,
      appsPaymentId: configResult.config.appsPaymentId,
      salaoPriceGroupId: configResult.config.salaoPriceGroupId,
      eatzPriceGroupId: configResult.config.eatzPriceGroupId,
    };
  }
}
