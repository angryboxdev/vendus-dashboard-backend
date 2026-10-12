import type { OrganizationId } from "../../../../../kernel/organization-id.js";
import type { ReminderContract, ReminderDay } from "../../services/reminders.service.js";

/** O que os avisos leem dos outros módulos (ligado no server.ts). */
export interface RemindersSourcesPort {
  today(org: OrganizationId): Promise<string>;
  employees(org: OrganizationId): Promise<{ id: string; name: string }[]>;
  /** O dia da pessoa tal como a assiduidade o apura (planeado vs. real). */
  day(org: OrganizationId, employeeId: string, date: string): Promise<ReminderDay>;
  settings(org: OrganizationId, employeeId: string, date: string): Promise<{ key: string; value: unknown }[]>;
  contracts(org: OrganizationId, employeeId: string): Promise<ReminderContract[]>;
  employeeUser(org: OrganizationId, employeeId: string): Promise<string | null>;
  directManagerUsers(org: OrganizationId, employeeId: string, date: string): Promise<string[]>;
  adminUsers(org: OrganizationId): Promise<string[]>;
}

/** Centro de notificações (só na aplicação — D12); a chave evita repetições. */
export interface RemindersNotifierPort {
  notify(org: OrganizationId, userIds: string[], n: { title: string; body: string; link: string; dedupeKey: string }): Promise<void>;
}
