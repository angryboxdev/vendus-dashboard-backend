import type { ScopedQueryFactory } from "../../../../infra/scoped-db/scoped-query.js";
import type { OrganizationId } from "../../../../kernel/organization-id.js";
import type { HourCategory, HourCategoryInput, NewEntry, TimeBankEntry } from "../../domain/entities/time-bank.js";
import type { TimeBankRepositoryPort, Validation } from "../../domain/ports/out/time-bank.ports.js";

type Row = Record<string, unknown>;
type Res = { data: unknown; error: { message: string; code?: string } | null };
function check<T>(res: Res): T {
  if (res.error) throw new Error(res.error.message);
  return res.data as T;
}
const str = (v: unknown) => (v === null || v === undefined ? null : String(v));

const ENT = "id, employee_id, kind, seconds, work_date, posted_on, payment_month, reason, created_by, created_at";
const VAL = "employee_id, work_date, status, comment, decided_by";
const CAT = "id, name, valid_from, valid_to, windows, factor, archived";

const toEntry = (r: Row): TimeBankEntry => ({
  id: String(r.id),
  employeeId: String(r.employee_id),
  kind: r.kind as TimeBankEntry["kind"],
  seconds: Number(r.seconds),
  workDate: String(r.work_date),
  postedOn: String(r.posted_on),
  paymentMonth: str(r.payment_month),
  reason: String(r.reason),
  createdBy: String(r.created_by),
  createdAt: new Date(String(r.created_at)).toISOString(),
});
const toVal = (r: Row): Validation => ({ employeeId: String(r.employee_id), workDate: String(r.work_date), status: r.status as Validation["status"], comment: str(r.comment), decidedBy: String(r.decided_by) });
const toCat = (r: Row): HourCategory => ({
  id: String(r.id),
  name: String(r.name),
  validFrom: String(r.valid_from),
  validTo: str(r.valid_to),
  windows: (Array.isArray(r.windows) ? r.windows : []) as HourCategory["windows"],
  factor: r.factor === null || r.factor === undefined ? null : Number(r.factor),
  archived: r.archived === true,
});

export class SupabaseTimeBankRepository implements TimeBankRepositoryPort {
  constructor(private readonly scoped: ScopedQueryFactory) {}

  async listEntries(org: OrganizationId, employeeId: string) {
    const rows = check<Row[]>(await this.scoped(org).table("time_bank_entries").select(ENT).eq("employee_id", employeeId).order("work_date").order("created_at"));
    return rows.map(toEntry);
  }

  async insertEntries(org: OrganizationId, entries: NewEntry[]) {
    const out: TimeBankEntry[] = [];
    // Um a um: um movimento diário repetido (corrida entre duas sincronizações) é ignorado.
    for (const e of entries) {
      const row = { employee_id: e.employeeId, kind: e.kind, seconds: e.seconds, work_date: e.workDate, posted_on: e.postedOn, payment_month: e.paymentMonth, reason: e.reason, created_by: e.createdBy };
      const res = (await this.scoped(org).table("time_bank_entries").insert(row).select(ENT).single()) as Res;
      if (res.error?.code === "23505") continue;
      out.push(toEntry(check(res)));
    }
    return out;
  }

  async listValidations(org: OrganizationId, employeeId: string, from: string, to: string) {
    return check<Row[]>(await this.scoped(org).table("time_bank_validations").select(VAL).eq("employee_id", employeeId).gte("work_date", from).lte("work_date", to)).map(toVal);
  }

  async insertValidation(org: OrganizationId, v: Validation) {
    const row = { employee_id: v.employeeId, work_date: v.workDate, status: v.status, comment: v.comment, decided_by: v.decidedBy };
    const res = (await this.scoped(org).table("time_bank_validations").insert(row).select(VAL).single()) as Res;
    if (res.error?.code === "23505") return null;
    return toVal(check(res));
  }

  async listCategories(org: OrganizationId) {
    return check<Row[]>(await this.scoped(org).table("hour_categories").select(CAT).order("name")).map(toCat);
  }

  async createCategory(org: OrganizationId, c: HourCategoryInput, by: string) {
    const row = { name: c.name, valid_from: c.validFrom, valid_to: c.validTo, windows: c.windows, factor: c.factor, created_by: by };
    return toCat(check(await this.scoped(org).table("hour_categories").insert(row).select(CAT).single()));
  }

  async archiveCategory(org: OrganizationId, id: string) {
    check(await this.scoped(org).table("hour_categories").update({ archived: true }).eq("id", id));
  }
}
