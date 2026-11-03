import { PdfjsContentReaderAdapter } from "./pdfjs-content-reader.adapter.js";

/**
 * Ponto de entrada do processo filho lançado por `IsolatedPdfContentReaderAdapter`: executa UMA operação
 * do leitor de PDF, devolve o resultado por IPC e termina. Corre fora do servidor para que um PDF que
 * bloqueie o processador ou esgote a memória só mate este processo.
 */
export type PdfWorkerRequest =
  | { op: "read"; buffer: Uint8Array; mimeType: string }
  | { op: "readBarcode"; buffer: Uint8Array; maxPages: number }
  | { op: "extractLogo"; buffer: Uint8Array };

export type PdfWorkerResponse = { ok: true; result: unknown } | { ok: false; error: string };

async function handle(req: PdfWorkerRequest): Promise<unknown> {
  const reader = new PdfjsContentReaderAdapter();
  const buffer = Buffer.from(req.buffer);
  switch (req.op) {
    case "read":
      return reader.read(buffer, req.mimeType);
    case "readBarcode":
      return reader.readBarcode(buffer, req.maxPages);
    case "extractLogo":
      return reader.extractLogo(buffer);
  }
}

process.once("message", (req: PdfWorkerRequest) => {
  void handle(req)
    .then((result): PdfWorkerResponse => ({ ok: true, result }))
    .catch((e: unknown): PdfWorkerResponse => ({ ok: false, error: e instanceof Error ? e.message : String(e) }))
    .then((response) => process.send?.(response, () => process.exit(0)));
});
