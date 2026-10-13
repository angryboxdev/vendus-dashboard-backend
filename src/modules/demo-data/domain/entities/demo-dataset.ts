/**
 * Conjunto de dados sintéticos para a organização de demonstração (ADR-0021).
 * Tudo é fictício: nomes combinados ao acaso, e-mails em `.invalid`
 * (RFC 6761, nunca entregáveis), sem NIF/NISS/IBAN/morada. Cada registo tem
 * `synthetic: true` para nunca se confundir com dados reais.
 */

export type CountryCode = "PT" | "ES";

export interface DemoTenant {
  key: string;
  name: string;
  synthetic: true;
}

export interface DemoCenter {
  key: string;
  tenantKey: string;
  name: string;
  country: CountryCode;
  /** Fuso IANA do centro — o "dia de trabalho" é calculado nele. */
  timeZone: "Europe/Lisbon" | "Europe/Madrid";
  synthetic: true;
}

export interface DemoPosition {
  key: string;
  tenantKey: string;
  name: string;
}

/** Horário-modelo: hora local de início/fim; `endsNextDay` quando passa a meia-noite. */
export interface DemoSchedule {
  key: string;
  tenantKey: string;
  name: string;
  start: string;
  end: string;
  endsNextDay: boolean;
  /** Dias da semana (1 = segunda … 7 = domingo). */
  weekdays: number[];
}

export interface DemoEmployee {
  key: string;
  tenantKey: string;
  centerKey: string;
  positionKey: string;
  scheduleKey: string;
  employeeNumber: string;
  firstName: string;
  lastName: string;
  email: string;
  hireDate: string;
  /** Foto fictícia (ilustração CC0 servida pelo frontend em `public/`). */
  photoPath: string;
  synthetic: true;
}

/** in = entrada, break = início de pausa, back = regresso da pausa, out = saída. */
export type PunchKind = "in" | "break" | "back" | "out";

/** Marcação de ponto: instante em UTC + fuso do centro (task RH §5). */
export interface DemoPunch {
  employeeKey: string;
  kind: PunchKind;
  atUtc: string;
  timeZone: string;
  /** Dia de trabalho no fuso do centro a que a marcação pertence (dia de início do turno). */
  workDate: string;
  /** Idempotência da origem (RE-9): estável para a mesma semente. */
  clientEventId: string;
}

export interface DemoDataset {
  seed: number;
  period: { from: string; to: string };
  tenants: DemoTenant[];
  centers: DemoCenter[];
  positions: DemoPosition[];
  schedules: DemoSchedule[];
  employees: DemoEmployee[];
  punches: DemoPunch[];
}

export interface DemoDatasetOptions {
  seed: number;
  /** Funcionários por centro. */
  employeesPerCenter: number;
  /** Período das marcações (datas locais, inclusivas). */
  from: string;
  to: string;
}
