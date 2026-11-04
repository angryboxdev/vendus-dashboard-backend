import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { dec } from "../../../../kernel/money/decimal.js";
import { efaturaChangeStatusBody, efaturaRegisterBody, hashCharacters, parseEfaturaResponse } from "../../domain/services/efatura-message.service.js";
import { storedDoc } from "../fixtures/stored-documents.js";

const NS = 'xmlns:doc="http://factemi.at.min_financas.pt/documents"';
const fs = storedDoc({ id: "fs1" });
const nc = storedDoc({
  id: "nc1",
  documentType: "NC",
  documentNumber: "NC L01-2027/1",
  grossTotal: dec("3.00"),
  netTotal: "2.44",
  taxPayable: "0.56",
  customer: { customerId: "123456789", taxId: "123456789", name: "Cliente, Lda", country: "PT", address: null },
  referencesTo: [{ documentId: "fs1", documentNumber: "FS L01-2027/1", reason: "Devolução" }],
  taxes: [{ taxRegion: "PT", taxCode: "NOR", taxPercentage: "23", exemptionCode: null, exemptionReason: null, taxableBase: "2.44", taxAmount: "0.56" }],
});
const cm = storedDoc({
  id: "cm1",
  documentType: "CM",
  documentNumber: "CM L01-2027/1",
  grossTotal: dec("12.50"),
  netTotal: "11.06",
  taxPayable: "1.44",
  taxes: [{ taxRegion: "PT", taxCode: "INT", taxPercentage: "13", exemptionCode: null, exemptionReason: null, taxableBase: "11.06", taxAmount: "1.44" }],
});
const cancelled = storedDoc({ id: "fs2", status: "A", statusReason: "Erro", statusEntryDate: "2027-03-10T13:05:00" });

// Para validar à mão contra o esquema do Fatcorews.wsdl (ver .scratch/certificacao-at/validacao-saft/).
const out = join(__dirname, "..", "fixtures");
writeFileSync(join(out, "efatura-fs.test-output.xml"), efaturaRegisterBody(fs), "utf8");
writeFileSync(join(out, "efatura-nc.test-output.xml"), efaturaRegisterBody(nc), "utf8");
writeFileSync(join(out, "efatura-cm.test-output.xml"), efaturaRegisterBody(cm), "utf8");
writeFileSync(join(out, "efatura-anular.test-output.xml"), efaturaChangeStatusBody(cancelled), "utf8");

