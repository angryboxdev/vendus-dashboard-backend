import type { OrganizationId } from "../../../../kernel/organization-id.js";
import type { InboxDecision, InboxItem, InboxType } from "../../domain/entities/inbox.js";
import type { InboxActor, InboxSourcePort } from "../../domain/ports/out/inbox.ports.js";

/** Erro de regra como os dos módulos donos (nome *ConflictError + código). */
export class FakeConflictError extends Error {
  constructor(
    message: string,
    readonly code: string,
  ) {
    super(message);
    this.name = "FakeConflictError";
  }
}

export const item = (type: InboxType, id: string, employeeId: string, over: Partial<InboxItem> = {}): InboxItem => ({
  type,
  id,
  employeeId,
  requestedAt: "2026-10-01T09:00:00.000Z",
  title: type,
  detail: "",
  meta: [],
  blockedReason: null,
  level: null,
  ...over,
});

export class FakeSource implements InboxSourcePort {
  decided: { id: string; decision: InboxDecision; comment: string | null }[] = [];
  failWith: Error | null = null;
  constructor(
    readonly type: InboxType,
    readonly permission: string,
    public items: InboxItem[],
  ) {}
  async list(_o: OrganizationId, _a: InboxActor) {
    return this.items.filter((i) => !this.decided.some((d) => d.id === i.id));
  }
  async decide(_o: OrganizationId, _a: InboxActor, it: InboxItem, decision: InboxDecision, comment: string | null) {
    if (this.failWith) throw this.failWith;
    this.decided.push({ id: it.id, decision, comment });
  }
}

export const directory = {
  people: async () => [
    { id: "e-ana", name: "Ana Demo", locationName: "Porto" },
    { id: "e-rui", name: "Rui Demo", locationName: "Braga" },
    { id: "e-me", name: "Gestor Demo", locationName: "Porto" },
  ],
};
