import { dec } from "../../../../kernel/money/decimal.js";
import { RsaSha1Signer } from "../../adapters/out/rsa-sha1-signer.js";
import { verifySignatureChain } from "../../domain/services/signature.service.js";
import { atPublicKeyPem, demoSignedDocuments } from "../fixtures/at/demo-saft.js";

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
});
