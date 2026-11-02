import type { OrganizationId } from "../../../../kernel/organization-id.js";
import type { PositionAuditPort, PositionHoldersPort } from "../../domain/ports/out/position.ports.js";

/** Colaboradores fictícios: só o cargo e se está ativo. */
export class FakePositionHolders implements PositionHoldersPort {
  rows = new Map<string, { positionId: string | null; active: boolean }[]>();
  seed(org: OrganizationId, positionId: string | null, active = true) {
    this.rows.set(org, [...(this.rows.get(org) ?? []), { positionId, active }]);
  }
  async list(org: OrganizationId) {
    return [...(this.rows.get(org) ?? [])];
  }
}

export class FakePositionAudit implements PositionAuditPort {
  entries: Parameters<PositionAuditPort["record"]>[0][] = [];
  async record(entry: Parameters<PositionAuditPort["record"]>[0]) {
    this.entries.push(entry);
  }
}
