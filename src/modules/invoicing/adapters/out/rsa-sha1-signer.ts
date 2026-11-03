import { createPrivateKey, createPublicKey, sign, verify, type KeyObject } from "node:crypto";
import type { DocumentSignature, SignatureVerifierPort, SignerPort } from "../../domain/ports/out/signer.port.js";

/**
 * RSA (1024 bits) + SHA-1, PKCS#1 v1.5, Base64 numa linha — o algoritmo da AT
 * (Despacho 8632/2014, pontos 4–7). A chave privada chega em PEM pela
 * configuração (variável de ambiente), nunca do repositório nem da BD.
 */
export class RsaSha1Signer implements SignerPort, SignatureVerifierPort {
  private readonly privateKey: KeyObject | null;
  private readonly publicKey: KeyObject;
  private readonly keyVersion: number;

  constructor(opts: { privateKeyPem: string; keyVersion: number } | { publicKeyPem: string }) {
    if ("privateKeyPem" in opts) {
      this.privateKey = createPrivateKey(opts.privateKeyPem);
      this.publicKey = createPublicKey(this.privateKey);
      this.keyVersion = opts.keyVersion;
    } else {
      this.privateKey = null;
      this.publicKey = createPublicKey(opts.publicKeyPem);
      this.keyVersion = 0;
    }
  }

  async sign(message: string): Promise<DocumentSignature> {
    if (!this.privateKey) throw new Error("Assinador sem chave privada");
    const hash = sign("RSA-SHA1", Buffer.from(message, "utf8"), this.privateKey).toString("base64");
    return { hash, keyVersion: this.keyVersion };
  }

  async verify(message: string, hash: string): Promise<boolean> {
    return verify("RSA-SHA1", Buffer.from(message, "utf8"), this.publicKey, Buffer.from(hash, "base64"));
  }
}
