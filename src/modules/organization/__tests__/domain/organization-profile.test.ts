import { OrganizationProfile } from "../../domain/entities/organization-profile.js";
import { InvalidOrganizationProfileError } from "../../domain/errors.js";
import { isValidPortugueseNif } from "../../domain/services/organization-profile-validation.service.js";
import { profileProps } from "../fakes/fakes.js";

const NOW = new Date("2026-10-04T10:00:00.000Z");

function fieldErrorsOf(fn: () => unknown): string[] {
  try {
    fn();
  } catch (e) {
    if (e instanceof InvalidOrganizationProfileError) return e.fieldErrors.map((f) => f.field);
    throw e;
  }
  return [];
}

describe("isValidPortugueseNif", () => {
  it("aceita NIF com dígito de controlo correto e recusa os restantes", () => {
    expect(isValidPortugueseNif("123456789")).toBe(true);
    expect(isValidPortugueseNif("123456780")).toBe(false);
    expect(isValidPortugueseNif("12345678")).toBe(false);
    expect(isValidPortugueseNif("12345678A")).toBe(false);
  });
});

describe("OrganizationProfile.update", () => {
  it("aplica alterações, normaliza e devolve nova instância sem alterar a original", () => {
    const original = OrganizationProfile.reconstitute(profileProps());

    const updated = original.update(
      {
        legalName: "  Exemplo Restauração, Lda  ",
        nif: "123 456 789",
        email: "Geral@Exemplo.PT",
        website: "exemplo.pt",
        postalCode: "4000-123",
        country: "pt",
      },
      NOW,
    );

    const props = updated.toProps();
    expect(props.legalName).toBe("Exemplo Restauração, Lda");
    expect(props.nif).toBe("123456789");
    expect(props.email).toBe("geral@exemplo.pt");
    expect(props.website).toBe("https://exemplo.pt");
    expect(props.country).toBe("PT");
    expect(props.updatedAt).toBe(NOW.toISOString());
    expect(original.toProps().legalName).toBeNull();
  });

  it("exige razão social a partir da primeira edição", () => {
    const profile = OrganizationProfile.reconstitute(profileProps());
    expect(fieldErrorsOf(() => profile.update({ email: "a@b.pt" }, NOW))).toEqual(["legalName"]);
  });

  it("valida NIF, NISS e código postal portugueses e reporta todos os campos de uma vez", () => {
    const profile = OrganizationProfile.reconstitute(profileProps({ legalName: "Exemplo, Lda" }));

    const fields = fieldErrorsOf(() =>
      profile.update({ nif: "123456780", niss: "123", postalCode: "4000123", email: "sem-arroba", timezone: "Lua/Base" }, NOW),
    );

    expect(fields).toEqual(["nif", "niss", "postalCode", "email", "timezone"]);
  });

  it("não aplica regras portuguesas a outro país", () => {
    const profile = OrganizationProfile.reconstitute(profileProps({ legalName: "Ejemplo, SL" }));

    const updated = profile.update({ country: "ES", nif: "B12345678", postalCode: "33001", timezone: "Europe/Madrid" }, NOW);

    expect(updated.toProps().nif).toBe("B12345678");
  });

  it("limpar um campo opcional grava null", () => {
    const profile = OrganizationProfile.reconstitute(profileProps({ legalName: "Exemplo, Lda", phone: "+351 220 000 000" }));
    expect(profile.update({ phone: "   " }, NOW).toProps().phone).toBeNull();
  });
});
