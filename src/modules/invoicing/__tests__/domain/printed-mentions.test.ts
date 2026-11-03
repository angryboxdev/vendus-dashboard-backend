import {
  certifiedProgramMention,
  printedSignatureCode,
  receiptCertificationMention,
  TRAINING_MENTION,
} from "../../domain/services/printed-mentions.service.js";
import { demoSignedDocuments } from "../fixtures/at/demo-saft.js";

describe("menções impressas (Portaria 363/2010 art. 6.º n.º 3; Despacho 8632/2014 2.2)", () => {
  it("imprime os caracteres 1, 11, 21 e 31 do hash (documento 1T 1/1 da demonstração da AT → vo6e)", () => {
    const first = demoSignedDocuments()[0]!;
    expect(printedSignatureCode(first.hash)).toBe("vo6e");
  });

  it("junta o código à frase do programa certificado", () => {
    expect(certifiedProgramMention("vo6e", "2125")).toBe("vo6e-Processado por programa certificado n.º 2125/AT");
  });

  it("recibos não são assinados e levam «Emitido por programa certificado»", () => {
    expect(receiptCertificationMention("2125")).toBe("Emitido por programa certificado n.º 2125/AT");
  });

  it("recusa um hash que não seja a assinatura de 172 caracteres", () => {
    expect(() => printedSignatureCode("abc")).toThrow();
  });

  it("recusa n.º de certificado que não seja numérico (máx. 4 dígitos, campo R do QR)", () => {
    expect(() => certifiedProgramMention("vo6e", "12A")).toThrow();
    expect(() => certifiedProgramMention("vo6e", "12345")).toThrow();
  });

  it("modo formação tem a menção legal própria", () => {
    expect(TRAINING_MENTION).toBe("Documento emitido para fins de Formação");
  });
});
