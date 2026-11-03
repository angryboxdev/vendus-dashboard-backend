import * as path from "node:path";
import { IsolatedPdfContentReaderAdapter } from "../../adapters/out/isolated-pdf-content-reader.adapter.js";

const worker = (name: string) => path.join(__dirname, "..", "fixtures", name);
const make = (name: string, timeoutMs = 3000) =>
  new IsolatedPdfContentReaderAdapter({ workerPath: worker(name), timeoutMs });
const PDF = Buffer.from("%PDF-1.7\n% ficticio\n");

describe("IsolatedPdfContentReaderAdapter", () => {
  beforeEach(() => jest.spyOn(console, "error").mockImplementation(() => undefined));
  afterEach(() => jest.restoreAllMocks());

  it("devolve o resultado do processo filho", async () => {
    await expect(make("pdf-worker-ok.cjs").read(PDF, "application/pdf")).resolves.toEqual({ echoed: "read" });
  });

  it("converte o PNG do logótipo de volta para Buffer", async () => {
    const logo = await make("pdf-worker-ok.cjs").extractLogo(PDF);
    expect(Buffer.isBuffer(logo!.png)).toBe(true);
    expect([...logo!.png]).toEqual([1, 2, 3]);
  });

  it("PDF que bloqueia o processador: mata o filho ao fim do tempo e o chamador recebe um erro", async () => {
    const t0 = Date.now();
    await expect(make("pdf-worker-hang.cjs", 500).read(PDF, "application/pdf")).rejects.toThrow(/excedeu 500 ms/);
    expect(Date.now() - t0).toBeLessThan(3000);
  });

  it("filho que morre sem responder (ex.: sem memória): erro, sem derrubar quem chama", async () => {
    await expect(make("pdf-worker-crash.cjs").read(PDF, "application/pdf")).rejects.toThrow(/terminou sem resposta/);
  });

  it("erro tratado no filho chega como erro com a mensagem original", async () => {
    await expect(make("pdf-worker-error.cjs").read(PDF, "application/pdf")).rejects.toThrow("PDF corrompido");
  });

  it("readBarcode e extractLogo degradam em vez de falhar quando o filho morre", async () => {
    const reader = make("pdf-worker-crash.cjs");
    await expect(reader.readBarcode(PDF, 2)).resolves.toEqual({ status: "absent" });
    await expect(reader.extractLogo(PDF)).resolves.toBeNull();
  });
});
