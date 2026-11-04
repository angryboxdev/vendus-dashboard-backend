/** Hora legal do estabelecimento, nos formatos da AT, e o instante UTC correspondente. */
export interface FiscalNow {
  /** AAAA-MM-DDTHH:MM:SS, ao segundo, sem fuso (hora de Lisboa) — o que se assina. */
  systemEntryDate: string;
  /** AAAA-MM-DD (hora de Lisboa). */
  date: string;
  /** Instante UTC (ISO 8601) — para ordenar e validar a cronologia. */
  instant: string;
}

export interface ClockPort {
  now(): FiscalNow;
}
