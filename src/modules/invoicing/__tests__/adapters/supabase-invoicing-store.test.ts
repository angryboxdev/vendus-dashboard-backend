import { ScopedQuery } from "../../../../infra/scoped-db/scoped-query.js";
import { dec } from "../../../../kernel/money/decimal.js";
import { mintOrganizationId } from "../../../../kernel/organization-id.js";
import { SupabaseInvoicingStore } from "../../adapters/out/supabase-invoicing-store.js";
import { FINAL_CONSUMER } from "../../domain/entities/parties.js";
import { InvoicingNotFoundError, InvoicingRuleError, StaleSeriesError } from "../../domain/errors.js";
import type { IssuedDocumentRecord } from "../../domain/ports/out/invoicing-store.port.js";
import { computeDocumentTotals } from "../../domain/services/document-totals.service.js";

const ORG = mintOrganizationId("b6999cff-79b2-4583-b8b4-a744b3ace748");
const SERIES = "11111111-1111-4111-8111-111111111111";

interface Call {
  fn: string;
  args: Record<string, unknown>;
}

/** Cliente falso: grava as chamadas RPC e responde às leituras com `rows`. */
function fakeClient(opts: { rpc?: { data?: unknown; error?: { code: string; message: string } }; rows?: unknown[] } = {}) {
  const calls: Call[] = [];
  const eqs: Array<[string, unknown]> = [];
  const result = { data: opts.rows?.[0] ?? null, error: null };
  const builder = {
    select: () => builder,
    eq: (c: string, v: unknown) => (eqs.push([c, v]), builder),
    order: () => builder,
    limit: () => builder,
    maybeSingle: () => Promise.resolve(result),
  };
  const client = {
    rpc: (fn: string, args: Record<string, unknown>) => {
      calls.push({ fn, args });
      return Promise.resolve({ data: opts.rpc?.data ?? null, error: opts.rpc?.error ?? null });
    },
    from: () => builder,
  };
  return { client, calls, eqs };
}

const storeWith = (client: unknown) =>
  new SupabaseInvoicingStore((org) => ScopedQuery.create(org, client as Parameters<typeof ScopedQuery.create>[1]));

const totals = computeDocumentTotals({
  pricesIncludeTax: true,
  lines: [
    { description: "Pizza", quantity: dec("2"), unitPrice: dec("12.50"), tax: { kind: "rate", region: "PT", code: "INT", percentage: dec("13") } },
    { description: "Água", quantity: dec("1"), unitPrice: dec("3.00"), tax: { kind: "exempt", region: "PT", exemptionCode: "M07", exemptionReason: "Isento artigo 9.º do CIVA" } },
  ],
});

const record: IssuedDocumentRecord = {
  seriesRef: SERIES,
  expected: { lastSequence: 0, lastHash: null },
  sequence: 1,
  documentNumber: "FS L01-2027/1",
  documentDate: "2027-03-10",
  taxPointDate: "2027-03-10",
  systemEntryDate: "2027-03-10T12:00:00",
  hash: "h".repeat(171) + "=",
  hashControl: "1",
  keyVersion: 1,
  atcud: "CDF7T5HD-1",
  qrPayload: "A:...",
  pricesIncludeTax: true,
  totals,
  customer: FINAL_CONSUMER,
  issuer: { taxId: "599999999", name: "Empresa Fictícia, Lda", address: { street: "Rua A", postalCode: "4000-001", city: "Porto", country: "PT" } },
  actor: "user-1",
};

describe("SupabaseInvoicingStore", () => {
  it("grava pela RPC de emissão com o estado esperado da série e valores exatos", async () => {
    const { client, calls } = fakeClient({ rpc: { data: "doc-1" } });

    await expect(storeWith(client).saveIssued(ORG, record)).resolves.toEqual({ documentId: "doc-1" });

    expect(calls).toHaveLength(1);
    const { fn, args } = calls[0]!;
    expect(fn).toBe("invoicing_issue_document");
    expect(args).toMatchObject({
      p_org_id: ORG,
      p_series_ref: SERIES,
      p_expected_last_sequence: 0,
      p_expected_last_hash: null,
      p_actor: "user-1",
      p_document: {
        sequence: 1,
        document_number: "FS L01-2027/1",
        atcud: "CDF7T5HD-1",
        system_entry_date: "2027-03-10T12:00:00",
        hash_control: "1",
        key_version: 1,
        prices_include_tax: true,
        // 25,00 a 13 %: IVA 2,88, base 22,12; água isenta 3,00
        net_total: "25.12",
        tax_payable: "2.88",
        gross_total: "28.00",
        customer: { taxId: "999999990", name: "Consumidor final" },
      },
    });
    expect(args.p_lines).toEqual([
      expect.objectContaining({ line_number: 1, description: "Pizza", quantity: "2", unit_price: "12.5", line_amount: "25", tax_code: "INT", tax_percentage: "13", exemption_code: null }),
      expect.objectContaining({ line_number: 2, description: "Água", tax_code: "ISE", tax_percentage: "0", exemption_code: "M07", exemption_reason: "Isento artigo 9.º do CIVA" }),
    ]);
    expect(args.p_taxes).toEqual([
      expect.objectContaining({ tax_code: "INT", tax_percentage: "13", taxable_base: "22.12", tax_amount: "2.88" }),
      expect.objectContaining({ tax_code: "ISE", tax_percentage: "0", exemption_code: "M07", taxable_base: "3.00", tax_amount: "0.00" }),
    ]);
  });

  it.each([
    ["P0001", "stale_series", StaleSeriesError],
    ["P0002", "series_not_found", InvoicingNotFoundError],
    ["P0003", "series_not_communicated", InvoicingRuleError],
    ["P0004", "number_mismatch", InvoicingRuleError],
  ])("traduz o erro %s (%s) da BD", async (code, message, errorClass) => {
    const { client } = fakeClient({ rpc: { error: { code, message } } });
    await expect(storeWith(client).saveIssued(ORG, record)).rejects.toBeInstanceOf(errorClass);
  });

  it("anula pela RPC de anulação, com motivo e autor", async () => {
    const { client, calls } = fakeClient();

    await storeWith(client).cancel(ORG, "doc-1", "Erro no NIF", "user-1");

    expect(calls).toEqual([
      { fn: "invoicing_cancel_document", args: { p_org_id: ORG, p_document_id: "doc-1", p_reason: "Erro no NIF", p_actor: "user-1" } },
    ]);
  });

  it("lê a série filtrada pela organização e devolve o estado do fim da cadeia", async () => {
    const row = {
      id: SERIES,
      legal_entity_id: "22222222-2222-4222-8222-222222222222",
      location_id: null,
      document_type: "FS",
      series_id: "L01-2027",
      mode: "training",
      validation_code: "CDF7T5HD",
      last_sequence: 41,
      last_hash: "H==",
      last_document_date: "2027-03-09",
      last_system_entry_date: "2027-03-09T20:00:00",
    };
    const { client, eqs } = fakeClient({ rows: [row] });

    await expect(storeWith(client).getSeries(ORG, SERIES)).resolves.toEqual({
      ref: SERIES,
      legalEntityId: row.legal_entity_id,
      locationId: null,
      documentType: "FS",
      seriesId: "L01-2027",
      mode: "training",
      validationCode: "CDF7T5HD",
      lastSequence: 41,
      lastHash: "H==",
      lastDocumentDate: "2027-03-09",
      lastSystemEntryDate: "2027-03-09T20:00:00",
    });
    expect(eqs).toEqual([
      ["org_id", ORG],
      ["id", SERIES],
    ]);
  });
});
