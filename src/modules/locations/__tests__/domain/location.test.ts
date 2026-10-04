import { Location, type LocationDetails } from "../../domain/entities/location.js";
import { InvalidLocationError } from "../../domain/errors.js";

const NOW = new Date("2026-10-04T10:00:00.000Z");

function details(overrides: Partial<LocationDetails> = {}): LocationDetails {
  return {
    name: "Loja Centro",
    code: null,
    address: null,
    postalCode: null,
    city: null,
    municipality: null,
    country: "PT",
    timezone: "Europe/Lisbon",
    phone: null,
    ...overrides,
  };
}

function fieldsOf(fn: () => unknown): string[] {
  try {
    fn();
  } catch (e) {
    if (e instanceof InvalidLocationError) return e.fieldErrors.map((f) => f.field);
    throw e;
  }
  return [];
}

describe("Location", () => {
  it("create normaliza (trim, código em maiúsculas, vazio → null) e nasce ativo", () => {
    const location = Location.create("loc-1", details({ name: "  Loja Centro ", code: " lc-01 ", city: "  " }), NOW);

    expect(location.name).toBe("Loja Centro");
    expect(location.code).toBe("LC-01");
    expect(location.city).toBeNull();
    expect(location.isActive).toBe(true);
  });

  it("código interno é opcional", () => {
    expect(Location.create("loc-1", details({ code: null }), NOW).code).toBeNull();
  });

  it("reporta todos os campos inválidos de uma vez", () => {
    expect(
      fieldsOf(() =>
        Location.create("loc-1", details({ name: " ", code: "com espaço", postalCode: "4000", phone: "abc", timezone: "Lua/Base" }), NOW),
      ),
    ).toEqual(["name", "code", "postalCode", "phone", "timezone"]);
  });

  it("código postal só é validado no formato português quando o país é PT", () => {
    expect(Location.create("loc-1", details({ country: "ES", postalCode: "33001" }), NOW).postalCode).toBe("33001");
  });

  it("update aplica alterações parciais sem tocar no estado nem na instância original", () => {
    const original = Location.create("loc-1", details(), NOW).deactivate(NOW);

    const updated = original.update({ city: "Porto", municipality: "Porto" }, NOW);

    expect(updated.city).toBe("Porto");
    expect(updated.municipality).toBe("Porto");
    expect(updated.isActive).toBe(false);
    expect(original.city).toBeNull();
  });

  it("inativar mantém id e dados (relações históricas continuam válidas)", () => {
    const location = Location.create("loc-1", details({ code: "MBS" }), NOW);

    const inactive = location.deactivate(NOW);

    expect(inactive.id).toBe("loc-1");
    expect(inactive.code).toBe("MBS");
    expect(inactive.isActive).toBe(false);
    expect(inactive.activate(NOW).isActive).toBe(true);
  });

  it("reconstitute aceita registos antigos só com os 5 campos originais", () => {
    const legacy = Location.reconstitute({ id: "loc-1", name: "Arcozelo", code: "ARC", timezone: "Europe/Lisbon", isActive: true });

    expect(legacy.country).toBe("PT");
    expect(legacy.address).toBeNull();
  });
});
