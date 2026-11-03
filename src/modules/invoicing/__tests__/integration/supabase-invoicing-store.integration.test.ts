import { randomUUID } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { dec } from "../../../../kernel/money/decimal.js";
import { mintOrganizationId } from "../../../../kernel/organization-id.js";
import type { ScopedQueryFactory } from "../../../../infra/scoped-db/scoped-query.js";
import { RsaSha1Signer } from "../../adapters/out/rsa-sha1-signer.js";
import type { SupabaseInvoicingStore as StoreType } from "../../adapters/out/supabase-invoicing-store.js";
import { FINAL_CONSUMER } from "../../domain/entities/parties.js";
import { InvoicingRuleError, StaleSeriesError } from "../../domain/errors.js";
import type { IssuedDocumentRecord } from "../../domain/ports/out/invoicing-store.port.js";
import { computeDocumentTotals } from "../../domain/services/document-totals.service.js";
import { planNextDocument } from "../../domain/services/next-document.service.js";
import { atPrivateKeyPem } from "../fixtures/at/demo-saft.js";

/**
 * Faturação contra a stack local da Supabase (`supabase start` + `supabase db reset`).
 * Prova o que só a BD garante: compare-and-swap na série sob concorrência e
 * imutabilidade dos registos fiscais (também para a service role).
 * Os registos criados ficam na BD local (são imutáveis por desenho) — `db reset` limpa.
 */
const LOCAL_SUPABASE_URL = process.env.TEST_SUPABASE_URL ?? "http://127.0.0.1:54321";
const LOCAL_SUPABASE_SERVICE_ROLE_KEY =
  process.env.TEST_SUPABASE_SERVICE_ROLE_KEY ??
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU";

