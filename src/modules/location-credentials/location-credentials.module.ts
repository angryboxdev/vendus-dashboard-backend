import type { Router } from "express";
import { createScopedQuery } from "../../infra/scoped-db/scoped-query.js";
import { SupabaseLocationRepository } from "../locations/adapters/out/supabase-location.repository.js";
import { SupabasePairingCodeRepository } from "./adapters/out/supabase-pairing-code.repository.js";
import { SupabaseLocationTokenRepository } from "./adapters/out/supabase-location-token.repository.js";
import { GeneratePairingCodeUseCase } from "./application/use-cases/generate-pairing-code.use-case.js";
import { RedeemPairingCodeUseCase } from "./application/use-cases/redeem-pairing-code.use-case.js";
import { ListActiveTokensUseCase } from "./application/use-cases/list-active-tokens.use-case.js";
import { RevokeTokenUseCase } from "./application/use-cases/revoke-token.use-case.js";
import { LocationCredentialController } from "./adapters/in/location-credential.controller.js";

/**
 * Composition root for `location-credentials` (spec E ticket 01). Only this
 * file knows the concrete adapters — the domain and use cases only know
 * `PairingCodeRepositoryPort`/`LocationTokenRepositoryPort`/
 * `LocationRepositoryPort`. Reuses `locations`' own
 * `SupabaseLocationRepository` rather than re-implementing the
 * organization-owns-location check (D11/D19) — both share the same
 * `ScopedQueryFactory`.
 *
 * No route is mounted in `server.ts` by this ticket — the ticket's own text
 * says the module "proves it end-to-end via its own tests," not via live
 * route wiring. `createLocationCredentialsModule()` is ready to be called
 * from `server.ts` in a later ticket the same way `createLocationsModule()`
 * already is.
 */
export function createLocationCredentialsModule(): { adminRouter: Router; deviceRouter: Router } {
  const locationRepository = new SupabaseLocationRepository(createScopedQuery);
  const pairingCodeRepository = new SupabasePairingCodeRepository(createScopedQuery);
  const locationTokenRepository = new SupabaseLocationTokenRepository(createScopedQuery);

  const generatePairingCode = new GeneratePairingCodeUseCase(pairingCodeRepository, locationRepository);
  const redeemPairingCode = new RedeemPairingCodeUseCase(pairingCodeRepository, locationTokenRepository);
  const listActiveTokens = new ListActiveTokensUseCase(locationTokenRepository, locationRepository);
  const revokeToken = new RevokeTokenUseCase(locationTokenRepository);

  const controller = new LocationCredentialController(
    generatePairingCode,
    redeemPairingCode,
    listActiveTokens,
    revokeToken,
  );

  return { adminRouter: controller.adminRouter, deviceRouter: controller.deviceRouter };
}
