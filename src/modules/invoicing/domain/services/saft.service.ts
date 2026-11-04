import { dec, isZero, roundTo, type Dec } from "../../../../kernel/money/decimal.js";
import { distribute } from "../../../../kernel/money/document-amounts.js";
import type { IssuerSnapshot } from "../entities/parties.js";
import type { DocumentLineView, StoredDocument } from "../ports/out/invoicing-store.port.js";
import { formatAmount } from "./amount-format.js";
import { add, mulDivRound, ZERO } from "./decimal-ops.js";

/**
 * Ficheiro SAF-T (PT) 1.04_01 de faturação (Portaria 302/2016; XSD
 * `__tests__/fixtures/at/SAFTPT1.04_01.xsd`). Puro: monta o XML por ordem do
 * esquema a partir dos documentos gravados. Regras das asserções do XSD 1.1:
 * menção e código de isenção só (e sempre) nas linhas a 0 %.
 */
export interface SaftInput {
  issuer: IssuerSnapshot;
  startDate: string;
  endDate: string;
  dateCreated: string;
  /** NIF da empresa produtora do software. */
  producerTaxId: string;
  /** «Produto/Produtora». */
  productId: string;
  productVersion: string;
  /** «0» enquanto o programa não está certificado. */
  certificateNumber: string;
  /** Documentos do período (incluindo anulados), por ordem de emissão. */
  documents: StoredDocument[];
}

const NS = "urn:OECD:StandardAuditFile-Tax:PT_1.04_01";
const UNKNOWN = "Desconhecido";
const WORK_TYPES = new Set(["CM"]);

const esc = (v: string) => v.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");
const el = (name: string, value: string) => `<${name}>${esc(value)}</${name}>`;
const wrap = (name: string, inner: string) => `<${name}>${inner}</${name}>`;
/** Texto cortado ao máximo do XSD (a BD guarda sempre o texto completo). */
const fit = (v: string, max: number) => v.slice(0, max);
const money = (v: string | Dec) => formatAmount(typeof v === "string" ? dec(v) : v);
/** Decimais exatos sem zeros desnecessários (quantidades, percentagens, preços unitários). */
const plain = (v: Dec) => {
  const s = formatAmount6(v);
  return s.includes(".") ? s.replace(/0+$/, "").replace(/\.$/, "") : s;
};
const formatAmount6 = (v: Dec) => {
  const r = roundTo(v, 6);
  const neg = r.units < 0n;
  const d = (neg ? -r.units : r.units).toString().padStart(7, "0");
  return `${neg ? "-" : ""}${d.slice(0, -6)}.${d.slice(-6)}`;
};

const isCustomerAddressKnown = (d: StoredDocument) => d.customer.address !== null;

function customerXml(d: StoredDocument): string {
  const c = d.customer;
  const a = c.address;
  return wrap(
    "Customer",
    el("CustomerID", c.customerId) +
      el("AccountID", UNKNOWN) +
      el("CustomerTaxID", c.taxId) +
      el("CompanyName", c.name) +
      wrap(
        "BillingAddress",
        isCustomerAddressKnown(d) && a
          ? el("AddressDetail", a.street) + el("City", a.city) + el("PostalCode", a.postalCode) + el("Country", a.country)
          : el("AddressDetail", UNKNOWN) + el("City", UNKNOWN) + el("PostalCode", UNKNOWN) + el("Country", UNKNOWN),
      ) +
      el("SelfBillingIndicator", "0"),
  );
}

/** Chave do grupo de imposto de uma linha (a mesma do resumo de impostos gravado). */
const taxKey = (t: { taxRegion: string; taxCode: string; taxPercentage: string; exemptionCode: string | null }) =>
  `${t.taxRegion}|${t.taxCode}|${plain(dec(t.taxPercentage))}|${t.exemptionCode ?? ""}`;

/**
 * Valor sem IVA de cada linha: a base de cada grupo de imposto (gravada no
 * documento) repartida pelas linhas do grupo em proporção do seu valor, ao
 * cêntimo, com soma exata.
 */
