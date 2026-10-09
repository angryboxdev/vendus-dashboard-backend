import type { OrganizationId } from "../../../../../kernel/organization-id.js";
import type { Absence } from "../../entities/absence.js";

export interface LeaveBalanceRecord {
  daysEntitled: number;
  daysCarriedOver: number;
}

/** Férias & Ausências 2.0 — `hr_leave_requests` no padrão novo (lê também canceladas). */
export interface AbsenceRepositoryPort {
  /** Ausências que intersectam [from, to], ativas e canceladas. */
  findInRange(organizationId: OrganizationId, from: string, to: string): Promise<Absence[]>;
  findById(organizationId: OrganizationId, id: string): Promise<Absence | null>;
  /** Só ativas de um colaborador que intersectam [from, to]. */
  findActiveForEmployee(organizationId: OrganizationId, employeeId: string, from: string, to: string): Promise<Absence[]>;
  create(organizationId: OrganizationId, absence: Absence): Promise<Absence>;
  update(organizationId: OrganizationId, absence: Absence): Promise<Absence>;
  /** Saldo de férias registado para o ano (null = ainda não definido). */
  findBalance(organizationId: OrganizationId, employeeId: string, year: number): Promise<LeaveBalanceRecord | null>;
  /** Todos os saldos registados no ano, por colaborador. */
  findBalances(organizationId: OrganizationId, year: number): Promise<Map<string, LeaveBalanceRecord>>;
  /** Cria ou atualiza o saldo do colaborador no ano. */
  saveBalance(organizationId: OrganizationId, employeeId: string, year: number, balance: LeaveBalanceRecord): Promise<void>;
}
