import { dec, isZero } from "../../../../kernel/money/decimal.js";
import type { AtOutcome } from "../entities/at-communication.js";
import type { StoredDocument } from "../ports/out/invoicing-store.port.js";
import { formatAmount } from "./amount-format.js";
import { soapFault } from "./at-soap.service.js";
import { el, tagText, wrap } from "./xml-text.js";

/**
 * Corpo SOAP do e-Fatura (`Fatcorews.wsdl`, namespace qualificado) a partir do
 * documento gravado — «e-Fatura — Aspetos específicos» v3.0, 2.1 (faturas) e
 * 2.2 (documentos de conferência). Puro.
 */
export const EFATURA_NS = "http://factemi.at.min_financas.pt/documents";
/** Único valor aceite pelo WSDL (padrão `0.0.1`). */
const MD_VERSION = "0.0.1";
const WORK_TYPES = new Set(["CM"]);

const d = (name: string, value: string) => el(`doc:${name}`, value);
const w = (name: string, inner: string) => wrap(`doc:${name}`, inner);
const money = (v: string) => formatAmount(dec(v));

const isWork = (doc: StoredDocument) => WORK_TYPES.has(doc.documentType);

/** 1.º, 11.º, 21.º e 31.º carateres da assinatura; «0» se o programa não está certificado (1.6.9). */
export function hashCharacters(doc: StoredDocument): string {
  if (doc.softwareCertificateNumber === "0") return "0";
  return [0, 10, 20, 30].map((i) => doc.hash.charAt(i)).join("");
}

/** Data e hora do estado atual (InvoiceStatusDate / WorkStatusDate): a da última mudança, senão a da emissão. */
const statusDate = (doc: StoredDocument) => doc.statusEntryDate ?? doc.systemEntryDate;

function header(doc: StoredDocument): string {
  const customer = d("CustomerTaxID", doc.customer.taxId) + d("CustomerTaxIDCountry", doc.customer.country);
  return isWork(doc)
    ? d("DocumentNumber", doc.documentNumber) + d("ATCUD", doc.atcud) + d("WorkDate", doc.documentDate) + d("WorkType", doc.documentType) + customer
    : d("InvoiceNo", doc.documentNumber) +
        d("ATCUD", doc.atcud) +
        d("InvoiceDate", doc.documentDate) +
        d("InvoiceType", doc.documentType) +
        d("SelfBillingIndicator", "0") +
        customer;
}

/**
 * Uma linha por taxa/motivo de isenção (1.6.14): o resumo de impostos gravado
 * já está agrupado assim. Referências (NC/ND) e documentos de origem (consultas
 * de mesa faturadas) repetem-se em cada linha. NC a débito, o resto a crédito.
 */
function lineSummaries(doc: StoredDocument): string {
  const side = doc.documentType === "NC" ? "D" : "C";
  return doc.taxes
    .map((t) =>
      w(
        "LineSummary",
        doc.orderReferences.map((o) => w("OrderReferences", d("OriginatingON", o.documentNumber))).join("") +
          d("TaxPointDate", doc.taxPointDate) +
          doc.referencesTo.map((r) => d("Reference", r.documentNumber)).join("") +
          d("DebitCreditIndicator", side) +
          d("Amount", money(t.taxableBase)) +
          w("Tax", d("TaxType", "IVA") + d("TaxCountryRegion", t.taxRegion) + d("TaxCode", t.taxCode) + d("TaxPercentage", money(t.taxPercentage))) +
          (isZero(dec(t.taxPercentage)) && t.exemptionCode ? d("TaxExemptionCode", t.exemptionCode) : ""),
      ),
    )
    .join("");
}

const totals = (doc: StoredDocument) =>
  w("DocumentTotals", d("TaxPayable", money(doc.taxPayable)) + d("NetTotal", money(doc.netTotal)) + d("GrossTotal", formatAmount(doc.grossTotal)));