function lineNets(d: StoredDocument): Map<number, Dec> {
  const out = new Map<number, Dec>();
  const groups = new Map<string, DocumentLineView[]>();
  for (const l of d.lines) groups.set(taxKey(l), [...(groups.get(taxKey(l)) ?? []), l]);
  for (const [key, lines] of groups) {
    const tax = d.taxes.find((t) => taxKey(t) === key);
    if (!tax) throw new Error(`SAF-T: linhas sem resumo de imposto (${d.documentNumber}, ${key})`);
    const baseCents = Number(roundTo(dec(tax.taxableBase), 2).units);
    const weights = lines.map((l) => Number(roundTo(dec(l.lineAmount), 6).units));
    distribute(baseCents, weights).forEach((cents, i) => out.set(lines[i]!.lineNumber, { units: BigInt(cents), scale: 2 }));
  }
  return out;
}

function lineXml(d: StoredDocument, l: DocumentLineView, net: Dec, side: "CreditAmount" | "DebitAmount"): string {
  const quantity = dec(l.quantity);
  const unitPrice = mulDivRound(net, { units: 1n, scale: 0 }, quantity, 6);
  const exempt = isZero(dec(l.taxPercentage));
  const reference = d.referencesTo[0];
  return wrap(
    "Line",
    el("LineNumber", String(l.lineNumber)) +
      d.orderReferences.map((o) => wrap("OrderReferences", el("OriginatingON", o.documentNumber))).join("") +
      el("ProductCode", l.productCode) +
      el("ProductDescription", l.description) +
      el("Quantity", plain(quantity)) +
      el("UnitOfMeasure", l.unitOfMeasure) +
      el("UnitPrice", plain(unitPrice)) +
      el("TaxPointDate", d.taxPointDate) +
      (reference ? wrap("References", el("Reference", reference.documentNumber) + (reference.reason ? el("Reason", fit(reference.reason, 50)) : "")) : "") +
      el("Description", l.description) +
      el(side, money(net)) +
      wrap("Tax", el("TaxType", "IVA") + el("TaxCountryRegion", l.taxRegion) + el("TaxCode", l.taxCode) + el("TaxPercentage", plain(dec(l.taxPercentage)))) +
      (exempt ? el("TaxExemptionReason", l.exemptionReason ?? "") + el("TaxExemptionCode", l.exemptionCode ?? "") : ""),
  );
}

function statusXml(prefix: "Invoice" | "Work", d: StoredDocument): string {
  return wrap(
    "DocumentStatus",
    el(`${prefix}Status`, d.status) +
      el(`${prefix}StatusDate`, d.status === "N" ? d.systemEntryDate : (d.statusEntryDate ?? d.systemEntryDate)) +
      (d.statusReason ? el("Reason", fit(d.statusReason, 50)) : "") +
      el("SourceID", fit(d.createdBy, 30)) +
      el("SourceBilling", "P"),
  );
}

function totalsXml(d: StoredDocument): string {
  const payment =
    d.documentType === "FR" && d.paymentMechanism
      ? wrap("Payment", el("PaymentMechanism", d.paymentMechanism) + el("PaymentAmount", money(d.grossTotal)) + el("PaymentDate", d.documentDate))
      : "";
  return wrap("DocumentTotals", el("TaxPayable", money(d.taxPayable)) + el("NetTotal", money(d.netTotal)) + el("GrossTotal", money(d.grossTotal)) + payment);
}

function invoiceXml(d: StoredDocument): string {
  const nets = lineNets(d);
  const side = d.documentType === "NC" ? "DebitAmount" : "CreditAmount";
  return wrap(
    "Invoice",
    el("InvoiceNo", d.documentNumber) +
      el("ATCUD", d.atcud) +
      statusXml("Invoice", d) +
      el("Hash", d.hash) +
      el("HashControl", d.hashControl) +
      el("InvoiceDate", d.documentDate) +
      el("InvoiceType", d.documentType) +
      wrap("SpecialRegimes", el("SelfBillingIndicator", "0") + el("CashVATSchemeIndicator", "0") + el("ThirdPartiesBillingIndicator", "0")) +
      el("SourceID", fit(d.createdBy, 30)) +
      el("SystemEntryDate", d.systemEntryDate) +
      el("CustomerID", d.customer.customerId) +
      d.lines.map((l) => lineXml(d, l, nets.get(l.lineNumber)!, side)).join("") +
      totalsXml(d),
  );
}