describe("e-Fatura — RegisterInvoice (Aspetos específicos v3.0, 2.1.1)", () => {
  it("FS a consumidor final: cabeçalho, estado, hash «0» sem certificado e uma linha por taxa", () => {
    expect(efaturaRegisterBody(fs)).toBe(
      `<doc:RegisterInvoiceRequest ${NS}>` +
        "<doc:eFaturaMDVersion>0.0.1</doc:eFaturaMDVersion><doc:AuditFileVersion>1.04_01</doc:AuditFileVersion>" +
        "<doc:TaxRegistrationNumber>599999999</doc:TaxRegistrationNumber><doc:TaxEntity>Global</doc:TaxEntity>" +
        "<doc:SoftwareCertificateNumber>0</doc:SoftwareCertificateNumber>" +
        "<doc:InvoiceData><doc:InvoiceNo>FS L01-2027/1</doc:InvoiceNo><doc:ATCUD>CDF7T5HD-1</doc:ATCUD><doc:InvoiceDate>2027-03-10</doc:InvoiceDate>" +
        "<doc:InvoiceType>FS</doc:InvoiceType><doc:SelfBillingIndicator>0</doc:SelfBillingIndicator>" +
        "<doc:CustomerTaxID>999999990</doc:CustomerTaxID><doc:CustomerTaxIDCountry>PT</doc:CustomerTaxIDCountry>" +
        "<doc:DocumentStatus><doc:InvoiceStatus>N</doc:InvoiceStatus><doc:InvoiceStatusDate>2027-03-10T12:00:00</doc:InvoiceStatusDate></doc:DocumentStatus>" +
        "<doc:HashCharacters>0</doc:HashCharacters><doc:CashVATSchemeIndicator>0</doc:CashVATSchemeIndicator><doc:PaperLessIndicator>0</doc:PaperLessIndicator>" +
        "<doc:SystemEntryDate>2027-03-10T12:00:00</doc:SystemEntryDate>" +
        "<doc:LineSummary><doc:TaxPointDate>2027-03-10</doc:TaxPointDate><doc:DebitCreditIndicator>C</doc:DebitCreditIndicator><doc:Amount>22.12</doc:Amount>" +
        "<doc:Tax><doc:TaxType>IVA</doc:TaxType><doc:TaxCountryRegion>PT</doc:TaxCountryRegion><doc:TaxCode>INT</doc:TaxCode><doc:TaxPercentage>13.00</doc:TaxPercentage></doc:Tax></doc:LineSummary>" +
        "<doc:LineSummary><doc:TaxPointDate>2027-03-10</doc:TaxPointDate><doc:DebitCreditIndicator>C</doc:DebitCreditIndicator><doc:Amount>2.44</doc:Amount>" +
        "<doc:Tax><doc:TaxType>IVA</doc:TaxType><doc:TaxCountryRegion>PT</doc:TaxCountryRegion><doc:TaxCode>NOR</doc:TaxCode><doc:TaxPercentage>23.00</doc:TaxPercentage></doc:Tax></doc:LineSummary>" +
        "<doc:LineSummary><doc:TaxPointDate>2027-03-10</doc:TaxPointDate><doc:DebitCreditIndicator>C</doc:DebitCreditIndicator><doc:Amount>0.10</doc:Amount>" +
        "<doc:Tax><doc:TaxType>IVA</doc:TaxType><doc:TaxCountryRegion>PT</doc:TaxCountryRegion><doc:TaxCode>ISE</doc:TaxCode><doc:TaxPercentage>0.00</doc:TaxPercentage></doc:Tax>" +
        "<doc:TaxExemptionCode>M99</doc:TaxExemptionCode></doc:LineSummary>" +
        "<doc:DocumentTotals><doc:TaxPayable>3.44</doc:TaxPayable><doc:NetTotal>24.66</doc:NetTotal><doc:GrossTotal>28.10</doc:GrossTotal></doc:DocumentTotals>" +
        "</doc:InvoiceData></doc:RegisterInvoiceRequest>",
    );
  });

  it("NC: a débito e com a referência ao documento retificado", () => {
    const xml = efaturaRegisterBody(nc);
    expect(xml).toContain("<doc:TaxPointDate>2027-03-10</doc:TaxPointDate><doc:Reference>FS L01-2027/1</doc:Reference><doc:DebitCreditIndicator>D</doc:DebitCreditIndicator>");
    expect(xml).toContain("<doc:CustomerTaxID>123456789</doc:CustomerTaxID>");
  });

  it("fatura de consulta de mesa: documento de origem em OrderReferences", () => {
    const ft = storedDoc({ documentType: "FT", documentNumber: "FT L01-2027/1", orderReferences: [{ documentId: "cm1", documentNumber: "CM L01-2027/1" }] });
    expect(efaturaRegisterBody(ft)).toContain("<doc:LineSummary><doc:OrderReferences><doc:OriginatingON>CM L01-2027/1</doc:OriginatingON></doc:OrderReferences><doc:TaxPointDate>");
  });

  it("anulado antes de comunicar: regista já com o estado A e a data da anulação", () => {
    expect(efaturaRegisterBody(cancelled)).toContain("<doc:InvoiceStatus>A</doc:InvoiceStatus><doc:InvoiceStatusDate>2027-03-10T13:05:00</doc:InvoiceStatusDate>");
  });

  it("com certificado: 1.º, 11.º, 21.º e 31.º carateres da assinatura", () => {
    const hash = "ABCDEFGHIJ".repeat(17) + "Z=";
    expect(hashCharacters(storedDoc({ softwareCertificateNumber: "2125", hash }))).toBe("AAAA");
    expect(hashCharacters(storedDoc({ softwareCertificateNumber: "2125", hash: "0123456789abcdefghijKLMNOPQRSTuvwxyz".padEnd(172, "x") }))).toBe("0aKu");
  });
});

