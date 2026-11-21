import type { OrganizationId } from "../../../../kernel/organization-id.js";
import type { DateRange, IsoDate, SalesBucket, SalesSource } from "../../domain/entities/sales-analysis.js";
import type {
  AirMenuSalesSourcePort, ClockPort, ForecastModelPort, SalesBucketStorePort, VendusSalesSourcePort,
} from "../../domain/ports/out/sales-analysis.ports.js";
import { eachDay } from "../../domain/services/dates.js";

export const ORG = "00000000-0000-0000-0000-000000000001" as OrganizationId;

export class FakeClock implements ClockPort {
  constructor(public value: IsoDate, public currentHour = 12) {}
  today() {
    return this.value;
  }
  hour() {
    return this.currentHour;
  }
}

export class FakeStore implements SalesBucketStorePort {
  readonly rows = new Map<string, SalesBucket[]>(); // `${source}|${date}` → blocos
  readonly covered = new Set<string>(); // `${source}|${date}`
  saveCalls: { source: SalesSource; days: IsoDate[] }[] = [];

  async coveredDays(_org: OrganizationId, source: SalesSource, range: DateRange) {
    return new Set(eachDay(range).filter((d) => this.covered.has(`${source}|${d}`)));
  }
  async buckets(_org: OrganizationId, source: SalesSource, range: DateRange) {
    return eachDay(range).flatMap((d) => this.rows.get(`${source}|${d}`) ?? []);
  }
  async saveDays(_org: OrganizationId, source: SalesSource, days: IsoDate[], buckets: SalesBucket[]) {
    this.saveCalls.push({ source, days: [...days] });
    for (const d of days) {
      this.covered.add(`${source}|${d}`);
      this.rows.set(`${source}|${d}`, buckets.filter((b) => b.date === d));
    }
  }
  /** Marca dias como guardados com um bloco de 100 € às 20h. */
  seed(source: SalesSource, range: DateRange, channel: SalesBucket["channel"] = "salao", grossCents = 10_000) {
    for (const d of eachDay(range)) {
      this.covered.add(`${source}|${d}`);
      this.rows.set(`${source}|${d}`, [{ date: d, hour: 20, channel, grossCents, netCents: Math.round(grossCents / 1.13), count: 4 }]);
    }
  }
}

/** Fonte que devolve um bloco por dia e regista os intervalos pedidos. */
export class FakeSource implements VendusSalesSourcePort, AirMenuSalesSourcePort {
  calls: DateRange[] = [];
  fail = false;
  /** Falha só na chamada n.º (1 = primeira). */
  failOnCall: number | null = null;
  /** Para observar chamadas em paralelo. */
  inFlight = 0;
  maxInFlight = 0;
  constructor(private readonly channel: SalesBucket["channel"] = "salao", private readonly grossCents = 5_000) {}
  async fetchBuckets(range: DateRange): Promise<SalesBucket[]> {
    this.calls.push(range);
    this.inFlight++;
    this.maxInFlight = Math.max(this.maxInFlight, this.inFlight);
    await new Promise((r) => setTimeout(r, 1));
    this.inFlight--;
    if (this.fail || this.failOnCall === this.calls.length) throw new Error("fonte em baixo");
    return eachDay(range).map((d) => ({ date: d, hour: 13, channel: this.channel, grossCents: this.grossCents, netCents: 4_000, count: 2 }));
  }
}

export class FakeModel implements ForecastModelPort {
  prompts: string[] = [];
  constructor(public available: boolean, private readonly reply: (prompt: string) => string | null = () => null) {}
  async complete(prompt: string) {
    this.prompts.push(prompt);
    return this.reply(prompt);
  }
}