const localClient: SupabaseClient = createClient(LOCAL_SUPABASE_URL, LOCAL_SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

jest.mock("../../../../infra/scoped-db/supabase-client.js", () => ({
  getSupabaseServiceRole: () => localClient,
  getSupabase: () => localClient,
  isSupabaseConfigured: () => true,
  isHrSupabaseConfigured: () => true,
}));

const ORG = mintOrganizationId("b6999cff-79b2-4583-b8b4-a744b3ace748");
const signer = new RsaSha1Signer({ privateKeyPem: atPrivateKeyPem, keyVersion: 1 });
let store: StoreType;
let seriesRef: string;

const totals = computeDocumentTotals({
  pricesIncludeTax: true,
  lines: [
    {
      description: "Pizza",
      product: { code: "PZ01", type: "P", unit: "UN" },
      quantity: dec("1"),
      unitPrice: dec("12.50"),
      tax: { kind: "rate", region: "PT", code: "INT", percentage: dec("13") },
    },
  ],
});

/** `systemEntryDate` em hora de Lisboa (março: UTC+0), o instante UTC correspondente. */
async function nextRecord(systemEntryDate: string): Promise<IssuedDocumentRecord> {
  const systemEntryAt = `${systemEntryDate}.000Z`;
  const series = (await store.getSeries(ORG, seriesRef))!;
  const plan = planNextDocument(series, { documentDate: "2027-03-10", systemEntryDate, systemEntryAt, grossTotal: totals.grossTotal });
  const { hash, keyVersion } = await signer.sign(plan.signatureMessage);
  return {
    seriesRef,
    expected: plan.expected,
    sequence: plan.sequence,
    documentNumber: plan.documentNumber,
    documentDate: "2027-03-10",
    taxPointDate: "2027-03-10",
    systemEntryDate,
    systemEntryAt,
    softwareCertificateNumber: "0",
    hash,
    keyVersion,
    atcud: plan.atcud,
    qrPayload: "teste",
    pricesIncludeTax: true,
    totals,
    customer: FINAL_CONSUMER,
    issuer: { taxId: "599999999", name: "Empresa Fictícia, Lda", address: { street: "Rua A", postalCode: "4000-001", city: "Porto", country: "PT" } },
    actor: "integration-test",
  };
}

beforeAll(async () => {
  const { error } = await localClient.from("invoicing_series").select("id").limit(1);
  if (error) {
    throw new Error(`Local Supabase stack unreachable at ${LOCAL_SUPABASE_URL} (run \`supabase start\`, then \`supabase db reset\`): ${error.message}`);
  }
  const { createScopedQuery } = await import("../../../../infra/scoped-db/scoped-query.js");
  const { SupabaseInvoicingStore } = await import("../../adapters/out/supabase-invoicing-store.js");
  store = new SupabaseInvoicingStore(createScopedQuery as ScopedQueryFactory);

  const legalEntityId = randomUUID();
  const le = await localClient.from("legal_entities").insert({
    id: legalEntityId,
    org_id: ORG,
    name: "Empresa Fictícia, Lda",
    country: "PT",
    tax_id_type: "nif",
    tax_id: "599999999",
    social_security_id: "20000000000",
    billing_email: "faturacao@example.invalid",
    street: "Rua A",
    postal_code: "4000-001",
    city: "Porto",
    region: "Porto",
    created_by: "integration-test",
  });
  if (le.error) throw new Error(le.error.message);

  seriesRef = randomUUID();
  const s = await localClient.from("invoicing_series").insert({
    id: seriesRef,
    org_id: ORG,
    legal_entity_id: legalEntityId,
    document_type: "FS",
    series_id: `T${Date.now()}`,
    mode: "training",
    validation_code: "CDF7T5HD",
    created_by: "integration-test",
  });
  if (s.error) throw new Error(s.error.message);
});

describe("SupabaseInvoicingStore (BD real)", () => {
  let firstId: string;

  it("emite o 1.º documento e avança o fim da cadeia da série", async () => {
    const { documentId } = await store.saveIssued(ORG, await nextRecord("2027-03-10T12:00:00"));
    firstId = documentId;
    expect(await store.getSeries(ORG, seriesRef)).toMatchObject({ lastSequence: 1, lastDocumentDate: "2027-03-10" });
  });

  it("duas emissões em simultâneo sobre o mesmo estado: só uma entra, a outra recebe StaleSeriesError", async () => {
    const a = await nextRecord("2027-03-10T12:00:01");
    const b = { ...a, actor: "outro-terminal" };

    const results = await Promise.allSettled([store.saveIssued(ORG, a), store.saveIssued(ORG, b)]);

    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    const rejected = results.find((r) => r.status === "rejected") as PromiseRejectedResult;
    expect(rejected.reason).toBeInstanceOf(StaleSeriesError);
    expect(await store.getSeries(ORG, seriesRef)).toMatchObject({ lastSequence: 2 });
  });

  it("recusa número que não é o seguinte da série", async () => {
    const r = await nextRecord("2027-03-10T12:00:02");
    await expect(store.saveIssued(ORG, { ...r, sequence: 9, documentNumber: r.documentNumber.replace(/\/\d+$/, "/9") })).rejects.toBeInstanceOf(InvoicingRuleError);
  });

  it("documento emitido não se altera nem apaga diretamente (nem com a service role)", async () => {
    const upd = await localClient.from("invoicing_documents").update({ gross_total: 1 }).eq("id", firstId);
    expect(upd.error).not.toBeNull();
    const del = await localClient.from("invoicing_documents").delete().eq("id", firstId);
    expect(del.error).not.toBeNull();
    const lines = await localClient.from("invoicing_document_lines").delete().eq("document_id", firstId);
    expect(lines.error).not.toBeNull();
  });

  it("não se insere documento fora da RPC de emissão", async () => {
    const ins = await localClient.from("invoicing_documents").insert({ org_id: ORG, series_ref: seriesRef });
    expect(ins.error).not.toBeNull();
  });

  it("anula com motivo; segunda anulação é recusada", async () => {
    await store.cancel(ORG, firstId, "Teste de anulação", "integration-test");
    const { data } = await localClient.from("invoicing_documents").select("status, status_reason").eq("id", firstId).single();
    expect(data).toEqual({ status: "A", status_reason: "Teste de anulação" });
    await expect(store.cancel(ORG, firstId, "De novo", "integration-test")).rejects.toBeInstanceOf(InvoicingRuleError);
  });

  it("séries não se apagam e o fim da cadeia não se mexe à mão", async () => {
    expect((await localClient.from("invoicing_series").delete().eq("id", seriesRef)).error).not.toBeNull();
    expect((await localClient.from("invoicing_series").update({ last_sequence: 0, last_hash: null }).eq("id", seriesRef)).error).not.toBeNull();
  });
});
