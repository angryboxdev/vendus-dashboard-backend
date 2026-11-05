import type { PosClockPort } from "../../domain/ports/out/pos.ports.js";

const fmt = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Lisbon", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" });

/** Diferença (ms) entre a hora de Lisboa e UTC num instante. */
function lisbonOffsetMs(instant: number): number {
  const p = Object.fromEntries(fmt.formatToParts(new Date(instant)).map((x) => [x.type, x.value]));
  return Date.UTC(Number(p.year), Number(p.month) - 1, Number(p.day), Number(p.hour), Number(p.minute), Number(p.second)) - Math.floor(instant / 1000) * 1000;
}

/** Meia-noite de Lisboa do dia (AAAA-MM-DD), como instante UTC. */
function lisbonMidnight(date: string): number {
  const [y, m, d] = date.split("-").map(Number) as [number, number, number];
  const utc = Date.UTC(y, m - 1, d);
  return utc - lisbonOffsetMs(utc - lisbonOffsetMs(utc));
}

/** Dia de calendário de Lisboa (o «hoje» da caixa) e os seus limites em UTC. */
export class LisbonDayClock implements PosClockPort {
  constructor(private readonly now: () => Date = () => new Date()) {}

  nowIso() {
    return this.now().toISOString();
  }

  todayLisbon() {
    const p = Object.fromEntries(fmt.formatToParts(this.now()).map((x) => [x.type, x.value]));
    return `${p.year}-${p.month}-${p.day}`;
  }

  lisbonDayBounds(date: string) {
    const [y, m, d] = date.split("-").map(Number) as [number, number, number];
    const next = new Date(Date.UTC(y, m - 1, d + 1)).toISOString().slice(0, 10);
    return { fromIso: new Date(lisbonMidnight(date)).toISOString(), toIso: new Date(lisbonMidnight(next)).toISOString() };
  }
}
