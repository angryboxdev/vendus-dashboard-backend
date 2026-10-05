/**
 * Feriados nacionais obrigatórios em Portugal (D5 — calculados no código,
 * sem dependência externa). 13 por ano: 10 de data fixa + 3 móveis
 * dependentes da Páscoa (Sexta-feira Santa, Domingo de Páscoa, Corpo de
 * Deus). Lista validada em 2026-10-05 contra os 13 feriados por ano já
 * carregados em produção (2024–2027). O Carnaval não é feriado obrigatório
 * e não entra; feriados municipais são criados à mão.
 *
 * Os nomes são os mesmos já usados em `hr_public_holidays`, para a
 * importação reconhecer como "já existe" o que lá está.
 */
const FIXED: Array<[month: number, day: number, name: string]> = [
  [1, 1, "Ano Novo"],
  [4, 25, "Dia da Liberdade"],
  [5, 1, "Dia do Trabalhador"],
  [6, 10, "Dia de Portugal, de Camões e das Comunidades Portuguesas"],
  [8, 15, "Assunção de Nossa Senhora"],
  [10, 5, "Implantação da República"],
  [11, 1, "Dia de Todos os Santos"],
  [12, 1, "Restauração da Independência"],
  [12, 8, "Imaculada Conceição"],
  [12, 25, "Natal"],
];

/** Domingo de Páscoa (calendário gregoriano) — algoritmo anónimo de Meeus/Jones/Butcher. */
export function easterSunday(year: number): Date {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(Date.UTC(year, month - 1, day));
}

function ymd(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function addDays(date: Date, days: number): Date {
  const copy = new Date(date.getTime());
  copy.setUTCDate(copy.getUTCDate() + days);
  return copy;
}

export interface NationalHoliday {
  date: string;
  name: string;
}

/** Os 13 feriados nacionais de um ano, por ordem de data. */
export function portugueseNationalHolidays(year: number): NationalHoliday[] {
  const easter = easterSunday(year);
  const movable: NationalHoliday[] = [
    { date: ymd(addDays(easter, -2)), name: "Sexta-feira Santa" },
    { date: ymd(easter), name: "Domingo de Páscoa" },
    { date: ymd(addDays(easter, 60)), name: "Corpo de Deus" },
  ];
  const fixed = FIXED.map(([month, day, name]) => ({ date: ymd(new Date(Date.UTC(year, month - 1, day))), name }));
  return [...fixed, ...movable].sort((x, y) => x.date.localeCompare(y.date));
}

/** Países com importação automática. Só Portugal nesta fase (D5). */
export const SUPPORTED_HOLIDAY_COUNTRIES = ["PT"] as const;
export type HolidayCountry = (typeof SUPPORTED_HOLIDAY_COUNTRIES)[number];
