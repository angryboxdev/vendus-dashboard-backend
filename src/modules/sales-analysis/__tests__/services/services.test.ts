import { airMenuToBuckets, dailyByChannel, vendusToBuckets } from "../../domain/services/buckets.service.js";
import { addDays, monthsOf, shiftMonth, shiftYear, toContiguousRanges } from "../../domain/services/dates.js";
import { baselineForecast, parseForecastResponse, remainingDates, type ForecastInput } from "../../domain/services/forecast.service.js";
import { hourOfSystemTime } from "../../adapters/out/vendus-sales-source.adapter.js";

describe("datas", () => {
  it("mês anterior de 31 fica no último dia do mês", () => {
    expect(shiftMonth("2026-03-31", -1)).toBe("2026-02-28");
    expect(shiftYear("2028-02-29", -1)).toBe("2027-02-28");
    expect(shiftMonth("2026-01-15", -1)).toBe("2025-12-15");
  });

  it("lista os meses de um intervalo", () => {
    expect(monthsOf({ from: "2025-11-20", to: "2026-02-01" })).toEqual(["2025-11", "2025-12", "2026-01", "2026-02"]);
  });

  it("junta dias soltos em blocos contíguos com tamanho máximo", () => {
    const ds = ["2026-11-01", "2026-11-02", "2026-11-03", "2026-11-05", "2026-11-06"];
    expect(toContiguousRanges(ds, 2)).toEqual([
      { from: "2026-11-01", to: "2026-11-02" },
      { from: "2026-11-03", to: "2026-11-03" },
      { from: "2026-11-05", to: "2026-11-06" },
    ]);
  });
});

describe("blocos", () => {
  it("Vendus: faturas somam e cada NC subtrai valor e uma venda, na hora em que foi emitida", () => {
    const b = vendusToBuckets([
      { type: "FS", date: "2026-11-14", hour: 20, channel: "salao", grossCents: 3000, netCents: 2655 },
      { type: "FT", date: "2026-11-14", hour: 20, channel: "salao", grossCents: 2000, netCents: 1770 },
      { type: "NC", date: "2026-11-14", hour: 20, channel: "salao", grossCents: 2000, netCents: 1770 },
      { type: "FS", date: "2026-11-14", hour: 13, channel: "apps", grossCents: 1500, netCents: 1327 },
      { type: "OT", date: "2026-11-14", hour: 13, channel: "apps", grossCents: 999, netCents: 999 },
    ]);
    expect(b).toEqual([
      { date: "2026-11-14", hour: 13, channel: "apps", grossCents: 1500, netCents: 1327, count: 1 },
      { date: "2026-11-14", hour: 20, channel: "salao", grossCents: 3000, netCents: 2655, count: 1 },
    ]);
  });

  it("AirMenu: nota de crédito subtrai mesmo com total negativo", () => {
    const b = airMenuToBuckets([
      { date: "2026-11-14", hour: 21, channel: "glovo", grossCents: 2500, netCents: 2200, isCreditNote: false },
      { date: "2026-11-14", hour: 21, channel: "glovo", grossCents: -1000, netCents: -880, isCreditNote: true },
    ]);
    expect(b).toEqual([{ date: "2026-11-14", hour: 21, channel: "glovo", grossCents: 1500, netCents: 1320, count: 0 }]);
  });

  it("total diário por canal usa hora −1", () => {
    const d = dailyByChannel([
      { date: "2026-11-14", hour: 13, channel: "salao", grossCents: 100, netCents: 90, count: 1 },
      { date: "2026-11-14", hour: 20, channel: "salao", grossCents: 200, netCents: 180, count: 2 },
    ]);
    expect(d).toEqual([{ date: "2026-11-14", hour: -1, channel: "salao", grossCents: 300, netCents: 270, count: 3 }]);
  });

  it("hora da Vendus vem do texto de system_time (não do fuso do servidor)", () => {
    expect(hourOfSystemTime("2026-11-14 23:45:10")).toBe(23);
    expect(hourOfSystemTime("2026-11-14 00:05:00")).toBe(0);
    expect(hourOfSystemTime("")).toBe(0);
  });
});

describe("previsão", () => {
  const today = "2026-11-28"; // sábado
  const history = Array.from({ length: 42 }, (_, i) => {
    const date = addDays(today, -42 + i);
    const sat = new Date(`${date}T00:00:00Z`).getUTCDay() === 6;
    return { date, grossCents: sat ? 200_000 + i * 1000 : 100_000, count: sat ? 60 : 30 };
  });
  const input: ForecastInput = { today, targetDates: remainingDates(today), history, monthToDate: [], sameMonthLastYear: [] };

  it("dias a prever vão de hoje ao fim do mês", () => {
    expect(remainingDates("2026-11-28")).toEqual(["2026-11-28", "2026-11-29", "2026-11-30"]);
  });

  it("regra de base: mediana do mesmo dia da semana, com mínimo e máximo como intervalo", () => {
    const [sat] = baselineForecast(input);
    expect(sat!.date).toBe("2026-11-28");
    expect(sat!.lowCents).toBeLessThan(sat!.expectedCents);
    expect(sat!.highCents).toBeGreaterThan(sat!.expectedCents);
    expect(sat!.expectedCount).toBe(60);
  });

  it("aceita uma resposta válida da IA e converte euros em cêntimos", () => {
    const raw = JSON.stringify({
      days: input.targetDates.map((date) => ({ date, expected: 1500.5, low: 1200, high: 1900, count: 45 })),
      note: "Sábados fortes.",
    });
    const r = parseForecastResponse(`texto antes ${raw} texto depois`, input);
    expect(r!.days[0]).toEqual({ date: "2026-11-28", expectedCents: 150050, lowCents: 120000, highCents: 190000, expectedCount: 45 });
    expect(r!.note).toBe("Sábados fortes.");
  });

  it("rejeita resposta com dias em falta, negativos ou absurdos", () => {
    const ok = (over: Record<string, unknown>) => JSON.stringify({ days: input.targetDates.map((date) => ({ date, expected: 1000, low: 900, high: 1100, count: 30, ...over })) });
    expect(parseForecastResponse(JSON.stringify({ days: [] }), input)).toBeNull();
    expect(parseForecastResponse(ok({ expected: -5 }), input)).toBeNull();
    expect(parseForecastResponse(ok({ high: 999_999 }), input)).toBeNull();
    expect(parseForecastResponse("não é json", input)).toBeNull();
    expect(parseForecastResponse(null, input)).toBeNull();
  });
});
