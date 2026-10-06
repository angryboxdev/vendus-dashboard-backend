import { GenerateSalesDeclarationUseCase } from "../../application/use-cases/generate-sales-declaration.use-case.js";
import { InvalidSaftFileError, InvalidSalesDeclarationRequestError } from "../../domain/errors.js";
import { FakeFileWriter, STORE, saft } from "../fakes/saft-fixtures.js";

describe("GenerateSalesDeclarationUseCase", () => {
  it("soma por dia o líquido dos SAF-T (Vendus + AirMenu) e entrega ao writer com a identificação da loja", async () => {
    const writer = new FakeFileWriter();
    const vendus = saft(
      [
        { no: "FS 1", date: "2026-09-10", net: "100.00" },
        { no: "NC 1", date: "2026-09-10", type: "NC", net: "10.00" },
        { no: "FS 2", date: "2026-09-12", net: "50.50" },
      ],
      { start: "2026-09-10", end: "2026-09-12" },
    );
    const airMenu = saft([{ no: "FR 1", date: "2026-09-10", type: "FR", net: "25.5000000000" }], {
      start: "2026-09-10",
      end: "2026-09-12",
    });

    const file = await new GenerateSalesDeclarationUseCase(writer, STORE).execute({
      saftFiles: [
        { name: "vendus.xml", content: vendus },
        { name: "bo.xml", content: airMenu },
      ],
    });

    expect(file.fileName).toBe("SalesReport_2026-09-10_2026-09-12.xlsx");
    expect(file.content.toString()).toBe("fake");
    expect(writer.received?.store).toEqual(STORE);
    expect(writer.received?.rows).toEqual([
      { date: "2026-09-10", normalCents: 11_550 }, // 100 − 10 + 25,50
      { date: "2026-09-11", normalCents: 0 },
      { date: "2026-09-12", normalCents: 5_050 },
    ]);
  });

  it("rejeita pedido sem ficheiros", async () => {
    await expect(new GenerateSalesDeclarationUseCase(new FakeFileWriter(), STORE).execute({ saftFiles: [] })).rejects.toThrow(
      InvalidSalesDeclarationRequestError,
    );
  });

  it("indica qual ficheiro não é um SAF-T válido", async () => {
    const useCase = new GenerateSalesDeclarationUseCase(new FakeFileWriter(), STORE);
    await expect(
      useCase.execute({ saftFiles: [{ name: "relatorio.xml", content: "<html/>" }] }),
    ).rejects.toThrow(/relatorio\.xml/);
    await expect(useCase.execute({ saftFiles: [{ name: "x.xml", content: "<html/>" }] })).rejects.toThrow(InvalidSaftFileError);
  });

  it("rejeita SAF-T sem datas nem documentos", async () => {
    await expect(
      new GenerateSalesDeclarationUseCase(new FakeFileWriter(), STORE).execute({ saftFiles: [{ name: "vazio.xml", content: saft([]) }] }),
    ).rejects.toThrow(InvalidSaftFileError);
  });
});
