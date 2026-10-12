import type { OrganizationId } from "../../../../kernel/organization-id.js";
import {
  INBOX_TYPES,
  itemKey,
  MAX_BATCH,
  MIN_REJECT_REASON,
  type DecisionResult,
  type InboxDecision,
  type InboxItem,
  type InboxRow,
  type InboxSegment,
  type InboxType,
} from "../../domain/entities/inbox.js";
import type { InboxActor, InboxDirectoryPort, InboxSourcePort } from "../../domain/ports/out/inbox.ports.js";

export class InboxValidationError extends Error {
  constructor(
    message: string,
    readonly field: string,
  ) {
    super(message);
    this.name = "InboxValidationError";
  }
}

export interface InboxViewer {
  actor: InboxActor;
  /** Permissão do perfil (READ/MANAGE). */
  can: (permission: string, level: "READ" | "MANAGE") => boolean;
  /** Âmbito RE-34. */
  canSee: (employeeId: string) => Promise<boolean>;
  canPrivate: boolean;
}

/** Erros de regra dos outros módulos (mostrados ao utilizador); os restantes são internos. */
const RULE_ERROR = /(Validation|Conflict|Forbidden|NotFound|Rule|Blocked)Error$|^WorkspaceError$/;
const DAY = 86_400_000;

export class InboxUseCases {
  constructor(
    private readonly sources: InboxSourcePort[],
    private readonly directory: InboxDirectoryPort,
    private readonly now: () => number = () => Date.now(),
  ) {}

  /** Tipos que o utilizador vê (permissão de leitura do tipo). */
  private visible(viewer: InboxViewer) {
    return this.sources.filter((s) => viewer.can(s.permission, "READ"));
  }

  private async rows(org: OrganizationId, viewer: InboxViewer, sources: InboxSourcePort[]): Promise<InboxRow[]> {
    const people = await this.directory.people(org);
    const seen = new Map<string, boolean>();
    const inScope: string[] = [];
    for (const p of people) {
      const ok = await viewer.canSee(p.id);
      seen.set(p.id, ok);
      if (ok) inScope.push(p.id);
    }
    const byId = new Map(people.map((p) => [p.id, p]));
    const lists = await Promise.all(sources.map((s) => s.list(org, viewer.actor, { canPrivate: viewer.canPrivate, employeeIds: inScope }).then((items) => ({ s, items }))));
    const out: InboxRow[] = [];
    for (const { s, items } of lists) {
      const manage = viewer.can(s.permission, "MANAGE");
      for (const it of items) {
        if (!seen.get(it.employeeId)) continue;
        const blocked = it.blockedReason ?? (manage ? null : "no_permission");
        const person = byId.get(it.employeeId);
        out.push({
          ...it,
          blockedReason: blocked,
          key: itemKey(it.type, it.id),
          employeeName: person?.name ?? "",
          locationName: person?.locationName ?? null,
          ageDays: Math.max(0, Math.floor((this.now() - Date.parse(it.requestedAt)) / DAY)),
          canDecide: blocked === null,
        });
      }
    }
    // Mais antigos primeiro (RE-24: o que espera há mais tempo não fica esquecido).
    return out.sort((a, b) => a.requestedAt.localeCompare(b.requestedAt));
  }

  async list(org: OrganizationId, viewer: InboxViewer, filter: { type: InboxType | null; segment: InboxSegment }) {
    const sources = this.visible(viewer);
    const all = await this.rows(org, viewer, sources);
    const counters = Object.fromEntries(
      sources.map((s) => {
        const of = all.filter((r) => r.type === s.type);
        return [s.type, { mine: of.filter((r) => r.canDecide).length, others: of.filter((r) => !r.canDecide).length }];
      }),
    ) as Partial<Record<InboxType, { mine: number; others: number }>>;
    const items = all.filter((r) => (!filter.type || r.type === filter.type) && (filter.segment === "all" || (filter.segment === "mine") === r.canDecide));
    return { types: INBOX_TYPES.filter((t) => sources.some((s) => s.type === t)), counters, items };
  }

  /**
   * Decidir um ou vários pedidos. Cada pedido é revalidado (âmbito, permissão,
   * ainda pendente, pode decidir) e decidido pela regra do seu módulo; o
   * resultado vem por pedido — um erro não trava os outros.
   */
  async decide(org: OrganizationId, viewer: InboxViewer, keys: string[], decision: InboxDecision, comment: string | null): Promise<DecisionResult[]> {
    const unique = [...new Set(keys)];
    if (unique.length === 0) throw new InboxValidationError("Escolha pelo menos um pedido.", "items");
    if (unique.length > MAX_BATCH) throw new InboxValidationError(`No máximo ${MAX_BATCH} pedidos de cada vez.`, "items");
    const reason = comment?.trim() || null;
    if (decision === "reject" && (!reason || reason.length < MIN_REJECT_REASON)) throw new InboxValidationError(`Indique o motivo da recusa (mínimo ${MIN_REJECT_REASON} caracteres).`, "comment");
    if (reason && reason.length > 500) throw new InboxValidationError("O comentário tem no máximo 500 caracteres.", "comment");

    const types = new Set(unique.map((k) => k.split(":")[0] as InboxType));
    const sources = this.visible(viewer).filter((s) => types.has(s.type));
    const rows = new Map((await this.rows(org, viewer, sources)).map((r) => [r.key, r]));
    const results: DecisionResult[] = [];
    for (const key of unique) {
      const row = rows.get(key);
      if (!row) {
        results.push({ key, ok: false, code: "not_found", message: "Pedido não encontrado ou já decidido." });
        continue;
      }
      if (!row.canDecide) {
        results.push({ key, ok: false, code: row.blockedReason ?? "forbidden", message: BLOCKED[row.blockedReason ?? "no_permission"] });
        continue;
      }
      const source = this.sources.find((s) => s.type === row.type)!;
      try {
        await source.decide(org, viewer.actor, row as InboxItem, decision, reason);
        results.push({ key, ok: true });
      } catch (e) {
        if (e instanceof Error && RULE_ERROR.test(e.name)) results.push({ key, ok: false, code: (e as { code?: string }).code ?? "rule", message: e.message });
        else throw e;
      }
    }
    return results;
  }
}

const BLOCKED: Record<"own" | "not_current_level" | "no_permission", string> = {
  own: "Pedido seu: decide o nível seguinte ou o aprovador de recurso.",
  not_current_level: "Este pedido está noutro nível ou com outro aprovador.",
  no_permission: "Sem permissão para decidir este tipo de pedido.",
};
