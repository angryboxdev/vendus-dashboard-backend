import { ScopedQuery } from "../../../../infra/scoped-db/scoped-query.js";
import { decToString } from "../../../../kernel/money/decimal.js";
import { mintOrganizationId } from "../../../../kernel/organization-id.js";
import { SupabaseInvoicingStore } from "../../adapters/out/supabase-invoicing-store.js";
import { InvoicingRuleError } from "../../domain/errors.js";

const ORG = mintOrganizationId("b6999cff-79b2-4583-b8b4-a744b3ace748");

type Result = { data: unknown; error: { code?: string; message: string } | null };

/** Cliente falso: cada `from(tabela)` grava a cadeia de chamadas e responde com o próximo resultado dessa tabela. */
function fakeClient(results: Record<string, Result[]>) {
  const chains: Array<{ table: string; calls: Array<[string, unknown[]]> }> = [];
  const client = {
    from(table: string) {
      const chain = { table, calls: [] as Array<[string, unknown[]]> };
      chains.push(chain);
      const next = () => Promise.resolve(results[table]?.shift() ?? { data: null, error: null });
      const builder: Record<string, unknown> = {};
      for (const m of ["select", "insert", "update", "eq", "in", "contains", "gte", "lte", "order", "limit"]) {
        builder[m] = (...args: unknown[]) => (chain.calls.push([m, args]), builder);
      }
      builder.single = () => (chain.calls.push(["single", []]), next());
      builder.maybeSingle = () => (chain.calls.push(["maybeSingle", []]), next());
      builder.then = (ok: (v: Result) => unknown, ko: (e: unknown) => unknown) => next().then(ok, ko);
      return builder;
    },
  };
  return { client, chains };
}

const storeWith = (client: unknown) =>
  new SupabaseInvoicingStore((org) => ScopedQuery.create(org, client as Parameters<typeof ScopedQuery.create>[1]));

const seriesRow = {
  id: "s1",
  legal_entity_id: "le-1",
  location_id: null,
  document_type: "FS",
  series_id: "L01-2027",
  mode: "training",
  validation_code: null,
  last_sequence: 0,
  last_hash: null,
  last_document_date: null,
  last_system_entry_at: null,
};

describe("SupabaseInvoicingStore — séries e leituras", () => {
  it("cria a série com a organização carimbada e devolve o estado", async () => {
    const { client, chains } = fakeClient({ invoicing_series: [{ data: seriesRow, error: null }] });

    const s = await storeWith(client).createSeries(ORG, { legalEntityId: "le-1", locationId: null, documentType: "FS", seriesId: "L01-2027", mode: "training", actor: "ana" });

    expect(s).toMatchObject({ ref: "s1", seriesId: "L01-2027", mode: "training", lastSequence: 0, validationCode: null });
    const insert = chains[0]!.calls.find(([m]) => m === "insert")![1][0];
    expect(insert).toEqual({ org_id: ORG, legal_entity_id: "le-1", location_id: null, document_type: "FS", series_id: "L01-2027", mode: "training", created_by: "ana" });
  });

  it("série repetida (mesmo emitente e tipo) é erro de regra", async () => {
    const { client } = fakeClient({ invoicing_series: [{ data: null, error: { code: "23505", message: "duplicate key" } }] });
    await expect(
      storeWith(client).createSeries(ORG, { legalEntityId: "le-1", locationId: null, documentType: "FS", seriesId: "L01-2027", mode: "training", actor: "ana" }),
    ).rejects.toBeInstanceOf(InvoicingRuleError);
  });

  it("código de validação recusado pela BD (já preenchido) é erro de regra", async () => {
    const { client } = fakeClient({ invoicing_series: [{ data: null, error: { code: "P0001", message: "invoicing_series: o código de validação da AT não se altera" } }] });
    await expect(storeWith(client).setSeriesValidationCode(ORG, "s1", "ABCDEFGH")).rejects.toBeInstanceOf(InvoicingRuleError);
  });

  it("documentos por id: filtro por organização e ids, totais exatos (texto)", async () => {
    const row = { id: "d1", legal_entity_id: "le-1", document_type: "FS", document_number: "FS L01-2027/1", document_date: "2027-03-10", status: "N", gross_total: "28.00" };
    const { client, chains } = fakeClient({ invoicing_documents: [{ data: [row], error: null }] });

    const [d] = await storeWith(client).documentsByIds(ORG, ["d1"]);

    expect(d).toMatchObject({ id: "d1", documentType: "FS", status: "N" });
    expect(decToString(d!.grossTotal)).toBe("28");
    expect(chains[0]!.calls).toEqual(expect.arrayContaining([["eq", ["org_id", ORG]], ["in", ["id", ["d1"]]]]));
  });

  it("total já creditado = soma das NC ativas que referem o documento", async () => {
    const { client, chains } = fakeClient({ invoicing_documents: [{ data: [{ gross_total: "3.00" }, { gross_total: "1.50" }], error: null }] });

    expect(decToString(await storeWith(client).creditedTotal(ORG, "d1"))).toBe("4.5");
    expect(chains[0]!.calls).toEqual(
      expect.arrayContaining([
        ["eq", ["document_type", "NC"]],
        ["eq", ["status", "N"]],
        ["contains", ["references_to", [{ document_id: "d1" }]]],
      ]),
    );
  });
});
