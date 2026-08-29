import { describe, it, expect, beforeEach } from "@jest/globals";
import { mintOrganizationId } from "../../../../kernel/organization-id.js";
import { SearchOccurrenceCandidatesUseCase } from "../../application/use-cases/search-occurrence-candidates.use-case.js";
import { FakeOccurrenceMatchReadAdapter } from "../fakes/fake-occurrence-match-read.js";
import type { OccurrenceMatchCandidate } from "../../domain/ports/out/occurrence-match-read.port.js";

function makeCandidate(overrides: Partial<OccurrenceMatchCandidate> = {}): OccurrenceMatchCandidate {
  return {
    id: "occ-1",
    recurrenceId: "rec-1",
    recurrenceName: "Renda Escritório",
    supplierId: "sup-1",
    supplierName: "Proprietário Lda",
    period: "2026-08",
    estimatedAmountCents: 100_000,
    realAmountCents: null,
    effectiveAmountCents: 100_000,
    dueDate: "2026-08-05",
    status: "forecast",
    ...overrides,
  };
}

describe("SearchOccurrenceCandidatesUseCase", () => {
  const organizationId = mintOrganizationId("org-a");
  let port: FakeOccurrenceMatchReadAdapter;
  let useCase: SearchOccurrenceCandidatesUseCase;

  beforeEach(() => {
    port = new FakeOccurrenceMatchReadAdapter();
    useCase = new SearchOccurrenceCandidatesUseCase(port);
  });

  it("retorna lista vazia quando não há ocorrências", async () => {
    const result = await useCase.execute({ organizationId });
    expect(result).toHaveLength(0);
  });

  it("mapeia campos do candidato correctamente", async () => {
    port.seed(organizationId, [makeCandidate()]);
    const [dto] = await useCase.execute({ organizationId });
    expect(dto!.id).toBe("occ-1");
    expect(dto!.recurrenceId).toBe("rec-1");
    expect(dto!.recurrenceName).toBe("Renda Escritório");
    expect(dto!.supplierId).toBe("sup-1");
    expect(dto!.supplierName).toBe("Proprietário Lda");
    expect(dto!.period).toBe("2026-08");
    expect(dto!.effectiveAmountCents).toBe(100_000);
    expect(dto!.dueDate).toBe("2026-08-05");
    expect(dto!.status).toBe("forecast");
  });

  it("usa realAmountCents como effectiveAmountCents quando disponível", async () => {
    port.seed(organizationId, [makeCandidate({ realAmountCents: 95_000, effectiveAmountCents: 95_000 })]);
    const [dto] = await useCase.execute({ organizationId });
    expect(dto!.effectiveAmountCents).toBe(95_000);
  });

  it("filtra por texto (q) em nome da recorrência", async () => {
    port.seed(organizationId, [
      makeCandidate({ id: "occ-1", recurrenceName: "Renda Escritório" }),
      makeCandidate({ id: "occ-2", recurrenceName: "Electricidade" }),
    ]);
    const result = await useCase.execute({ organizationId, q: "renda" });
    expect(result).toHaveLength(1);
    expect(result[0]!.id).toBe("occ-1");
  });

  it("filtra por texto (q) em nome do fornecedor", async () => {
    port.seed(organizationId, [
      makeCandidate({ id: "occ-1", supplierName: "Endesa Portugal" }),
      makeCandidate({ id: "occ-2", supplierName: "EDP Comercial" }),
    ]);
    const result = await useCase.execute({ organizationId, q: "edp" });
    expect(result).toHaveLength(1);
    expect(result[0]!.id).toBe("occ-2");
  });

  it("filtra por dateFrom e dateTo", async () => {
    port.seed(organizationId, [
      makeCandidate({ id: "occ-jul", dueDate: "2026-07-05" }),
      makeCandidate({ id: "occ-aug", dueDate: "2026-08-05" }),
      makeCandidate({ id: "occ-sep", dueDate: "2026-09-05" }),
    ]);
    const result = await useCase.execute({ organizationId, dateFrom: "2026-07-01", dateTo: "2026-08-31" });
    expect(result).toHaveLength(2);
    expect(result.map((r) => r.id).sort()).toEqual(["occ-aug", "occ-jul"]);
  });

  it("exclui ocorrências canceladas", async () => {
    port.seed(organizationId, [
      makeCandidate({ id: "occ-active", status: "forecast" }),
      makeCandidate({ id: "occ-cancelled", status: "cancelled" }),
    ]);
    const result = await useCase.execute({ organizationId });
    expect(result).toHaveLength(1);
    expect(result[0]!.id).toBe("occ-active");
  });

  it("respeita o limit", async () => {
    port.seed(organizationId, [
      makeCandidate({ id: "occ-1" }),
      makeCandidate({ id: "occ-2" }),
      makeCandidate({ id: "occ-3" }),
    ]);
    const result = await useCase.execute({ organizationId, limit: 2 });
    expect(result).toHaveLength(2);
  });

  it("sem query retorna todas as ocorrências não canceladas", async () => {
    port.seed(organizationId, [
      makeCandidate({ id: "occ-forecast", status: "forecast" }),
      makeCandidate({ id: "occ-paid", status: "paid" }),
      makeCandidate({ id: "occ-cancelled", status: "cancelled" }),
    ]);
    const result = await useCase.execute({ organizationId });
    expect(result).toHaveLength(2);
    expect(result.map((r) => r.id).sort()).toEqual(["occ-forecast", "occ-paid"]);
  });
});
