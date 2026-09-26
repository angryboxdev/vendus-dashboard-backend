import { maskSensitiveValue, shouldMaskSensitiveFields } from "../../domain/services/sensitive-field-masking.service.js";

describe("sensitive-field-masking.service", () => {
  it("mascara tudo menos os últimos 4 caracteres", () => {
    expect(maskSensitiveValue("PT50000201231234567890154")).toBe("*********************0154");
  });

  it("null passa por null", () => {
    expect(maskSensitiveValue(null)).toBeNull();
  });

  it("string vazia passa por si mesma (falsy)", () => {
    expect(maskSensitiveValue("")).toBe("");
  });

  it("só hr_viewer é mascarado — manager/admin veem tudo", () => {
    expect(shouldMaskSensitiveFields("hr_viewer")).toBe(true);
    expect(shouldMaskSensitiveFields("manager")).toBe(false);
    expect(shouldMaskSensitiveFields("admin")).toBe(false);
  });
});
