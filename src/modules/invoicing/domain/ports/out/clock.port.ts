/** Hora legal do estabelecimento, nos formatos da AT. */
export interface FiscalNow {
  /** AAAA-MM-DDTHH:MM:SS, ao segundo, sem fuso. */
  systemEntryDate: string;
  /** AAAA-MM-DD. */
  date: string;
}

export interface ClockPort {
  now(): FiscalNow;
}
