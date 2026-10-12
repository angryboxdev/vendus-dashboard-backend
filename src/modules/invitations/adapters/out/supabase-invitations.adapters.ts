import { createHash, randomInt } from "node:crypto";
import { findInvitationScopeByCodeHash } from "../../../../infra/scoped-db/invitation-lookup.js";
import type { ScopedQueryFactory } from "../../../../infra/scoped-db/scoped-query.js";
import type { OrganizationId } from "../../../../kernel/organization-id.js";
import type { Invitation, JoinRequest } from "../../domain/entities/invitation.js";
import type { InvitationCodesPort, InvitationLookupPort, InvitationsRepositoryPort } from "../../domain/ports/out/invitations.ports.js";

type Row = Record<string, unknown>;
type Res = { data: unknown; error: { message: string } | null };
function check<T>(res: Res): T {
  if (res.error) throw new Error(res.error.message);
  return res.data as T;
}
const iso = (v: unknown) => (v === null || v === undefined ? null : new Date(String(v)).toISOString());

const INV = "id, code_hint, location_id, department_id, max_uses, uses, expires_at, status, created_by, created_at, revoked_at";
const REQ = "id, invitation_id, first_name, last_name, email, status, possible_duplicate, reject_reason, decided_by, decided_at, employee_id, created_at";

const toInv = (r: Row): Invitation => ({
  id: String(r.id),
  codeHint: String(r.code_hint),
  locationId: r.location_id ? String(r.location_id) : null,
  departmentId: r.department_id ? String(r.department_id) : null,
  maxUses: r.max_uses === null || r.max_uses === undefined ? null : Number(r.max_uses),
  uses: Number(r.uses),
  expiresAt: iso(r.expires_at)!,
  status: r.status as Invitation["status"],
  createdBy: String(r.created_by),
  createdAt: iso(r.created_at)!,
  revokedAt: iso(r.revoked_at),
});
const toReq = (r: Row): JoinRequest => ({
  id: String(r.id),
  invitationId: String(r.invitation_id),
  firstName: String(r.first_name),
  lastName: String(r.last_name),
  email: String(r.email),
  status: r.status as JoinRequest["status"],
  possibleDuplicate: r.possible_duplicate === true,
  rejectReason: r.reject_reason ? String(r.reject_reason) : null,
  decidedBy: r.decided_by ? String(r.decided_by) : null,
  decidedAt: iso(r.decided_at),
  employeeId: r.employee_id ? String(r.employee_id) : null,
  createdAt: iso(r.created_at)!,
});

export class SupabaseInvitationsRepository implements InvitationsRepositoryPort {
  constructor(private readonly scoped: ScopedQueryFactory) {}

  async list(org: OrganizationId) {
    return check<Row[]>(await this.scoped(org).table("invitations").select(INV).order("created_at", { ascending: false }).limit(200)).map(toInv);
  }
  async get(org: OrganizationId, id: string) {
    const r = check<Row | null>(await this.scoped(org).table("invitations").select(INV).eq("id", id).maybeSingle());
    return r ? toInv(r) : null;
  }
  async create(org: OrganizationId, i: { codeHash: string; codeHint: string; locationId: string | null; departmentId: string | null; maxUses: number | null; expiresAt: string }, by: string) {
    const row = { code_hash: i.codeHash, code_hint: i.codeHint, location_id: i.locationId, department_id: i.departmentId, max_uses: i.maxUses, expires_at: i.expiresAt, created_by: by };
    return toInv(check(await this.scoped(org).table("invitations").insert(row).select(INV).single()));
  }
  async revoke(org: OrganizationId, id: string, at: string) {
    check(await this.scoped(org).table("invitations").update({ status: "revoked", revoked_at: at }).eq("id", id));
  }
  /** Comparar e trocar: só soma se `uses` ainda for o lido (até 3 tentativas). */
  async consumeUse(org: OrganizationId, id: string) {
    for (let attempt = 0; attempt < 3; attempt++) {
      const cur = await this.get(org, id);
      if (!cur || (cur.maxUses !== null && cur.uses >= cur.maxUses)) return false;
      const rows = check<Row[]>(await this.scoped(org).table("invitations").update({ uses: cur.uses + 1 }).eq("id", id).eq("uses", cur.uses).select("id"));
      if (rows.length) return true;
    }
    return false;
  }
  async listRequests(org: OrganizationId) {
    return check<Row[]>(await this.scoped(org).table("join_requests").select(REQ).order("created_at", { ascending: false }).limit(500)).map(toReq);
  }
  async getRequest(org: OrganizationId, id: string) {
    const r = check<Row | null>(await this.scoped(org).table("join_requests").select(REQ).eq("id", id).maybeSingle());
    return r ? toReq(r) : null;
  }
  async createRequest(org: OrganizationId, r: { invitationId: string; firstName: string; lastName: string; email: string; possibleDuplicate: boolean }) {
    const row = { invitation_id: r.invitationId, first_name: r.firstName, last_name: r.lastName, email: r.email, possible_duplicate: r.possibleDuplicate };
    return toReq(check(await this.scoped(org).table("join_requests").insert(row).select(REQ).single()));
  }
  async decide(org: OrganizationId, id: string, from: JoinRequest["status"], p: Partial<Pick<JoinRequest, "status" | "rejectReason" | "decidedBy" | "decidedAt" | "employeeId">>) {
    const row: Row = {};
    if (p.status !== undefined) row.status = p.status;
    if (p.rejectReason !== undefined) row.reject_reason = p.rejectReason;
    if (p.decidedBy !== undefined) row.decided_by = p.decidedBy;
    if (p.decidedAt !== undefined) row.decided_at = p.decidedAt;
    if (p.employeeId !== undefined) row.employee_id = p.employeeId;
    const rows = check<Row[]>(await this.scoped(org).table("join_requests").update(row).eq("id", id).eq("status", from).select("id"));
    return rows.length > 0;
  }
}

/** Sem caracteres ambíguos (0/O, 1/I/L). */
const ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

export class CryptoInvitationCodes implements InvitationCodesPort {
  generate() {
    return Array.from({ length: 10 }, () => ALPHABET[randomInt(ALPHABET.length)]).join("");
  }
  hash(code: string) {
    return createHash("sha256").update(`invitation:${code}`).digest("hex");
  }
}

export class SupabaseInvitationLookup implements InvitationLookupPort {
  findByCodeHash(codeHash: string) {
    return findInvitationScopeByCodeHash(codeHash);
  }
}