function workDocumentXml(d: StoredDocument): string {
  const nets = lineNets(d);
  return wrap(
    "WorkDocument",
    el("DocumentNumber", d.documentNumber) +
      el("ATCUD", d.atcud) +
      statusXml("Work", d) +
      el("Hash", d.hash) +
      el("HashControl", d.hashControl) +
      el("WorkDate", d.documentDate) +
      el("WorkType", d.documentType) +
      el("SourceID", fit(d.createdBy, 30)) +
      el("SystemEntryDate", d.systemEntryDate) +
      el("CustomerID", d.customer.customerId) +
      d.lines.map((l) => lineXml(d, l, nets.get(l.lineNumber)!, "CreditAmount")).join("") +
      totalsXml(d),
  );
}

/** Totais de controlo: os anulados contam nas entradas mas não nos totais (Portaria 302/2016, 4.x.2/4.x.3). */
function controlTotals(docs: StoredDocument[]) {
  let debit = ZERO;
  let credit = ZERO;
  for (const d of docs) {
    if (d.status === "A") continue;
    if (d.documentType === "NC") debit = add(debit, dec(d.netTotal));
    else credit = add(credit, dec(d.netTotal));
  }
  return el("NumberOfEntries", String(docs.length)) + el("TotalDebit", money(debit)) + el("TotalCredit", money(credit));
}

export function buildSaftXml(input: SaftInput): string {
  const { issuer, documents } = input;
  const invoices = documents.filter((d) => !WORK_TYPES.has(d.documentType));
  const work = documents.filter((d) => WORK_TYPES.has(d.documentType));

  const customers = new Map<string, string>();
  const products = new Map<string, string>();
  const taxes = new Map<string, string>();
  for (const d of documents) {
    if (!customers.has(d.customer.customerId)) customers.set(d.customer.customerId, customerXml(d));
    for (const l of d.lines) {
      if (!products.has(l.productCode)) {
        products.set(
          l.productCode,
          wrap("Product", el("ProductType", l.productType) + el("ProductCode", l.productCode) + el("ProductDescription", l.description) + el("ProductNumberCode", l.productCode)),
        );
      }
      const key = `${l.taxRegion}|${l.taxCode}|${plain(dec(l.taxPercentage))}`;
      if (!taxes.has(key)) {
        const description = l.taxCode === "ISE" ? "Isento" : l.taxCode === "RED" ? "Taxa reduzida" : l.taxCode === "INT" ? "Taxa intermédia" : "Taxa normal";
        taxes.set(
          key,
          wrap(
            "TaxTableEntry",
            el("TaxType", "IVA") + el("TaxCountryRegion", l.taxRegion) + el("TaxCode", l.taxCode) + el("Description", description) + el("TaxPercentage", plain(dec(l.taxPercentage))),
          ),
        );
      }
    }
  }

  const header = wrap(
    "Header",
    el("AuditFileVersion", "1.04_01") +
      el("CompanyID", issuer.taxId) +
      el("TaxRegistrationNumber", issuer.taxId) +
      el("TaxAccountingBasis", "F") +
      el("CompanyName", fit(issuer.name, 100)) +
      wrap("CompanyAddress", el("AddressDetail", fit(issuer.address.street, 210)) + el("City", fit(issuer.address.city, 50)) + el("PostalCode", issuer.address.postalCode) + el("Country", issuer.address.country)) +
      el("FiscalYear", input.startDate.slice(0, 4)) +
      el("StartDate", input.startDate) +
      el("EndDate", input.endDate) +
      el("CurrencyCode", "EUR") +
      el("DateCreated", input.dateCreated) +
      el("TaxEntity", "Global") +
      el("ProductCompanyTaxID", input.producerTaxId) +
      el("SoftwareCertificateNumber", input.certificateNumber) +
      el("ProductID", input.productId) +
      el("ProductVersion", input.productVersion),
  );

  const masterFiles = wrap("MasterFiles", [...customers.values()].join("") + [...products.values()].join("") + (taxes.size > 0 ? wrap("TaxTable", [...taxes.values()].join("")) : ""));
  const sourceDocuments = wrap(
    "SourceDocuments",
    wrap("SalesInvoices", controlTotals(invoices) + invoices.map(invoiceXml).join("")) +
      (work.length > 0 ? wrap("WorkingDocuments", controlTotals(work) + work.map(workDocumentXml).join("")) : ""),
  );
  return `<?xml version="1.0" encoding="UTF-8"?>\n<AuditFile xmlns="${NS}">${header}${masterFiles}${sourceDocuments}</AuditFile>\n`;
}
