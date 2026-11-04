import type { ClockPort, FiscalNow } from "../../domain/ports/out/clock.port.js";

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

/** Hora legal de Portugal continental; o servidor corre em UTC. */
export class LisbonClock implements ClockPort {
  constructor(private readonly current: () => Date = () => new Date()) {}

  now(): FiscalNow {
    const at = this.current();
    const p = Object.fromEntries(FORMAT.formatToParts(at).map((x) => [x.type, x.value]));
    const date = `${p.year}-${p.month}-${p.day}`;
    return { systemEntryDate: `${date}T${p.hour}:${p.minute}:${p.second}`, date, instant: at.toISOString() };
  }
}
