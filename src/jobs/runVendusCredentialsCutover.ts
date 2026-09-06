/**
 * One-time cutover script (org-integration-credentials spec, ticket 03):
 * reads the current Vendus environment variable values, encrypts the API
 * key (ticket 01's helper), and upserts Angrybox's rows into
 * `vendus_credentials` and `vendus_location_config` — the two tables the
 * `vendus` module now reads its config from instead of `VENDUS_API_KEY`,
 * `VENDUS_REGISTER_ID`/`UBER_EATS_VENDUS_REGISTER_ID` and the four
 * price-group/payment-ID env vars.
 *
 * Reads the source values directly from `process.env`, not from `ENV`
 * (`src/config/env.ts`) — this is the one-time migration path off those env
 * vars, run once before the four vars are actually deleted from the
 * deployment; `ENV` itself no longer carries them. The price-group/
 * payment-ID defaults below match the ones `env.ts` used to hardcode
 * (Angry Box's installation).
 *
 * Uso:
 *   npx tsx src/jobs/runVendusCredentialsCutover.ts
 *   npm run build && npm run vendus:credentials-cutover
 *
 * Run once per environment (local stack for verification, then again for
 * the real target once this ticket deploys) — safe to re-run: both writes
 * are upserts.
 */
import "../config/env.js";
import { createScopedQuery } from "../infra/scoped-db/scoped-query.js";
import { UNATTENDED_SCOPE } from "../infra/scoped-db/unattended-scope.js";
import { SupabaseVendusCredentialsAdapter } from "../modules/vendus/adapters/out/supabase-vendus-credentials.adapter.js";
import { SupabaseVendusLocationConfigAdapter } from "../modules/vendus/adapters/out/supabase-vendus-location-config.adapter.js";

function mustEnv(value: string | undefined, name: string): string {
  if (!value) throw new Error(`Missing env var: ${name}`);
  return value;
}

async function main() {
  const apiKey = mustEnv(process.env.VENDUS_API_KEY, "VENDUS_API_KEY");
  const registerId = mustEnv(
    process.env.VENDUS_REGISTER_ID ?? process.env.UBER_EATS_VENDUS_REGISTER_ID,
    "VENDUS_REGISTER_ID (ou UBER_EATS_VENDUS_REGISTER_ID)",
  );
  const eatzPaymentId = Number(process.env.VENDUS_EATZ_PAYMENT_ID ?? 275787588);
  const appsPaymentId = Number(process.env.VENDUS_APPS_PAYMENT_ID ?? 355967761);
  const salaoPriceGroupId = Number(process.env.VENDUS_PRICE_GROUP_SALAO ?? 275787593);
  const eatzPriceGroupId = Number(process.env.VENDUS_PRICE_GROUP_EATZ ?? 290759644);

  const credentialsAdapter = new SupabaseVendusCredentialsAdapter(createScopedQuery);
  const locationConfigAdapter = new SupabaseVendusLocationConfigAdapter(createScopedQuery);

  await credentialsAdapter.save(UNATTENDED_SCOPE.organizationId, { apiKey });
  await locationConfigAdapter.save(UNATTENDED_SCOPE.organizationId, UNATTENDED_SCOPE.locationId, {
    registerId,
    eatzPaymentId,
    appsPaymentId,
    salaoPriceGroupId,
    eatzPriceGroupId,
  });

  console.log(
    JSON.stringify(
      {
        organizationId: UNATTENDED_SCOPE.organizationId,
        locationId: UNATTENDED_SCOPE.locationId,
        registerId,
        eatzPaymentId,
        appsPaymentId,
        salaoPriceGroupId,
        eatzPriceGroupId,
        apiKey: "<encrypted, not printed>",
      },
      null,
      2,
    ),
  );
}

main()
  .then(() => process.exit(0))
  .catch((err: unknown) => {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  });
