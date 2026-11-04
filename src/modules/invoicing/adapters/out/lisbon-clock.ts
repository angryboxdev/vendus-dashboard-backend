import type { ClockPort, FiscalNow } from "../../domain/ports/out/clock.port.js";
import { lisbonEntryDate } from "../../domain/services/lisbon-time.service.js";

/** Hora legal de Portugal continental; o servidor corre em UTC. */
export class LisbonClock implements ClockPort {
  constructor(private readonly current: () => Date = () => new Date()) {}

  now(): FiscalNow {
    const at = this.current();
    const systemEntryDate = lisbonEntryDate(at);
    return { systemEntryDate, date: systemEntryDate.slice(0, 10), instant: at.toISOString() };
  }
}
