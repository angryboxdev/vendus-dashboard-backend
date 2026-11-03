import { decToString } from "../../../../kernel/money/decimal.js";
import { cancelReasonText, CANCEL_REASONS } from "../../domain/entities/cancel-reasons.js";
import { EXEMPTION_CODES } from "../../domain/entities/exemption-codes.js";
import { ENABLED_EXEMPTIONS, EXEMPTION_MENTIONS, exemptionMention } from "../../domain/entities/exemption-reasons.js";
import { vatRate } from "../../domain/entities/vat-rates.js";
import { fiscalMentions } from "../../domain/services/printed-mentions.service.js";

describe("taxas de IVA por espaço fiscal (CIVA art. 18.º; Of.-Circ. 25045/2024)", () => {
  it.each([
    ["PT", "RED", "6"],
    ["PT", "INT", "13"],
    ["PT", "NOR", "23"],
    ["PT-AC", "RED", "4"],
    ["PT-AC", "INT", "9"],
    ["PT-AC", "NOR", "16"],
    ["PT-MA", "RED", "4"],
    ["PT-MA", "INT", "12"],
    ["PT-MA", "NOR", "22"],
  ] as const)("%s %s = %s %%", (region, code, pct) => {
    expect(decToString(vatRate(region, code))).toBe(pct);
  });
});

describe("menções de isenção (tabela AT de motivos de isenção v4.0)", () => {
  it("usa o texto oficial do código", () => {
    expect(exemptionMention("M10")).toBe("IVA – regime de isenção");
  });

  it("permite acrescentar a norma ao «não sujeito» (FAQ AT 5972)", () => {
    expect(exemptionMention("M99", "Decreto-Lei n.º 152-D/2017")).toBe("Não sujeito ou não tributado - Decreto-Lei n.º 152-D/2017");
  });

  it("todas as menções da tabela cabem nos 6–60 caracteres do SAF-T (M15 abreviado) e cobrem todos os códigos", () => {
    for (const mention of Object.values(EXEMPTION_MENTIONS)) {
      expect(mention.length).toBeGreaterThanOrEqual(6);
      expect(mention.length).toBeLessThanOrEqual(60);
    }
    expect(Object.keys(EXEMPTION_MENTIONS).sort()).toEqual([...EXEMPTION_CODES].sort());
    expect(() => exemptionMention("M99", "x".repeat(60))).toThrow();
  });

  it("na v1 só os motivos realistas na restauração estão ativos (autoliquidações desligadas)", () => {
    expect([...ENABLED_EXEMPTIONS].sort()).toEqual(["M10", "M99"]);
    expect(() => exemptionMention("M30")).toThrow(/não está ativo/);
    expect(() => exemptionMention("M03")).toThrow();
  });
});

describe("motivos de anulação (só erros sem efeito no valor; o resto é nota de crédito)", () => {
  it("lista fechada, com texto livre opcional", () => {
    expect(CANCEL_REASONS.map((r) => r.code)).toEqual(["not-delivered", "wrong-customer-tax-id", "wrong-description"]);
    expect(cancelReasonText("wrong-customer-tax-id", "pedido pelo cliente")).toBe("NIF do adquirente errado - pedido pelo cliente");
    expect(cancelReasonText("not-delivered")).toBe("Documento não entregue ao cliente");
    expect(() => cancelReasonText("valor-errado" as never)).toThrow();
  });
});

describe("menções impressas conforme a certificação e o modo da série", () => {
  const hash = "v" + "x".repeat(9) + "o" + "x".repeat(9) + "6" + "x".repeat(9) + "e" + "x".repeat(140) + "=";

  it("sem certificado: marca de teste, sem «Processado por programa certificado» (n.º 0)", () => {
    expect(fiscalMentions({ hash, certificateNumber: "0", mode: "training", documentType: "FS" })).toEqual([
      "vo6e",
      "DOCUMENTO DE TESTE – SEM VALOR FISCAL",
      "Documento emitido para fins de Formação",
    ]);
  });

  it("com certificado: 4 caracteres + frase do programa certificado", () => {
    expect(fiscalMentions({ hash, certificateNumber: "2125", mode: "normal", documentType: "FT" })).toEqual([
      "vo6e-Processado por programa certificado n.º 2125/AT",
    ]);
  });

  it("consulta de mesa diz que não serve de fatura (Despacho 1.2)", () => {
    expect(fiscalMentions({ hash, certificateNumber: "2125", mode: "normal", documentType: "CM" })).toContain("Este documento não serve de fatura");
  });
});
