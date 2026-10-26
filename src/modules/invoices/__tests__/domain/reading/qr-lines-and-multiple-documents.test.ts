import { readFiscalQr } from "../../../domain/services/reading/invoice-reader.service.js";
import { parseAtQr } from "../../../domain/services/reading/fiscal-qr.js";
import { enforceQrLines, linesReconcileWithQr } from "../../../domain/services/reading/reading-to-extraction.js";
import type { AiExtractedLine, AiExtractionResult } from "../../../domain/entities/ai-extraction-result.js";
import type { PdfContent } from "../../../domain/entities/invoice-reading.js";

// Dados fictícios: documento de pagamento de um serviço de águas com duas faturas fiscais
// (água + saneamento a 6 %, e resíduos não sujeitos a IVA), cada uma com o seu QR.
const QR_WATER = "A:599999993*B:999999990*C:PT*D:FT*E:N*F:20261019*G:900001*H:ABCD1234-900001*I1:PT*I3:56.59*I4:3.39*N:3.39*O:59.98*Q:ab12*R:999";
const QR_WASTE = "A:599999994*B:999999990*C:PT*D:FT*E:N*F:20261019*G:900002*H:WXYZ5678-900002*I1:PT*L:30.05*N:0.00*O:30.05*Q:cd34*R:999";

const qrOf = (text: string) => {
  const p = parseAtQr(text);
  if (!p.ok) throw new Error(p.reason);
  return p.qr;
};

const line = (description: string, net: number, vatRate: number | null = 6): AiExtractedLine => ({
  description, quantity: 1, unitPriceWithoutVat: net, vatRate, vatAmount: null, totalWithoutVat: net, totalWithVat: null,
});

const aiResult = (lines: AiExtractedLine[]): AiExtractionResult => ({
  supplierName: "Águas Exemplo", supplierNif: "123456789", supplierAddress: null, supplierEmail: null, invoiceNumber: "DOC-PAG-1",
  issueDate: null, dueDate: null, subtotalWithoutVat: 5698, vatAmount: 300, totalWithVat: 5998, currency: "EUR", confidence: 0.95,
  documentType: "invoice", lines, validationIssues: [],
});

describe("faturas com QR lidas pela IA — linhas conferidas com o QR", () => {
  const qr = qrOf(QR_WATER);

  test("linhas que fecham com as bases do QR ficam como estão", () => {
    const lines = [line("Água", 3008), line("Águas residuais", 2585), line("Taxa de recursos hídricos", 66)];
    expect(linesReconcileWithQr(lines, qr)).toBe(true);
    const r = enforceQrLines(aiResult(lines), qr);
    expect(r.note).toBeNull();
    expect(r.extraction.lines).toBe(lines);
  });

  test("linhas que não fecham (resumo misturado, linha «IVA») dão lugar às bases do QR por taxa", () => {
    const wrong = [line("ÁGUA", 3008), line("ÁGUAS RESIDUAIS", 2584), line("TAXA DE RECURSOS HÍDRICOS", 125), line("IVA", 0)];
    expect(linesReconcileWithQr(wrong, qr)).toBe(false);
    const r = enforceQrLines(aiResult(wrong), qr);
    expect(r.extraction.lines).toEqual([
      expect.objectContaining({ description: "Valor à taxa de IVA 6 % (QR fiscal)", vatRate: 6, totalWithoutVat: 5659, vatAmount: 339, totalWithVat: 5998 }),
    ]);
    expect(r.note).toMatch(/57,17 € vs\. base 56,59 €/);
  });

  test("a mesma soma mas na taxa errada também não serve", () => {
    expect(linesReconcileWithQr([line("Água", 5659, 23)], qr)).toBe(false);
  });

  test("sem linhas ou com valores em falta → bases do QR", () => {
    expect(linesReconcileWithQr([], qr)).toBe(false);
    expect(linesReconcileWithQr([{ ...line("Água", 0), totalWithoutVat: null }], qr)).toBe(false);
  });

  test("valor não sujeito a IVA vira uma linha própria", () => {
    const r = enforceQrLines(aiResult([line("Resíduos", 100)]), qrOf(QR_WASTE));
    expect(r.extraction.lines).toEqual([
      expect.objectContaining({ description: "Valor não sujeito a IVA (QR fiscal)", vatRate: 0, totalWithoutVat: 3005, vatAmount: 0 }),
    ]);
  });
});

describe("documento de pagamento com várias faturas fiscais", () => {
  const content = (texts: string[]): PdfContent => ({ pages: [], qrCodes: texts.map((text) => ({ page: 2, text })) });

  test("lê a primeira e avisa (sem bloquear) das restantes", () => {
    const { qr, issues } = readFiscalQr(content([QR_WATER, QR_WASTE]));
    expect(qr?.documentNumber).toBe("900001");
    const note = issues.find((i) => i.code === "qr_multiple_documents");
    expect(note?.blocking).toBe(false);
    expect(note?.detail).toContain("2 faturas fiscais: 900001 (NIF 599999993, 59,98 €), 900002 (NIF 599999994, 30,05 €)");
  });

  test("o mesmo QR lido duas vezes não conta como outra fatura", () => {
    const { issues } = readFiscalQr(content([QR_WATER, QR_WATER]));
    expect(issues.some((i) => i.code === "qr_multiple_documents")).toBe(false);
  });
});
