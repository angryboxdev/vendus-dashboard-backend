import { normalizeSupplierName, supplierNameSimilarity, FUZZY_MATCH_THRESHOLD } from "../../domain/utils/supplier-name.js";
import { normalizeNif } from "../../domain/utils/nif.js";

describe("normalizeNif", () => {
  it("remove pontos e hífens", () => {
    expect(normalizeNif("500.123.456")).toBe("500123456");
  });

  it("remove espaços", () => {
    expect(normalizeNif("500 123 456")).toBe("500123456");
  });

  it("mantém NIF já limpo", () => {
    expect(normalizeNif("500123456")).toBe("500123456");
  });
});

describe("normalizeSupplierName", () => {
  it("converte para lowercase", () => {
    expect(normalizeSupplierName("MAKRO PORTUGAL")).toBe("makro portugal");
  });

  it("remove acentos", () => {
    expect(normalizeSupplierName("Comunicações")).toBe("comunicacoes");
  });

  it("remove forma jurídica SA", () => {
    expect(normalizeSupplierName("Makro Portugal SA")).toBe("makro portugal");
  });

  it("remove forma jurídica S.A.", () => {
    expect(normalizeSupplierName("Makro Portugal S.A.")).toBe("makro portugal");
  });

  it("remove forma jurídica Lda", () => {
    expect(normalizeSupplierName("Empresa Exemplo Lda")).toBe("empresa exemplo");
  });

  it("remove pontuação e substitui por espaço", () => {
    expect(normalizeSupplierName("Makro, Portugal")).toBe("makro portugal");
  });

  it("colapsa espaços múltiplos", () => {
    expect(normalizeSupplierName("Makro   Portugal")).toBe("makro portugal");
  });
});

describe("supplierNameSimilarity", () => {
  it("retorna 1.0 para nomes idênticos após normalização", () => {
    expect(supplierNameSimilarity("Makro Portugal SA", "Makro Portugal S.A.")).toBe(1);
  });

  it("retorna 1.0 para nomes com acentos vs sem acentos", () => {
    expect(supplierNameSimilarity("NOS Comunicações SA", "NOS Comunicacoes S.A.")).toBe(1);
  });

  it("retorna score alto para nomes muito semelhantes", () => {
    const score = supplierNameSimilarity("Cooperativa Agrícola Barcelos", "Cooperativa Agricola de Barcelos Lda");
    expect(score).toBeGreaterThanOrEqual(FUZZY_MATCH_THRESHOLD);
  });

  it("retorna score baixo para nomes diferentes", () => {
    const score = supplierNameSimilarity("Makro Portugal SA", "Metro Cash Carry Portugal");
    expect(score).toBeLessThan(FUZZY_MATCH_THRESHOLD);
  });

  it("retorna 0 para strings vazias", () => {
    expect(supplierNameSimilarity("", "Makro Portugal")).toBe(0);
    expect(supplierNameSimilarity("Makro Portugal", "")).toBe(0);
  });

  it("não confunde empresas com nomes parcialmente semelhantes", () => {
    // "EDP Comercial" vs "Energias de Portugal" — poucos tokens comuns
    const score = supplierNameSimilarity("EDP Comercial SA", "Energias Portugal SA");
    expect(score).toBeLessThan(FUZZY_MATCH_THRESHOLD);
  });
});
