import {
  buildSalesDeclarationRows,
  declarationPeriod,
  enumerateDays,
  mergeSaftSales,
} from "../../domain/services/sales-declaration-builder.service.js";
import { InvalidSalesDeclarationRequestError } from "../../domain/errors.js";
import type { SaftSalesData } from "../../domain/entities/sales-declaration.js";

const file = (documents: SaftSalesData["documents"], startDate: string | null = null, endDate: string | null = null): SaftSalesData => ({
  startDate,
  endDate,
  documents,
});

describe("enumerateDays", () => {
  it("devolve todos os dias, inclusive, atravessando meses e anos", () => {
    expect(enumerateDays("2026-12-30", "2027-01-02")).toEqual(["2026-12-30", "2026-12-31", "2027-01-01", "2027-01-02"]);
  });

  it("não é afectado por mudança de hora", () => {
    expect(enumerateDays("2026-10-01", "2026-10-31")).toHaveLength(31);
  });

  it("rejeita fim antes do início e datas inválidas", () => {
    expect(() => enumerateDays("2026-10-05", "2026-10-04")).toThrow(InvalidSalesDeclarationRequestError);
    expect(() => enumerateDays("2026-02-30", "2026-03-01")).toThrow(InvalidSalesDeclarationRequestError);
  });
});

describe("mergeSaftSales", () => {
  it("soma documentos de ficheiros diferentes no mesmo dia", () => {
    const merged = mergeSaftSales([
      file([{ number: "FS 1", date: "2026-09-10", netCents: 1_000 }, { number: "NC 1", date: "2026-09-10", netCents: -300 }]),
      file([{ number: "FR 1", date: "2026-09-10", netCents: 250 }, { number: "FR 2", date: "2026-09-11", netCents: 400 }]),
    ]);
    expect(Object.fromEntries(merged.map((m) => [m.date, m.netCents]))).toEqual({ "2026-09-10": 950, "2026-09-11": 400 });
  });

  it("conta uma só vez o mesmo documento enviado em dois ficheiros", () => {
    const same = [{ number: "FS 1", date: "2026-09-10", netCents: 1_000 }];
    expect(mergeSaftSales([file(same), file(same)])).toEqual([{ date: "2026-09-10", netCents: 1_000 }]);
  });
});

describe("declarationPeriod", () => {
  it("usa o período dos cabeçalhos (união dos ficheiros)", () => {
    expect(
      declarationPeriod([file([], "2026-09-10", "2026-09-30"), file([], "2026-09-12", "2026-10-02")]),
    ).toEqual({ since: "2026-09-10", until: "2026-10-02" });
  });

  it("alarga o período a documentos fora do cabeçalho", () => {
    expect(
      declarationPeriod([file([{ number: "FS 1", date: "2026-10-05", netCents: 1 }], "2026-09-10", "2026-09-30")]),
    ).toEqual({ since: "2026-09-10", until: "2026-10-05" });
  });

  it("sem cabeçalho usa as datas dos documentos; sem nada devolve null", () => {
    expect(
      declarationPeriod([file([{ number: "A", date: "2026-09-12", netCents: 1 }, { number: "B", date: "2026-09-10", netCents: 1 }])]),
    ).toEqual({ since: "2026-09-10", until: "2026-09-12" });
    expect(declarationPeriod([file([])])).toBeNull();
  });
});

describe("buildSalesDeclarationRows", () => {
  it("uma linha por dia do período, com 0 nos dias sem movimento", () => {
    expect(
      buildSalesDeclarationRows("2026-10-01", "2026-10-03", [
        { date: "2026-10-01", netCents: 12_550 },
        { date: "2026-10-03", netCents: 500 },
      ]),
    ).toEqual([
      { date: "2026-10-01", normalCents: 12_550 },
      { date: "2026-10-02", normalCents: 0 },
      { date: "2026-10-03", normalCents: 500 },
    ]);
  });

  it("permite dia líquido negativo (NC de outro dia)", () => {
    expect(buildSalesDeclarationRows("2026-10-01", "2026-10-01", [{ date: "2026-10-01", netCents: -1_000 }])[0]!.normalCents).toBe(-1_000);
  });
});
