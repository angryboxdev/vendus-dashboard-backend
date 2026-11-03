import { dec } from "../../../../kernel/money/decimal.js";
import { computeDocumentTotals } from "../../domain/services/document-totals.service.js";
import { buildQrPayload, qrFiscalSpacesFromTotals, type QrInput } from "../../domain/services/qr-payload.service.js";

const pair = (base: string, tax: string) => ({ base: dec(base), tax: dec(tax) });

/** Exemplos do §5 de «Especificações Técnicas – Código QR», AT, v1.1 (out. 2020). */
describe("conteúdo do código QR (Portaria 195/2020; especificação AT v1.1)", () => {
  it("exemplo 1 — fatura com 3 espaços fiscais, Imposto do Selo, retenção e IBAN", () => {
    const input: QrInput = {
      issuerTaxId: "123456789",
      customerTaxId: "999999990",
      customerCountry: "PT",
      documentType: "FT",
      documentStatus: "N",
      documentDate: "2019-12-31",
      documentNumber: "FT AB2019/0035",
      atcud: "CSDF7T5H-0035",
      fiscalSpaces: [
        { region: "PT", exemptBase: dec("12000.00"), reduced: pair("15000.00", "900.00"), intermediate: pair("50000.00", "6500.00"), normal: pair("80000.00", "18400.00") },
        { region: "PT-AC", exemptBase: dec("10000.00"), reduced: pair("25000.56", "1000.02"), intermediate: pair("75000.00", "6750.00"), normal: pair("100000.00", "18000.00") },
        { region: "PT-MA", exemptBase: dec("5000.00"), reduced: pair("12500.00", "625.00"), intermediate: pair("25000.00", "3000.00"), normal: pair("40000.00", "8800.00") },
      ],
      notSubjectAmount: dec("100.00"),
      stampDuty: dec("25.00"),
      taxPayable: dec("64000.02"),
      grossTotal: dec("513600.58"),
      withholdingTax: dec("100.00"),
      signatureCode: "kLp0",
      certificateNumber: "9999",
      otherInfo: "TB;PT00000000000000000000000;513500.58",
    };

    expect(buildQrPayload(input)).toBe(
      "A:123456789*B:999999990*C:PT*D:FT*E:N*F:20191231*G:FT AB2019/0035*H:CSDF7T5H-0035" +
        "*I1:PT*I2:12000.00*I3:15000.00*I4:900.00*I5:50000.00*I6:6500.00*I7:80000.00*I8:18400.00" +
        "*J1:PT-AC*J2:10000.00*J3:25000.56*J4:1000.02*J5:75000.00*J6:6750.00*J7:100000.00*J8:18000.00" +
        "*K1:PT-MA*K2:5000.00*K3:12500.00*K4:625.00*K5:25000.00*K6:3000.00*K7:40000.00*K8:8800.00" +
        "*L:100.00*M:25.00*N:64000.02*O:513600.58*P:100.00*Q:kLp0*R:9999*S:TB;PT00000000000000000000000;513500.58",
    );
  });

  it("exemplo 2 — fatura simplificada a consumidor final", () => {
    const payload = buildQrPayload({
      issuerTaxId: "123456789",
      customerTaxId: "999999990",
      customerCountry: "PT",
      documentType: "FS",
      documentStatus: "N",
      documentDate: "2019-08-12",
      documentNumber: "FS CDVF/12345",
      atcud: "CDF7T5HD-12345",
      fiscalSpaces: [{ region: "PT", normal: pair("0.65", "0.15") }],
      taxPayable: dec("0.15"),
      grossTotal: dec("0.80"),
      signatureCode: "YhGV",
      certificateNumber: "9999",
      otherInfo: "NU;0.80",
    });

    expect(payload).toBe(
      "A:123456789*B:999999990*C:PT*D:FS*E:N*F:20190812*G:FS CDVF/12345*H:CDF7T5HD-12345*I1:PT*I7:0.65*I8:0.15*N:0.15*O:0.80*Q:YhGV*R:9999*S:NU;0.80",
    );
  });

  it("exemplo 4 — documento sem IVA indicado leva I1:0", () => {
    const payload = buildQrPayload({
      issuerTaxId: "500000000",
      customerTaxId: "123456789",
      customerCountry: "PT",
      documentType: "GT",
      documentStatus: "N",
      documentDate: "2019-07-20",
      documentNumber: "GT G234CB/50987",
      atcud: "GTVX4Y8B-50987",
      fiscalSpaces: [],
      taxPayable: dec("0"),
      grossTotal: dec("0"),
      signatureCode: "5uIg",
      certificateNumber: "9999",
    });

    expect(payload).toBe("A:500000000*B:123456789*C:PT*D:GT*E:N*F:20190720*G:GT G234CB/50987*H:GTVX4Y8B-50987*I1:0*N:0.00*O:0.00*Q:5uIg*R:9999");
  });

  it("exemplo 5 — espaço fiscal estrangeiro", () => {
    const payload = buildQrPayload({
      issuerTaxId: "123456789",
      customerTaxId: "4443332215",
      customerCountry: "FR",
      documentType: "FT",
      documentStatus: "N",
      documentDate: "2019-05-26",
      documentNumber: "ABC BNH/4561",
      atcud: "DK5ZJ2HN-4561",
      fiscalSpaces: [{ region: "FR", normal: pair("100.00", "20.00") }],
      taxPayable: dec("20.00"),
      grossTotal: dec("120.00"),
      signatureCode: "YJRE",
      certificateNumber: "9999",
    });

    expect(payload).toBe("A:123456789*B:4443332215*C:FR*D:FT*E:N*F:20190526*G:ABC BNH/4561*H:DK5ZJ2HN-4561*I1:FR*I7:100.00*I8:20.00*N:20.00*O:120.00*Q:YJRE*R:9999");
  });

  it("recusa mais de 3 espaços fiscais e «*» nas outras informações", () => {
    const base: QrInput = {
      issuerTaxId: "123456789",
      customerTaxId: "999999990",
      customerCountry: "PT",
      documentType: "FS",
      documentStatus: "N",
      documentDate: "2019-08-12",
      documentNumber: "FS CDVF/12345",
      atcud: "CDF7T5HD-12345",
      fiscalSpaces: [],
      taxPayable: dec("0"),
      grossTotal: dec("0"),
      signatureCode: "YhGV",
      certificateNumber: "9999",
    };
    const four = ["PT", "PT-AC", "PT-MA", "ES"].map((region) => ({ region }));

    expect(() => buildQrPayload({ ...base, fiscalSpaces: four })).toThrow();
    expect(() => buildQrPayload({ ...base, otherInfo: "NU*0.80" })).toThrow();
  });

  it("os espaços fiscais saem dos totais do documento (restauração: 13 % e 23 %)", () => {
    const totals = computeDocumentTotals({
      pricesIncludeTax: true,
      lines: [
        { description: "Pizza", quantity: dec("2"), unitPrice: dec("12.50"), tax: { kind: "rate", region: "PT", code: "INT", percentage: dec("13") } },
        { description: "Cerveja", quantity: dec("1"), unitPrice: dec("3.00"), tax: { kind: "rate", region: "PT", code: "NOR", percentage: dec("23") } },
      ],
    });

    expect(qrFiscalSpacesFromTotals(totals)).toEqual([{ region: "PT", intermediate: pair("22.12", "2.88"), normal: pair("2.44", "0.56") }]);
  });
});
