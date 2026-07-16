import { describe, it, expect } from "@jest/globals";
import { normalizeBankDescription } from "../../domain/utils/bank-description.js";

describe("normalizeBankDescription", () => {
  it("removes embedded dates YYYYMMDD", () => {
    expect(normalizeBankDescription("TRANSF CRED 20240715 GALP ENERGIA")).toBe("galp energia");
  });

  it("removes embedded dates DD-MM-YYYY", () => {
    expect(normalizeBankDescription("PAGAMENTO 15-07-2024 GALP ENERGIA")).toBe("galp energia");
  });

  it("removes long numeric references", () => {
    expect(normalizeBankDescription("GALP ENERGIA REF 12345678")).toBe("galp energia");
  });

  it("removes bank noise words", () => {
    expect(normalizeBankDescription("TRANSF CRED GALP ENERGIA")).toBe("galp energia");
    expect(normalizeBankDescription("DEB SEPA NOS COMUNICACOES")).toBe("nos comunicacoes");
    expect(normalizeBankDescription("PAGAMENTO GALP ENERGIA")).toBe("galp energia");
  });

  it("removes accents", () => {
    expect(normalizeBankDescription("TRANSFERÊNCIA GALP ENERGIA")).toBe("galp energia");
  });

  it("returns lowercase result", () => {
    expect(normalizeBankDescription("GALP ENERGIA")).toBe("galp energia");
  });

  it("drops tokens shorter than 3 chars", () => {
    // "MB" (2), "SA" (2) are dropped
    expect(normalizeBankDescription("MB GALP ENERGIA SA")).toBe("galp energia");
  });

  it("produces consistent result for the same supplier across different descriptions", () => {
    const a = normalizeBankDescription("TRANSF CRED 20240715 GALP ENERGIA REF 12345678");
    const b = normalizeBankDescription("PAGAMENTO MB WAY GALP ENERGIA");
    expect(a).toBe("galp energia");
    expect(b).toBe("galp energia");
    expect(a).toBe(b);
  });

  it("returns empty string for all-noise descriptions", () => {
    expect(normalizeBankDescription("TRANSF CRED REF 12345678 20240715")).toBe("");
  });

  it("handles descriptions that are already clean", () => {
    expect(normalizeBankDescription("MAKRO PORTUGAL")).toBe("makro portugal");
  });
});
