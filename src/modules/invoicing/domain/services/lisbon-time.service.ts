const FORMAT = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Europe/Lisbon",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hourCycle: "h23",
});

/**
 * Instante → AAAA-MM-DDTHH:MM:SS em hora legal de Lisboa (formato do
 * SystemEntryDate / InvoiceStatusDate do SAF-T). Puro: só usa o `Intl` da linguagem.
 */
export function lisbonEntryDate(at: Date): string {
  const p = Object.fromEntries(FORMAT.formatToParts(at).map((x) => [x.type, x.value]));
  return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}:${p.second}`;
}
