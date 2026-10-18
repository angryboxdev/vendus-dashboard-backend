import type { OrganizationId } from "../../../../kernel/organization-id.js";
import type { BankSettings, HourCategory, HourCategoryInput, NewEntry, TimeBankEntry } from "../../domain/entities/time-bank.js";
import { DAILY_KINDS } from "../../domain/entities/time-bank.js";
import type { TimeBankContextPort, TimeBankRepositoryPort, Validation } from "../../domain/ports/out/time-bank.ports.js";
import type { BankDay } from "../../domain/services/posting.js";

let seq = 0;
const nextId = () => `00000000-0000-4000-a000-${String(++seq).padStart(12, "0")}`;

export class FakeTimeBankRepository implements TimeBankRepositoryPort {
  entries: TimeBankEntry[] = [];
  validations: Validation[] = [];
  categories: HourCategory[] = [];
  private readonly syncKeys = new Set<string>();
  private clock = 0;

  async listEntries(_o: OrganizationId, employeeId: string) {
    return this.entries.filter((e) => e.employeeId === employeeId).map((e) => ({ ...e }));
  }
  async insertEntries(_o: OrganizationId, entries: NewEntry[]) {
    const out: TimeBankEntry[] = [];
    for (const e of entries) {
      if (DAILY_KINDS.includes(e.kind) && this.entries.some((x) => x.employeeId === e.employeeId && x.workDate === e.workDate && x.kind === e.kind)) continue;
      // Como o índice time_bank_sync_key_uq: a mesma chave de sincronização só grava uma vez.
      if (e.syncKey && this.syncKeys.has(`${e.employeeId}|${e.syncKey}`)) continue;
      if (e.syncKey) this.syncKeys.add(`${e.employeeId}|${e.syncKey}`);
      const row = { ...e, id: nextId(), createdAt: new Date(Date.UTC(2026, 0, 1) + ++this.clock * 1000).toISOString() };
      this.entries.push(row);
      out.push({ ...row });
    }
    return out;
  }
  async listValidations(_o: OrganizationId, employeeId: string, from: string, to: string) {
    return this.validations.filter((v) => v.employeeId === employeeId && v.workDate >= from && v.workDate <= to);
  }
  async insertValidation(_o: OrganizationId, v: Validation) {
    if (this.validations.some((x) => x.employeeId === v.employeeId && x.workDate === v.workDate)) return null;
    this.validations.push(v);
    return v;
  }
  async listCategories() {
    return this.categories.map((c) => ({ ...c }));
  }
  async createCategory(_o: OrganizationId, c: HourCategoryInput) {
    const row = { ...c, id: nextId(), archived: false };
    this.categories.push(row);
    return row;
  }
  async archiveCategory(_o: OrganizationId, id: string) {
    this.categories.find((c) => c.id === id)!.archived = true;
  }
}

export const DEFAULT_SETTINGS: BankSettings = {
  period: "closed_month",
  excessValidation: false,
  compensateBeyondBalance: false,
  paidAnnualLimitHours: null,
  paidAfterLimit: false,
  expiryDays: null,
  holidayMode: "leave_days",
  employeeSeesHistory: false,
};

export class FakeTimeBankContext implements TimeBankContextPort {
  today_ = "2026-10-11";
  /** Excedente por dia (segundos); dias ausentes = 0. */
  excess = new Map<string, number>();
  segments = new Map<string, BankDay["segments"]>();
  worked = new Map<string, number>();
  settings: (date: string) => BankSettings = () => DEFAULT_SETTINGS;
  holidays = new Map<string, number>();
  users = new Map([["u-boss", "e9"], ["u-emp", "e1"]]);

  async attendanceDays(_o: OrganizationId, _e: string, from: string, to: string) {
    const days: BankDay[] = [];
    for (let d = new Date(`${from}T00:00:00Z`); d.toISOString().slice(0, 10) <= to; d.setUTCDate(d.getUTCDate() + 1)) {
      const date = d.toISOString().slice(0, 10);
      const excess = this.excess.get(date) ?? 0;
      days.push({ workDate: date, workedSeconds: this.worked.get(date) ?? Math.max(0, 8 * 3600 + excess), excessSeconds: excess, segments: this.segments.get(date) ?? [] });
    }
    return { timeZone: "Europe/Lisbon", days };
  }
  async settingsAt(_o: OrganizationId, _e: string, date: string) {
    return this.settings(date);
  }
  async holidayOn(_o: OrganizationId, _e: string, date: string) {
    const c = this.holidays.get(date);
    return c === undefined ? null : { coefficient: c };
  }
  async employeeForUser(_o: OrganizationId, userId: string) {
    return this.users.get(userId) ?? null;
  }
  async today() {
    return this.today_;
  }
}

export class FakeTimeBankAudit {
  actions: string[] = [];
  async record(_o: OrganizationId, e: { action: string }) {
    this.actions.push(e.action);
  }
}
