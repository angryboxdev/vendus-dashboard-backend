/**
 * Job: one-time cutover of AirMenu credentials/config from environment
 * variables into the database (org-integration-credentials spec, ticket 04).
 * Non-interactive — reads `process.env` directly, not prompts, unlike
 * `runOrganizationProvisioning.ts` — this script has exactly one target
 * (Angrybox, via `UNATTENDED_SCOPE`) and one source of truth for its inputs
 * (the current environment), so there's nothing to ask interactively.
 *
 * `import "../config/env.js"` first, for the dotenv side-effect only — NOT
 * for `ENV.AIRMENU_*`, which by the time this script matters no longer
 * exists on `ENV` (this ticket removes those fields). Every AirMenu value
 * below is read straight off `process.env`.
 *
 * Idempotent — safe to re-run: both adapter `upsert` calls use `onConflict`,
 * so re-running with the same env values just overwrites the same rows.
 * Encryption (AES-256-GCM, `src/infra/crypto/encryption.ts`) happens inside
 * `SupabaseAirMenuCredentialsRepository.upsert` itself, symmetric with
 * `getByOrganization`'s decrypt-on-read — this script only ever handles
 * plaintext read from `process.env` and hands it to the adapter.
 *
 * Uso:
 *   npm run airmenu:cutover-credentials:dev
 * Prod (depois de `npm run build`): npm run airmenu:cutover-credentials
 */
import "../config/env.js";
import { createScopedQuery } from "../infra/scoped-db/scoped-query.js";
import { UNATTENDED_SCOPE } from "../infra/scoped-db/unattended-scope.js";
import { SupabaseAirMenuCredentialsRepository } from "../modules/air-menu/adapters/out/supabase-air-menu-credentials.repository.js";
import { SupabaseAirMenuLocationConfigRepository } from "../modules/air-menu/adapters/out/supabase-air-menu-location-config.repository.js";

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value || value.trim() === "") {
    throw new Error(`Missing env var: ${name} (required for the AirMenu credentials cutover)`);
  }
  return value;
}

async function main() {
  const apiKey = requireEnv("AIRMENU_API_KEY");
  const username = requireEnv("AIRMENU_USERNAME");
  const password = requireEnv("AIRMENU_PASSWORD");

  const credentialsRepository = new SupabaseAirMenuCredentialsRepository(createScopedQuery);
  await credentialsRepository.upsert(UNATTENDED_SCOPE.organizationId, { apiKey, username, password });
  console.log(`AirMenu credentials upserted for org ${UNATTENDED_SCOPE.organizationId}.`);

  const closingEnterpriseId = process.env.AIRMENU_CLOSING_ENTERPRISE_ID;
  if (!closingEnterpriseId || closingEnterpriseId.trim() === "") {
    console.log(
      "AIRMENU_CLOSING_ENTERPRISE_ID not set — skipping airmenu_location_config (delivery totals stay null in cash closings, same as today).",
    );
    return;
  }

  const locationConfigRepository = new SupabaseAirMenuLocationConfigRepository(createScopedQuery);
  await locationConfigRepository.upsert(UNATTENDED_SCOPE.organizationId, UNATTENDED_SCOPE.locationId, {
    closingEnterpriseId,
  });
  console.log(
    `AirMenu location config upserted for org ${UNATTENDED_SCOPE.organizationId}, location ${UNATTENDED_SCOPE.locationId}.`,
  );
}

main()
  .then(() => process.exit(0))
  .catch((err: unknown) => {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  });
