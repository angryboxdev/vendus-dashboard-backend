import * as XLSX from "xlsx";
import { XlsxSalesDeclarationWriterAdapter } from "../../adapters/out/xlsx-sales-declaration-writer.adapter.js";
import { STORE } from "../fakes/saft-fixtures.js";

describe("XlsxSalesDeclarationWriterAdapter", () => {
  const buffer = new XlsxSalesDeclarationWriterAdapter().write(STORE, [
    { date: "2026-10-01", normalCents: 12_550 },
    { date: "2026-10-02", normalCents: 0 },
  ]);
  const workbook = XLSX.read(buffer, { type: "buffer" });
  const sheet = workbook.Sheets["SalesDeclaration"]!;

  it("usa a folha e o cabeçalho do SalesReport", () => {
    expect(workbook.SheetNames).toEqual(["SalesDeclaration"]);
    expect(XLSX.utils.sheet_to_json(sheet, { header: 1 })[0]).toEqual([
      "Business Unit Code", "Business Unit", "Company Name", "Store Number", "Contract", "Date", "Normal",
    ]);
    expect(sheet["!ref"]).toBe("A1:G3");
  });

  it("escreve a identificação da loja como texto (contrato mantém os zeros à esquerda)", () => {
    expect(sheet["A2"]!.v).toBe("PT32");
    expect(sheet["B2"]!.v).toBe("Mercado Bom Sucesso");
    expect(sheet["C2"]!.v).toBe("ANGRY BOX PIZZA SHOP");
    expect(sheet["D2"]!.v).toBe("L027");
    expect(sheet["E2"]!.t).toBe("s");
    expect(sheet["E2"]!.v).toBe("0000100000040");
  });

  it("escreve a data como número de série Excel (46296 = 1/out/2026) e o valor em euros", () => {
    expect(sheet["F2"]!.t).toBe("n");
    expect(sheet["F2"]!.v).toBe(46296);
    expect(sheet["F3"]!.v).toBe(46297);
    expect(sheet["G2"]!.v).toBe(125.5);
    expect(sheet["G3"]!.v).toBe(0);
  });
});
