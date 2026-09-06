import type { ScopedQueryFactory } from "../../../../infra/scoped-db/scoped-query.js";
import { findPairingCodeRowByCode, type PairingCodeRow } from "../../../../infra/scoped-db/pairing-code-lookup.js";
import { mintOrganizationId } from "../../../../kernel/organization-id.js";
import { PairingCode } from "../../domain/entities/pairing-code.js";
import type { PairingCodeRepositoryPort } from "../../domain/ports/out/pairing-code-repository.port.js";

function toEntity(row: PairingCodeRow): PairingCode {
  return PairingCode.reconstitute({
    id: row.id,
    organizationId: mintOrganizationId(row.orgId),
    locationId: row.locationId,
    code: row.code,
    expiresAt: new Date(row.expiresAt),
    burnedAt: row.burnedAt ? new Date(row.burnedAt) : null,
    createdAt: new Date(row.createdAt),
    description: row.description,
  });
}

/**
 * `save` always knows the organization already (either freshly generated,
 * or re-saved after `burn()` on a code loaded via `findByCode`), so it goes
 * through `ScopedQuery` like every other write in the codebase. `findByCode`
 * cannot — a screen redeeming a code has no organization to scope by yet —
 * so it goes through the named unscoped door in `src/infra/scoped-db/`
 * instead of holding a raw client here (module README: "Integration-test
 * approach").
 */
export class SupabasePairingCodeRepository implements PairingCodeRepositoryPort {
  constructor(private readonly scopedQuery: ScopedQueryFactory) {}

  async save(pairingCode: PairingCode): Promise<void> {
    const { error } = await this.scopedQuery(pairingCode.organizationId)
      .table("pairing_codes")
      .upsert(
        {
          id: pairingCode.id,
          location_id: pairingCode.locationId,
          code: pairingCode.code,
          expires_at: pairingCode.expiresAt.toISOString(),
          burned_at: pairingCode.burnedAt ? pairingCode.burnedAt.toISOString() : null,
          description: pairingCode.description,
        },
        { onConflict: "id" },
      );
    if (error) throw new Error(error.message);
  }

  async findByCode(code: string): Promise<PairingCode | null> {
    const row = await findPairingCodeRowByCode(code);
    return row ? toEntity(row) : null;
  }
}