/** `RegisterInvoiceRequest` (FT/FS/FR/NC/ND) ou `RegisterWorkRequest` (CM), com o estado atual do documento. */
export function efaturaRegisterBody(doc: StoredDocument): string {
  const common =
    d("eFaturaMDVersion", MD_VERSION) +
    d("AuditFileVersion", "1.04_01") +
    d("TaxRegistrationNumber", doc.issuer.taxId) +
    // Faturação centralizada: «Global» (1.4).
    d("TaxEntity", "Global") +
    d("SoftwareCertificateNumber", doc.softwareCertificateNumber);
  if (isWork(doc)) {
    const data =
      header(doc) +
      w("DocumentStatus", d("WorkStatus", doc.status) + d("WorkStatusDate", statusDate(doc))) +
      d("HashCharacters", hashCharacters(doc)) +
      d("SystemEntryDate", doc.systemEntryDate) +
      lineSummaries(doc) +
      totals(doc);
    return `<doc:RegisterWorkRequest xmlns:doc="${EFATURA_NS}">${common}${w("WorkData", data)}</doc:RegisterWorkRequest>`;
  }
  const data =
    header(doc) +
    w("DocumentStatus", d("InvoiceStatus", doc.status) + d("InvoiceStatusDate", statusDate(doc))) +
    d("HashCharacters", hashCharacters(doc)) +
    d("CashVATSchemeIndicator", "0") +
    d("PaperLessIndicator", "0") +
    d("SystemEntryDate", doc.systemEntryDate) +
    lineSummaries(doc) +
    totals(doc);
  return `<doc:RegisterInvoiceRequest xmlns:doc="${EFATURA_NS}">${common}${w("InvoiceData", data)}</doc:RegisterInvoiceRequest>`;
}

/** `ChangeInvoiceStatusRequest` / `ChangeWorkStatusRequest`: comunica o estado atual (anulação, CM faturada). */
export function efaturaChangeStatusBody(doc: StoredDocument): string {
  const common = d("eFaturaMDVersion", MD_VERSION) + d("TaxRegistrationNumber", doc.issuer.taxId);
  if (isWork(doc)) {
    return `<doc:ChangeWorkStatusRequest xmlns:doc="${EFATURA_NS}">${common}${w("WorkHeader", header(doc))}${w("WorkStatus", d("WorkStatus", doc.status) + d("WorkStatusDate", statusDate(doc)))}</doc:ChangeWorkStatusRequest>`;
  }
  return `<doc:ChangeInvoiceStatusRequest xmlns:doc="${EFATURA_NS}">${common}${w("InvoiceHeader", header(doc))}${w("InvoiceStatus", d("InvoiceStatus", doc.status) + d("InvoiceStatusDate", statusDate(doc)))}</doc:ChangeInvoiceStatusRequest>`;
}

export interface EfaturaResponse {
  outcome: AtOutcome;
  code: number | null;
  message: string;
}

/**
 * Classifica a resposta (Aspetos específicos, 2.1.1.2): 0 sucesso; −10 «já
 * registado pelo emitente» conta como aceite (um reenvio depois de uma resposta
 * perdida); 1–99 autenticação; −97/−99 erro da AT (repetir); outros negativos,
 * dados recusados. SOAP Fault ou resposta ilegível → repetir.
 */
export function parseEfaturaResponse(xml: string): EfaturaResponse {
  const fault = soapFault(xml);
  if (fault !== null) return { outcome: "failed", code: null, message: fault.slice(0, 1000) };
  const raw = tagText(xml, "CodigoResposta");
  const code = raw !== null && /^-?\d+$/.test(raw) ? Number(raw) : null;
  const message = (tagText(xml, "Mensagem") ?? "").slice(0, 1000);
  if (code === null) return { outcome: "failed", code: null, message: message || "Resposta da AT sem código" };
  if (code === 0 || code === -10) return { outcome: "accepted", code, message };
  if (code > 0) return { outcome: "auth", code, message };
  if (code === -97 || code === -99) return { outcome: "failed", code, message };
  return { outcome: "rejected", code, message };
}
