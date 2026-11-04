import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { dec } from "../../../../kernel/money/decimal.js";
import type { StoredDocument } from "../../domain/ports/out/invoicing-store.port.js";
import { buildSaftXml, type SaftInput } from "../../domain/services/saft.service.js";

const H = (c: string) => c.repeat(171) + "=";
const ISSUER = { taxId: "599999999", name: "Empresa Fictícia & Filhos, Lda", address: { street: "Rua A, 1", postalCode: "4000-001", city: "Porto", country: "PT" } };
const FINAL = { customerId: "Consumidor final", taxId: "999999990", name: "Consumidor final", country: "PT", address: null };

function doc(over: Partial<StoredDocument>): StoredDocument {
  return {
    id: "d",
    legalEntityId: "le",
    documentType: "FS",
    seriesMode: "training",
    customerTaxId: "999999990",
    documentNumber: "FS L01-2027/1",
    documentDate: "2027-03-10",
    status: "N",
    grossTotal: dec("28.10"),
    seriesRef: "s",
    sequence: 1,
    taxPointDate: "2027-03-10",
    systemEntryDate: "2027-03-10T12:00:00",
    systemEntryAt: "2027-03-10T12:00:00.000Z",
    softwareCertificateNumber: "0",
    hash: H("a"),
    hashControl: "0",
    atcud: "CDF7T5HD-1",
    qrPayload: "q",
    pricesIncludeTax: true,
    netTotal: "24.66",
    taxPayable: "3.44",
    paymentMechanism: null,
    customer: FINAL,
    issuer: ISSUER,
    referencesTo: [],
    orderReferences: [],
    statusReason: null,
    statusChangedAt: null,
    statusChangedBy: null,
    statusEntryDate: null,
    createdBy: "ana@example.invalid",
    lines: [],
    taxes: [],
    ...over,
  };
}

const line = (n: number, over: Partial<StoredDocument["lines"][number]>): StoredDocument["lines"][number] => ({
  lineNumber: n,
  productCode: "PZ01",
  productType: "P",
  unitOfMeasure: "UN",
  description: "Pizza <Margherita>",
  quantity: "2",
  unitPrice: "12.5",
  discountPct: null,
  lineAmount: "25",
  taxRegion: "PT",
  taxCode: "INT",
  taxPercentage: "13",
  exemptionCode: null,
  exemptionReason: null,
  ...over,
});

// FS: 2 pizzas a 13 % (25,00) + cerveja a 23 % (3,00) + depósito não sujeito M99 (0,10)
const fs = doc({
  id: "fs1",
  lines: [
    line(1, {}),
    line(2, { productCode: "CV01", description: "Cerveja", quantity: "1", unitPrice: "3", lineAmount: "3", taxCode: "NOR", taxPercentage: "23" }),
    line(3, { productCode: "DP", productType: "S", description: "Depósito", quantity: "1", unitPrice: "0.1", lineAmount: "0.1", taxCode: "ISE", taxPercentage: "0", exemptionCode: "M99", exemptionReason: "Não sujeito ou não tributado" }),
  ],
  taxes: [
    { taxRegion: "PT", taxCode: "INT", taxPercentage: "13", exemptionCode: null, exemptionReason: null, taxableBase: "22.12", taxAmount: "2.88" },
    { taxRegion: "PT", taxCode: "NOR", taxPercentage: "23", exemptionCode: null, exemptionReason: null, taxableBase: "2.44", taxAmount: "0.56" },
    { taxRegion: "PT", taxCode: "ISE", taxPercentage: "0", exemptionCode: "M99", exemptionReason: "Não sujeito ou não tributado", taxableBase: "0.10", taxAmount: "0.00" },
  ],
});

const cancelled = doc({
  id: "ft1",
  documentType: "FT",
  documentNumber: "FT L01-2027/1",
  atcud: "CDF7T5HD-1",
  status: "A",
  statusReason: "NIF do adquirente errado",
  statusEntryDate: "2027-03-10T13:00:00",
  statusChangedBy: "quemanulou",
  customer: { customerId: "123456789", taxId: "123456789", name: "Cliente, Lda", country: "PT", address: { street: "Rua B", postalCode: "1000-001", city: "Lisboa", country: "PT" } },
  customerTaxId: "123456789",
  grossTotal: dec("12.50"),
  netTotal: "11.06",
  taxPayable: "1.44",
  lines: [line(1, { quantity: "1", lineAmount: "12.5" })],
  taxes: [{ taxRegion: "PT", taxCode: "INT", taxPercentage: "13", exemptionCode: null, exemptionReason: null, taxableBase: "11.06", taxAmount: "1.44" }],
});

