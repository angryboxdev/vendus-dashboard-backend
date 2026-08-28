import { UNATTENDED_SCOPE } from "../../../../infra/scoped-db/unattended-scope.js";
import type { BankAccountRepositoryPort } from "../../domain/ports/out/bank-account-repository.port.js";

/**
 * Temporary bridge for bank-statements' cross-module `BankAccountReadPort`
 * (ticket 09, blocked by this one). That port still expects
 * `findByAccountNumber(raw)` / `findById(id)` with no organization
 * parameter — bank-statements hasn't been converted yet, so it has no
 * request-scoped organization of its own to pass down at its composition
 * root.
 *
 * This class re-exposes the now-scoped `BankAccountRepositoryPort` under
 * that older, unscoped shape by supplying the unattended scope's
 * organization. It is not a second escape hatch: every query behind it
 * still goes through the same scoped repository this ticket converted —
 * it's scoped to a fixed organization instead of the caller's. That is a
 * no-op today, because `UNATTENDED_SCOPE.organizationId` is the only
 * organization that exists (spec.md's hard gate on provisioning a second
 * one until the deferred register — including ticket 09 — has landed).
 *
 * Ticket 09 deletes this file: once bank-statements threads its own
 * request organization through, it calls `BankAccountRepositoryPort`
 * directly with that organization, the same way every other converted
 * consumer does.
 */
export class BankAccountCrossModuleReadAdapter {
  constructor(private readonly repo: BankAccountRepositoryPort) {}

  async findByAccountNumber(raw: string): Promise<{ id: string } | null> {
    const account = await this.repo.findByAccountNumber(UNATTENDED_SCOPE.organizationId, raw);
    return account ? { id: account.id } : null;
  }

  async findById(id: string): Promise<{ id: string } | null> {
    const account = await this.repo.findById(UNATTENDED_SCOPE.organizationId, id);
    return account ? { id: account.id } : null;
  }
}
