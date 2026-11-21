import { DateTime } from "luxon";
import type { ClockPort } from "../../domain/ports/out/sales-analysis.ports.js";

export class LisbonClockAdapter implements ClockPort {
  today(): string {
    return DateTime.now().setZone("Europe/Lisbon").toISODate()!;
  }

  hour(): number {
    return DateTime.now().setZone("Europe/Lisbon").hour;
  }
}