const nc = doc({
  id: "nc1",
  documentType: "NC",
  documentNumber: "NC L01-2027/1",
  atcud: "CDF7T5HD-1",
  grossTotal: dec("3.00"),
  netTotal: "2.44",
  taxPayable: "0.56",
  referencesTo: [{ documentId: "fs1", documentNumber: "FS L01-2027/1", reason: "Devolução" }],
  lines: [line(1, { productCode: "CV01", description: "Cerveja", quantity: "1", unitPrice: "3", lineAmount: "3", taxCode: "NOR", taxPercentage: "23" })],
  taxes: [{ taxRegion: "PT", taxCode: "NOR", taxPercentage: "23", exemptionCode: null, exemptionReason: null, taxableBase: "2.44", taxAmount: "0.56" }],
});

const cm = doc({
  id: "cm1",
  documentType: "CM",
  documentNumber: "CM L01-2027/1",
  atcud: "CDF7T5HD-1",
  grossTotal: dec("12.50"),
  netTotal: "11.06",
  taxPayable: "1.44",
  lines: [line(1, { quantity: "1", lineAmount: "12.5" })],
  taxes: [{ taxRegion: "PT", taxCode: "INT", taxPercentage: "13", exemptionCode: null, exemptionReason: null, taxableBase: "11.06", taxAmount: "1.44" }],
});

const input: SaftInput = {
  issuer: ISSUER,
  startDate: "2027-03-01",
  endDate: "2027-03-31",
  dateCreated: "2027-04-02",
  producerTaxId: "599999999",
  productId: "Mezza/Empresa Fictícia",
  productVersion: "1.0.0",
  certificateNumber: "0",
  documents: [fs, cancelled, nc, cm],
};

const xml = buildSaftXml(input);
// Para validar à mão contra o XSD oficial (ver .scratch/certificacao-at/validacao-saft/).
writeFileSync(join(__dirname, "..", "fixtures", "saft-gerado.test-output.xml"), xml, "utf8");

const between = (open: string, close: string) => {
  const start = xml.indexOf(open);
  return xml.slice(start, xml.indexOf(close, start) + close.length);
};
const all = (re: RegExp) => [...xml.matchAll(re)].map((m) => m[1]);

