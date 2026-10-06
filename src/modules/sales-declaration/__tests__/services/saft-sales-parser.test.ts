import { parseSaftSales } from "../../domain/services/saft-sales-parser.service.js";
import { InvalidSaftFileError } from "../../domain/errors.js";
import { saft } from "../fakes/saft-fixtures.js";

describe("parseSaftSales", () => {
  it("lê o NetTotal (sem IVA) de cada documento na sua data, em cêntimos", () => {
    const data = parseSaftSales(
      saft(
        [
          { no: "FS 1", date: "2026-09-10", net: "16.10" },
          { no: "FT 1", date: "2026-09-11", type: "FT", net: "0.29" },
        ],
        { start: "2026-09-10", end: "2026-09-30" },
      ),
    );
    expect(data.startDate).toBe("2026-09-10");
    expect(data.endDate).toBe("2026-09-30");
    expect(data.documents).toEqual([
      { number: "FS 1", date: "2026-09-10", netCents: 1_610 },
      { number: "FT 1", date: "2026-09-11", netCents: 29 },
    ]);
  });

  it("não usa os valores das linhas nem o bruto — só o NetTotal", () => {
    const [doc] = parseSaftSales(saft([{ no: "FS 1", date: "2026-09-10", net: "10.00" }])).documents;
    expect(doc!.netCents).toBe(1_000);
  });

  it("notas de crédito (NC) ficam negativas", () => {
    const [doc] = parseSaftSales(saft([{ no: "NC 1", date: "2026-09-10", type: "NC", net: "15.83" }])).documents;
    expect(doc!.netCents).toBe(-1_583);
  });

  it("aceita NetTotal com muitas casas decimais (back-office AirMenu)", () => {
    const [doc] = parseSaftSales(saft([{ no: "FR 1", date: "2026-09-10", type: "FR", net: "16.1000000000" }])).documents;
    expect(doc!.netCents).toBe(1_610);
  });

  it("ignora documentos anulados (estado A)", () => {
    const data = parseSaftSales(
      saft([
        { no: "FS 1", date: "2026-09-10", net: "10.00" },
        { no: "FS 2", date: "2026-09-10", status: "A", net: "99.00" },
      ]),
    );
    expect(data.documents.map((d) => d.number)).toEqual(["FS 1"]);
  });

  it("datas do cabeçalho em falta ficam null", () => {
    const data = parseSaftSales(saft([{ no: "FS 1", date: "2026-09-10", net: "1.00" }]));
    expect(data.startDate).toBeNull();
    expect(data.endDate).toBeNull();
  });

  it("rejeita ficheiros que não são SAF-T", () => {
    expect(() => parseSaftSales("<html></html>")).toThrow(InvalidSaftFileError);
    expect(() => parseSaftSales("")).toThrow(InvalidSaftFileError);
  });

  it("rejeita SAF-T sem vendas (ex.: só contabilidade)", () => {
    expect(() => parseSaftSales(`<AuditFile><Header/><GeneralLedgerEntries/></AuditFile>`)).toThrow(/SalesInvoices/);
  });

  it("rejeita documento sem NetTotal numérico", () => {
    expect(() => parseSaftSales(saft([{ no: "FS 1", date: "2026-09-10", net: "abc" }]))).toThrow(InvalidSaftFileError);
  });
});
