import { dec } from "../../../../kernel/money/decimal.js";
import { RsaSha1Signer } from "../../adapters/out/rsa-sha1-signer.js";
import { verifySignatureChain } from "../../domain/services/signature.service.js";
import { atPrivateKeyPem, atPublicKeyPem, demoSignedDocuments } from "../fixtures/at/demo-saft.js";

const toChainInput = (d: ReturnType<typeof demoSignedDocuments>[number]) => ({
  documentNumber: d.number,
  documentDate: d.date,
  systemEntryDate: d.systemEntryDate,
  grossTotal: dec(d.grossTotal),
  hash: d.hash,
});

describe("assinatura dos documentos (Portaria 363/2010 art. 6.º; Despacho 8632/2014)", () => {
  const verifier = new RsaSha1Signer({ publicKeyPem: atPublicKeyPem });

  it("valida a cadeia completa do SAF-T de demonstração da AT", async () => {
    const docs = demoSignedDocuments().map(toChainInput);
    expect(docs).toHaveLength(36);

    await expect(verifySignatureChain(docs, verifier)).resolves.toEqual({ valid: true });
  });

  it("aponta o primeiro documento adulterado", async () => {
    const docs = demoSignedDocuments().map(toChainInput);
    const tampered = docs.map((d) => (d.documentNumber === "1T 1/3" ? { ...d, grossTotal: dec("1.00") } : d));

    await expect(verifySignatureChain(tampered, verifier)).resolves.toEqual({ valid: false, firstInvalid: "1T 1/3" });
  });

  it("com a chave privada de exemplo da AT, reproduz o hash oficial do 1.º documento", async () => {
    const signer = new RsaSha1Signer({ privateKeyPem: atPrivateKeyPem, keyVersion: 1 });
    const first = demoSignedDocuments()[0]!;

    // Despacho 8632/2014, 7.1: 1.º documento da série → mensagem termina em ";"
    const signed = await signer.sign("2017-03-10;2017-03-10T15:58:01;1T 1/1;28.07;");

    expect(signed).toEqual({ hash: first.hash, keyVersion: 1 });
    expect(signed.hash).toHaveLength(172);
  });
});
