import { sanitizeExtractedLines } from "../../domain/services/extracted-lines.service.js";
import { applyQrToExtraction } from "../../domain/services/reading/reading-to-extraction.js";
import { parseAtQr } from "../../domain/services/reading/fiscal-qr.js";
import type { AiExtractedLine, AiExtractionResult } from "../../domain/entities/ai-extraction-result.js";

const line = (over: Partial<AiExtractedLine>): AiExtractedLine => ({
  description: "Serviço", quantity: 1, unitPriceWithoutVat: null, vatRate: 23, vatAmount: null, totalWithoutVat: null, totalWithVat: null, ...over,
});

describe("linhas devolvidas pela IA — conferência aritmética", () => {
  test("CPF/2530: a IA pôs o total da linha (190,00) no preço; 4 × 190 ≠ 190 → prevalece o total impresso", () => {
    const { lines, notes } = sanitizeExtractedLines([line({ quantity: 4, unitPriceWithoutVat: 19000, unitPriceText: "190,00", totalWithoutVat: 19000 })]);
    expect(lines[0]).toMatchObject({ quantity: 4, unitPriceWithoutVat: null, unitPriceText: null, grossWithoutDiscount: 19000, totalWithoutVat: 19000 });
    expect(notes[0]!.detail).toContain("4 × 190.00 € ≠ 190.00 €");
  });

  test("preço unitário explícito correto, arredondamento de 1 cêntimo e desconto ficam como estão", () => {
    const ok = line({ quantity: 20, unitPriceWithoutVat: 620, totalWithoutVat: 12400 });
    const rounded = line({ quantity: 3, unitPriceWithoutVat: 3333, totalWithoutVat: 10000 });
    const discounted = line({ quantity: 20, unitPriceWithoutVat: 620, discountPct: 10, grossWithoutDiscount: 12400, totalWithoutVat: 11160 });
    const r = sanitizeExtractedLines([ok, rounded, discounted]);
    expect(r.lines).toEqual([ok, rounded, discounted]);
    expect(r.notes).toEqual([]);
  });
});

describe("fatura com QR lida pela IA — identidade e totais vêm do QR", () => {
  test("número, NIF, data, bases, IVA, total e quadro de IVA do QR substituem os da IA; linhas e prazo ficam", () => {
    const qr = parseAtQr("A:599999993*B:999999990*C:PT*D:FT*E:N*F:20261022*G:FT CPF/9999*H:ABCD-9*I1:PT*I7:190.00*I8:43.70*N:43.70*O:233.70*Q:ab12*R:192");
    if (!qr.ok) throw new Error(qr.reason);
    const ai: AiExtractionResult = {
      supplierName: "Empresa", supplierNif: "123456789", supplierAddress: null, supplierEmail: null, invoiceNumber: "CPF 2530 (mal lido)",
      issueDate: new Date("2026-10-21"), dueDate: new Date("2026-11-21"), subtotalWithoutVat: 76000, vatAmount: 17480, totalWithVat: 93480,
      currency: "EUR", confidence: 0.9, documentType: "invoice", lines: [line({ quantity: 4, totalWithoutVat: 19000 })], validationIssues: [],
    };
    const r = applyQrToExtraction(ai, qr.qr);
    expect(r).toMatchObject({ supplierNif: "599999993", invoiceNumber: "FT CPF/9999", subtotalWithoutVat: 19000, vatAmount: 4370, totalWithVat: 23370, supplierName: "Empresa" });
    expect(r.issueDate?.toISOString().slice(0, 10)).toBe("2026-10-22");
    expect(r.dueDate?.toISOString().slice(0, 10)).toBe("2026-11-21");
    expect(r.amounts?.vatSummary).toEqual([{ rate: 23, baseCents: 19000, vatCents: 4370 }]);
    expect(r.lines).toEqual(ai.lines);
  });
});

describe("sanitizeExtractedLines — ordem de grandeza (Dream Plus FT 56892, leitura pela IA)", () => {
  const line = (description: string, quantity: number, price: number, pct: number, total: number, quantityText: string) => ({
    description, quantity, unitPriceWithoutVat: price, vatRate: 6, vatAmount: null, totalWithoutVat: total, totalWithVat: null, discountPct: pct, quantityText,
  });

  test("«4,000» lido como 4000 → 4 sacos (e 20000 → 20 kg, 5000 → 5 kg), com aviso para rever; linhas certas ficam", () => {
    const r = sanitizeExtractedLines([
      line("Q. Cheddar Ralado kg", 5000, 820, 5, 3895, "5,000"),
      line("Q. Mozzarella ralado 100% Eurial kg", 20000, 620, 10, 11160, "20,000"),
      line("Tomate Mutti p/ Pizza Classico 5 kg bolsa", 4000, 1068, 10, 3845, "4,000"),
      line("Linha certa", 2, 820, 5, 1558, "2,000"),
    ]);
    expect(r.lines.map((l) => l.quantity)).toEqual([5, 20, 4, 2]);
    expect(r.lines.map((l) => l.unitPriceWithoutVat)).toEqual([820, 620, 1068, 820]);
    expect(r.notes.map((n) => [n.index, n.code])).toEqual([[0, "quantity_scale_corrected"], [1, "quantity_scale_corrected"], [2, "quantity_scale_corrected"]]);
    expect(r.notes[2]!.detail).toMatch(/quantidade lida 4000 corrigida para 4 \(«4,000» com vírgula decimal\)/);
  });

  test("preço lido ×100 → corrigido com aviso; nada que feche → prevalece o total impresso (como antes)", () => {
    const r = sanitizeExtractedLines([
      line("Preço errado", 4, 106800, 10, 3845, "4"),
      { description: "Total no preço", quantity: 4, unitPriceWithoutVat: 19000, vatRate: 23, vatAmount: null, totalWithoutVat: 19000, totalWithVat: null },
    ]);
    expect(r.lines[0]!.unitPriceWithoutVat).toBe(1068);
    expect(r.notes.map((n) => n.code)).toEqual(["unit_price_scale_corrected", "line_unit_price_discarded"]);
    expect(r.lines[1]!.unitPriceWithoutVat).toBeNull();
  });
});
