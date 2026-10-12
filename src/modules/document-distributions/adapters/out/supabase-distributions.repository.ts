import type { ScopedQueryFactory } from "../../../../infra/scoped-db/scoped-query.js";
import type { OrganizationId } from "../../../../kernel/organization-id.js";
import type { Distribution, DistributionRecipient } from "../../domain/entities/distribution.js";
import type { DistributionsRepositoryPort } from "../../domain/ports/out/distributions.ports.js";

type Row = Record<string, unknown>;
type Res = { data: unknown; error: { message: string } | null };
function check<T>(res: Res): T {
  if (res.error) throw new Error(res.error.message);
  return res.data as T;
}
const iso = (v: unknown) => (v === null || v === undefined ? null : new Date(String(v)).toISOString());

const DIST = "id, title, file_name, storage_path, mime_type, size_bytes, audience, requires_confirmation, status, created_by, created_at";
const REC = "distribution_id, employee_id, user_id, delivered_at, read_at, confirmed_at";
const PAGE = 1000;

const toDist = (r: Row): Distribution & { storagePath: string } => ({
  id: String(r.id),
  title: String(r.title),
  fileName: String(r.file_name),
  storagePath: String(r.storage_path),
  mimeType: String(r.mime_type),
  sizeBytes: Number(r.size_bytes),
  audience: r.audience as Distribution["audience"],
  requiresConfirmation: r.requires_confirmation === true,
  status: r.status as Distribution["status"],
  createdBy: String(r.created_by),
  createdAt: iso(r.created_at)!,
});
const toRec = (r: Row): DistributionRecipient => ({
  distributionId: String(r.distribution_id),
  employeeId: String(r.employee_id),
  userId: r.user_id ? String(r.user_id) : null,
  deliveredAt: iso(r.delivered_at)!,
  readAt: iso(r.read_at),
  confirmedAt: iso(r.confirmed_at),
});
const withoutPath = ({ storagePath: _p, ...d }: Distribution & { storagePath: string }): Distribution => d;

export class SupabaseDistributionsRepository implements DistributionsRepositoryPort {
  constructor(private readonly scoped: ScopedQueryFactory) {}

  async list(org: OrganizationId) {
    return check<Row[]>(await this.scoped(org).table("document_distributions").select(DIST).order("created_at", { ascending: false }).limit(200)).map((r) => withoutPath(toDist(r)));
  }
  async get(org: OrganizationId, id: string) {
    const r = check<Row | null>(await this.scoped(org).table("document_distributions").select(DIST).eq("id", id).maybeSingle());
    return r ? toDist(r) : null;
  }
  async create(org: OrganizationId, d: Omit<Distribution, "id" | "status" | "createdAt"> & { storagePath: string }) {
    const row = { title: d.title, file_name: d.fileName, storage_path: d.storagePath, mime_type: d.mimeType, size_bytes: d.sizeBytes, audience: d.audience, requires_confirmation: d.requiresConfirmation, created_by: d.createdBy };
    return withoutPath(toDist(check(await this.scoped(org).table("document_distributions").insert(row).select(DIST).single())));
  }
  async setStatus(org: OrganizationId, id: string, status: Distribution["status"]) {
    check(await this.scoped(org).table("document_distributions").update({ status }).eq("id", id));
  }
  async insertRecipients(org: OrganizationId, distributionId: string, recipients: { employeeId: string; userId: string | null }[]) {
    for (let i = 0; i < recipients.length; i += PAGE) {
      const chunk = recipients.slice(i, i + PAGE).map((r) => ({ distribution_id: distributionId, employee_id: r.employeeId, user_id: r.userId }));
      check(await this.scoped(org).table("document_distribution_recipients").insert(chunk));
    }
  }
  /** Lê todas as páginas (o PostgREST corta em 1000 linhas). */
  private async paged(build: (from: number, to: number) => PromiseLike<Res>): Promise<DistributionRecipient[]> {
    const out: DistributionRecipient[] = [];
    for (let from = 0; ; from += PAGE) {
      const rows = check<Row[]>(await build(from, from + PAGE - 1));
      out.push(...rows.map(toRec));
      if (rows.length < PAGE) return out;
    }
  }
  async listRecipients(org: OrganizationId, distributionId: string) {
    return this.paged((from, to) => this.scoped(org).table("document_distribution_recipients").select(REC).eq("distribution_id", distributionId).order("employee_id").range(from, to));
  }
  async listAllRecipients(org: OrganizationId, distributionIds: string[]) {
    if (!distributionIds.length) return [];
    return this.paged((from, to) => this.scoped(org).table("document_distribution_recipients").select(REC).in("distribution_id", distributionIds).order("distribution_id").order("employee_id").range(from, to));
  }
  async recipientRows(org: OrganizationId, employeeId: string) {
    return this.paged((from, to) => this.scoped(org).table("document_distribution_recipients").select(REC).eq("employee_id", employeeId).order("distribution_id").range(from, to));
  }
  async mark(org: OrganizationId, distributionId: string, employeeId: string, patch: { readAt?: string; confirmedAt?: string }) {
    const cur = check<Row | null>(await this.scoped(org).table("document_distribution_recipients").select(REC).eq("distribution_id", distributionId).eq("employee_id", employeeId).maybeSingle());
    if (!cur) return null;
    const row: Row = {};
    // A primeira abertura e a primeira confirmação ficam (prova).
    if (patch.readAt && !cur.read_at) row.read_at = patch.readAt;
    if (patch.confirmedAt && !cur.confirmed_at) row.confirmed_at = patch.confirmedAt;
    if (!Object.keys(row).length) return toRec(cur);
    const rows = check<Row[]>(await this.scoped(org).table("document_distribution_recipients").update(row).eq("distribution_id", distributionId).eq("employee_id", employeeId).select(REC));
    return rows[0] ? toRec(rows[0]) : null;
  }
}