describe("SAF-T (PT) 1.04_01 — faturação (Portaria 302/2016)", () => {
  it("cabeçalho: versão, NIF, base F (faturação), período, n.º de certificado e software", () => {
    expect(xml.startsWith('<?xml version="1.0" encoding="UTF-8"?>\n<AuditFile xmlns="urn:OECD:StandardAuditFile-Tax:PT_1.04_01">')).toBe(true);
    expect(between("<Header>", "</Header>")).toBe(
      "<Header><AuditFileVersion>1.04_01</AuditFileVersion><CompanyID>599999999</CompanyID><TaxRegistrationNumber>599999999</TaxRegistrationNumber>" +
        "<TaxAccountingBasis>F</TaxAccountingBasis><CompanyName>Empresa Fictícia &amp; Filhos, Lda</CompanyName>" +
        "<CompanyAddress><AddressDetail>Rua A, 1</AddressDetail><City>Porto</City><PostalCode>4000-001</PostalCode><Country>PT</Country></CompanyAddress>" +
        "<FiscalYear>2027</FiscalYear><StartDate>2027-03-01</StartDate><EndDate>2027-03-31</EndDate><CurrencyCode>EUR</CurrencyCode>" +
        "<DateCreated>2027-04-02</DateCreated><TaxEntity>Global</TaxEntity><ProductCompanyTaxID>599999999</ProductCompanyTaxID>" +
        "<SoftwareCertificateNumber>0</SoftwareCertificateNumber><ProductID>Mezza/Empresa Fictícia</ProductID><ProductVersion>1.0.0</ProductVersion></Header>",
    );
  });

  it("tabelas mestras: um cliente por CustomerID (consumidor final «Desconhecido»), produtos únicos e taxas usadas", () => {
    expect(all(/<CustomerID>([^<]*)<\/CustomerID><AccountID>/g)).toEqual(["Consumidor final", "123456789"]);
    expect(xml).toContain(
      "<Customer><CustomerID>Consumidor final</CustomerID><AccountID>Desconhecido</AccountID><CustomerTaxID>999999990</CustomerTaxID><CompanyName>Consumidor final</CompanyName>" +
        "<BillingAddress><AddressDetail>Desconhecido</AddressDetail><City>Desconhecido</City><PostalCode>Desconhecido</PostalCode><Country>Desconhecido</Country></BillingAddress><SelfBillingIndicator>0</SelfBillingIndicator></Customer>",
    );
    expect(all(/<Product><ProductType>[A-Z]<\/ProductType><ProductCode>([^<]*)</g)).toEqual(["PZ01", "CV01", "DP"]);
    expect(all(/<TaxTableEntry><TaxType>IVA<\/TaxType><TaxCountryRegion>PT<\/TaxCountryRegion><TaxCode>([A-Z]+)<\/TaxCode>/g)).toEqual(["INT", "NOR", "ISE"]);
  });

  it("totais de controlo: anulados contam nas entradas mas não nos totais; NC no débito", () => {
    // Créditos: FS 24,66 (a anulada FT não conta). Débitos: NC 2,44.
    expect(xml).toContain("<SalesInvoices><NumberOfEntries>3</NumberOfEntries><TotalDebit>2.44</TotalDebit><TotalCredit>24.66</TotalCredit>");
    expect(xml).toContain("<WorkingDocuments><NumberOfEntries>1</NumberOfEntries><TotalDebit>0.00</TotalDebit><TotalCredit>11.06</TotalCredit>");
  });

  it("linhas sem IVA somam exatamente a base de cada taxa; UnitPrice = valor da linha ÷ quantidade", () => {
    const inv = between("<InvoiceNo>FS L01-2027/1</InvoiceNo>", "</Invoice>");
    expect(all(/<CreditAmount>([^<]*)<\/CreditAmount>/g).slice(0, 3)).toEqual(["22.12", "2.44", "0.10"]);
    expect(inv).toContain("<Quantity>2</Quantity><UnitOfMeasure>UN</UnitOfMeasure><UnitPrice>11.06</UnitPrice>");
    expect(inv).toContain("<DocumentTotals><TaxPayable>3.44</TaxPayable><NetTotal>24.66</NetTotal><GrossTotal>28.10</GrossTotal></DocumentTotals>");
  });

  it("regras das asserções do XSD: motivo de isenção só (e sempre) com taxa 0, com código", () => {
    const lines = [...xml.matchAll(/<Line>([\s\S]*?)<\/Line>/g)].map((m) => m[1]!);
    for (const l of lines) {
      const zero = /<TaxPercentage>0(\.0+)?<\/TaxPercentage>/.test(l);
      expect(l.includes("<TaxExemptionReason>")).toBe(zero);
      expect(l.includes("<TaxExemptionCode>")).toBe(zero);
    }
    expect(xml).toContain("<TaxExemptionReason>Não sujeito ou não tributado</TaxExemptionReason><TaxExemptionCode>M99</TaxExemptionCode>");
  });

  it("documento: estado, ATCUD, hash, HashControl, autor, data de registo, cliente, sem negativos", () => {
    const inv = between("<InvoiceNo>FT L01-2027/1</InvoiceNo>", "</Invoice>");
    expect(inv).toContain(
      "<ATCUD>CDF7T5HD-1</ATCUD><DocumentStatus><InvoiceStatus>A</InvoiceStatus><InvoiceStatusDate>2027-03-10T13:00:00</InvoiceStatusDate>" +
        "<Reason>NIF do adquirente errado</Reason><SourceID>quemanulou</SourceID><SourceBilling>P</SourceBilling></DocumentStatus>" +
        `<Hash>${H("a")}</Hash><HashControl>0</HashControl><InvoiceDate>2027-03-10</InvoiceDate><InvoiceType>FT</InvoiceType>` +
        "<SpecialRegimes><SelfBillingIndicator>0</SelfBillingIndicator><CashVATSchemeIndicator>0</CashVATSchemeIndicator><ThirdPartiesBillingIndicator>0</ThirdPartiesBillingIndicator></SpecialRegimes>" +
        "<SourceID>ana@example.invalid</SourceID><SystemEntryDate>2027-03-10T12:00:00</SystemEntryDate><CustomerID>123456789</CustomerID>",
    );
    expect(xml).not.toMatch(/<(CreditAmount|DebitAmount|UnitPrice|NetTotal|GrossTotal)>-/);
  });

  it("nota de crédito: valores a débito e referência ao documento retificado com motivo", () => {
    const inv = between("<InvoiceNo>NC L01-2027/1</InvoiceNo>", "</Invoice>");
    expect(inv).toContain("<References><Reference>FS L01-2027/1</Reference><Reason>Devolução</Reason></References><Description>Cerveja</Description><DebitAmount>2.44</DebitAmount>");
  });

  it("consulta de mesa vai para WorkingDocuments com WorkType CM", () => {
    expect(between("<WorkDocument>", "</WorkDocument>")).toContain("<DocumentNumber>CM L01-2027/1</DocumentNumber><ATCUD>CDF7T5HD-1</ATCUD><DocumentStatus><WorkStatus>N</WorkStatus><WorkStatusDate>2027-03-10T12:00:00</WorkStatusDate>");
    expect(xml).toContain("<WorkDate>2027-03-10</WorkDate><WorkType>CM</WorkType>");
  });

  it("textos com limite no XSD são cortados ao máximo (SourceID 30, Reason 50, nome 100, localidade 50)", () => {
    const long = buildSaftXml({
      ...input,
      issuer: { ...ISSUER, name: "N".repeat(160), address: { ...ISSUER.address, city: "C".repeat(80) } },
      documents: [{ ...cancelled, createdBy: "x".repeat(40), statusReason: "R".repeat(70) }],
    });
    expect(long).toContain(`<SourceID>${"x".repeat(30)}</SourceID>`);
    expect(long).toContain(`<Reason>${"R".repeat(50)}</Reason>`);
    expect(long).toContain(`<CompanyName>${"N".repeat(100)}</CompanyName>`);
    expect(long).toContain(`<City>${"C".repeat(50)}</City>`);
  });

  it("totais: faturas excluem A e F (4.1.2/4.1.3); consultas de mesa excluem só A — uma CM faturada conta (4.3.3)", () => {
    const xml2 = buildSaftXml({ ...input, documents: [{ ...fs, status: "F" }, { ...cm, status: "F" }] });
    expect(xml2).toContain("<SalesInvoices><NumberOfEntries>1</NumberOfEntries><TotalDebit>0.00</TotalDebit><TotalCredit>0.00</TotalCredit>");
    expect(xml2).toContain("<WorkingDocuments><NumberOfEntries>1</NumberOfEntries><TotalDebit>0.00</TotalDebit><TotalCredit>11.06</TotalCredit>");
  });

  it("NC com vários documentos retificados: todas as referências em cada linha", () => {
    const two = buildSaftXml({ ...input, documents: [{ ...nc, referencesTo: [...nc.referencesTo, { documentId: "x", documentNumber: "FS L01-2027/2", reason: "Erro" }] }] });
    expect(two).toContain("<References><Reference>FS L01-2027/1</Reference><Reason>Devolução</Reason></References><References><Reference>FS L01-2027/2</Reference><Reason>Erro</Reason></References>");
  });

  it("remove carateres de controlo que o XML 1.0 não admite", () => {
    const ctrl = buildSaftXml({ ...input, documents: [{ ...fs, customer: { ...FINAL, customerId: "Consumidor final" }, lines: [{ ...fs.lines[0]!, description: "Pizza\u0007 boa" }, fs.lines[1]!, fs.lines[2]!] }] });
    expect(ctrl).toContain("<ProductDescription>Pizza boa</ProductDescription>");
  });

  it("escapa texto XML (&, <, >) nas descrições e nomes", () => {
    expect(xml).toContain("<ProductDescription>Pizza &lt;Margherita&gt;</ProductDescription>");
  });
});
