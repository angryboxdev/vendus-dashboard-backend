import type { OrganizationId } from "../../../../../kernel/organization-id.js";
import type { CoverageGap, DashboardLayout, DashboardPerson, DashboardRequest } from "../../entities/dashboard.js";

/**
 * Quem consulta, já com o seu âmbito (Tenant + AccessGrant + Scope) aplicado
 * pelas fontes canónicas. Ligado no server.ts.
 */
export interface DashboardViewer {
  userId: string;
  /** Painel de hoje (Overview): só pessoas visíveis, ausências privadas já mascaradas. */
  people(): Promise<{ today: string; people: DashboardPerson[]; holidays: { date: string; name: string }[] }>;
  /** Pedidos pendentes da Caixa de pedidos que esta pessoa vê. */
  requests(): Promise<DashboardRequest[]>;
  /** Permissão de ver a data de nascimento (campo `personal.birth_date`). */
  canSeeBirthdays: boolean;
  canSee(employeeId: string, date: string): Promise<boolean>;
}

/** Fontes por organização (Escalas + Horários + Ausências; Pessoas). */
export interface DashboardSourcesPort {
  /** Dia seguinte no fuso da organização. */
  tomorrowOf(today: string): string;
  /**
   * Pessoas que deviam trabalhar (horário) e não têm turno publicado na escala
   * do seu centro (só centros com escala ativa), sem ausência nem feriado.
   */
  coverage(org: OrganizationId, employees: { id: string; name: string; locationId: string | null }[], from: string, to: string): Promise<CoverageGap[]>;
  /** Colaboradores ativos com data de nascimento (o ano nunca sai do caso de uso). */
  birthDates(org: OrganizationId): Promise<{ employeeId: string; name: string; locationName: string | null; birthDate: string | null }[]>;
}

export interface DashboardLayoutRepositoryPort {
  get(org: OrganizationId, userId: string, dashboardKey: string): Promise<DashboardLayout | null>;
  save(org: OrganizationId, userId: string, dashboardKey: string, layout: DashboardLayout): Promise<void>;
  remove(org: OrganizationId, userId: string, dashboardKey: string): Promise<void>;
}

/** Métricas com cache e invalidação próprias. */
export type DashboardMetric = "PEOPLE" | "REQUESTS" | "COVERAGE";

/**
 * Cache de agregados (nunca fonte de verdade). Chaves isoladas por
 * organização, contexto, dia, métrica, versão e quem consulta.
 */
export interface DashboardCachePort {
  getOrLoad<T>(key: { org: OrganizationId; metric: DashboardMetric; date: string; viewer: string; context: string }, ttlMs: number, load: () => Promise<T>): Promise<{ value: T; hit: boolean }>;
  invalidate(org: OrganizationId, metrics: DashboardMetric[]): void;
}
