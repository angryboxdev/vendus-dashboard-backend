import type { OrganizationId } from "../../../../../kernel/organization-id.js";
import type { BankSettings, HourCategory, HourCategoryInput, NewEntry, TimeBankEntry } from "../../entities/time-bank.js";
import type { BankDay } from "../../services/posting.js";

export interface Validation {
  employeeId: string;
  workDate: string;
  status: "approved" | "rejected";
  comment: string | null;
  decidedBy: string;
}

export interface TimeBankRepositoryPort {
  listEntries(org: OrganizationId, employeeId: string): Promise<TimeBankEntry[]>;
  /** Movimentos diários repetidos (índice único) são ignorados. */
  insertEntries(org: OrganizationId, entries: NewEntry[]): Promise<TimeBankEntry[]>;
  listValidations(org: OrganizationId, employeeId: string, from: string, to: string): Promise<Validation[]>;
  insertValidation(org: OrganizationId, v: Validation): Promise<Validation | null>;
  listCategories(org: OrganizationId): Promise<HourCategory[]>;
  createCategory(org: OrganizationId, c: HourCategoryInput, by: string): Promise<HourCategory>;
  archiveCategory(org: OrganizationId, id: string): Promise<void>;
}

export interface TimeBankContextPort {
  /** Dias apurados pela assiduidade (máx. 31 por pedido). */
  attendanceDays(org: OrganizationId, employeeId: string, from: string, to: string): Promise<{ timeZone: string; days: BankDay[] }>;
  settingsAt(org: OrganizationId, employeeId: string, date: string): Promise<BankSettings>;
  holidayOn(org: OrganizationId, employeeId: string, date: string): Promise<{ coefficient: number } | null>;
  employeeForUser(org: OrganizationId, userId: string): Promise<string | null>;
  today(org: OrganizationId): Promise<string>;
}

export interface TimeBankAuditPort {
  record(
    org: OrganizationId,
    e: { actor: string; action: string; resourceType: string; resourceId: string | null; before: unknown; after: unknown; reason: string | null },
  ): Promise<void>;
}

/** Períodos fechados (módulo periods): datas congeladas para um colaborador (TK-17). */
export interface PeriodGuardPort {
  closedDates(org: OrganizationId, employeeId: string, from: string, to: string): Promise<Set<string>>;
}
