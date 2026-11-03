import { generateKeyPairSync } from "node:crypto";
import { RsaSha1Signer } from "../../adapters/out/rsa-sha1-signer.js";
import { atPrivateKeyPem, atPublicKeyPem, demoSignedDocuments } from "../fixtures/at/demo-saft.js";

describe("RsaSha1Signer (Despacho 8632/2014, pontos 4–7)", () => {
  it("com a chave privada de exemplo da AT, reproduz o hash oficial do 1.º documento", async () => {
    const signer = new RsaSha1Signer({ privateKeyPem: atPrivateKeyPem, keyVersion: 1 });
    const first = demoSignedDocuments()[0]!;

    // Despacho 8632/2014, 7.1: 1.º documento da série → mensagem termina em ";"
    const signed = await signer.sign("2017-03-10;2017-03-10T15:58:01;1T 1/1;28.07;");

    expect(signed).toEqual({ hash: first.hash, keyVersion: 1 });
    expect(signed.hash).toHaveLength(172);
  });

  it("verifica com a chave pública da AT e rejeita mensagem alterada", async () => {
    const verifier = new RsaSha1Signer({ publicKeyPem: atPublicKeyPem });
    const first = demoSignedDocuments()[0]!;

    await expect(verifier.verify("2017-03-10;2017-03-10T15:58:01;1T 1/1;28.07;", first.hash)).resolves.toBe(true);
    await expect(verifier.verify("2017-03-10;2017-03-10T15:58:01;1T 1/1;28.08;", first.hash)).resolves.toBe(false);
  });

  it("recusa chaves que não sejam RSA de 1024 bits (o hash tem de ter 172 caracteres)", () => {
    const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
    const pem = privateKey.export({ type: "pkcs1", format: "pem" }).toString();
    const pub = publicKey.export({ type: "spki", format: "pem" }).toString();

    expect(() => new RsaSha1Signer({ privateKeyPem: pem, keyVersion: 1 })).toThrow(/1024/);
    expect(() => new RsaSha1Signer({ publicKeyPem: pub })).toThrow(/1024/);
  });

  it("recusa versão de chave que não seja inteiro positivo", () => {
    expect(() => new RsaSha1Signer({ privateKeyPem: atPrivateKeyPem, keyVersion: 0 })).toThrow();
  });
});