describe("e-Fatura — RegisterWork (consultas de mesa, 2.2)", () => {
  it("CM: WorkData sem indicadores de IVA de caixa nem fatura sem papel", () => {
    const xml = efaturaRegisterBody(cm);
    expect(xml.startsWith(`<doc:RegisterWorkRequest ${NS}>`)).toBe(true);
    expect(xml).toContain(
      "<doc:WorkData><doc:DocumentNumber>CM L01-2027/1</doc:DocumentNumber><doc:ATCUD>CDF7T5HD-1</doc:ATCUD><doc:WorkDate>2027-03-10</doc:WorkDate><doc:WorkType>CM</doc:WorkType>" +
        "<doc:CustomerTaxID>999999990</doc:CustomerTaxID><doc:CustomerTaxIDCountry>PT</doc:CustomerTaxIDCountry>" +
        "<doc:DocumentStatus><doc:WorkStatus>N</doc:WorkStatus><doc:WorkStatusDate>2027-03-10T12:00:00</doc:WorkStatusDate></doc:DocumentStatus>" +
        "<doc:HashCharacters>0</doc:HashCharacters><doc:SystemEntryDate>2027-03-10T12:00:00</doc:SystemEntryDate><doc:LineSummary>",
    );
    expect(xml).not.toContain("CashVATSchemeIndicator");
  });
});

describe("e-Fatura — mudança de estado", () => {
  it("anulação de fatura: cabeçalho do documento e novo estado com data", () => {
    expect(efaturaChangeStatusBody(cancelled)).toBe(
      `<doc:ChangeInvoiceStatusRequest ${NS}><doc:eFaturaMDVersion>0.0.1</doc:eFaturaMDVersion><doc:TaxRegistrationNumber>599999999</doc:TaxRegistrationNumber>` +
        "<doc:InvoiceHeader><doc:InvoiceNo>FS L01-2027/1</doc:InvoiceNo><doc:ATCUD>CDF7T5HD-1</doc:ATCUD><doc:InvoiceDate>2027-03-10</doc:InvoiceDate>" +
        "<doc:InvoiceType>FS</doc:InvoiceType><doc:SelfBillingIndicator>0</doc:SelfBillingIndicator><doc:CustomerTaxID>999999990</doc:CustomerTaxID>" +
        "<doc:CustomerTaxIDCountry>PT</doc:CustomerTaxIDCountry></doc:InvoiceHeader>" +
        "<doc:InvoiceStatus><doc:InvoiceStatus>A</doc:InvoiceStatus><doc:InvoiceStatusDate>2027-03-10T13:05:00</doc:InvoiceStatusDate></doc:InvoiceStatus>" +
        "</doc:ChangeInvoiceStatusRequest>",
    );
  });

  it("consulta de mesa faturada (F): ChangeWorkStatus", () => {
    const xml = efaturaChangeStatusBody({ ...cm, status: "F", statusEntryDate: "2027-03-10T14:05:00" });
    expect(xml).toContain("<doc:WorkHeader><doc:DocumentNumber>CM L01-2027/1</doc:DocumentNumber>");
    expect(xml).toContain("<doc:WorkStatus><doc:WorkStatus>F</doc:WorkStatus><doc:WorkStatusDate>2027-03-10T14:05:00</doc:WorkStatusDate></doc:WorkStatus>");
  });
});

describe("e-Fatura — resposta (2.1.1.2)", () => {
  const response = (code: string, msg = "ok") =>
    `<S:Envelope xmlns:S="http://schemas.xmlsoap.org/soap/envelope/"><S:Body><ns2:RegisterInvoiceResponse xmlns:ns2="http://factemi.at.min_financas.pt/documents"><ns2:Response><ns2:CodigoResposta>${code}</ns2:CodigoResposta><ns2:Mensagem>${msg}</ns2:Mensagem><ns2:DataOperacao>2027-03-10T12:00:05</ns2:DataOperacao></ns2:Response></ns2:RegisterInvoiceResponse></S:Body></S:Envelope>`;

  it.each([
    ["0", "accepted"],
    ["-10", "accepted"],
    ["99", "auth"],
    ["12", "auth"],
    ["-97", "failed"],
    ["-99", "failed"],
    ["-3", "rejected"],
    ["-8", "rejected"],
  ])("código %s → %s", (code, outcome) => {
    expect(parseEfaturaResponse(response(code))).toEqual({ outcome, code: Number(code), message: "ok" });
  });

  it("SOAP Fault ou resposta sem código → repetir mais tarde", () => {
    const fault = '<S:Envelope xmlns:S="http://schemas.xmlsoap.org/soap/envelope/"><S:Body><S:Fault><faultcode>S:Server</faultcode><faultstring>Erro &amp; mais</faultstring></S:Fault></S:Body></S:Envelope>';
    expect(parseEfaturaResponse(fault)).toEqual({ outcome: "failed", code: null, message: "Erro & mais" });
    expect(parseEfaturaResponse("<html>502</html>").outcome).toBe("failed");
  });
});
