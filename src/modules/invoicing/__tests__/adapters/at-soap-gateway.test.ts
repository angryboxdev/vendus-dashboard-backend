import { constants, createDecipheriv, generateKeyPairSync, privateDecrypt } from "node:crypto";
import { AT_ENDPOINTS, AtSoapGateway } from "../../adapters/out/at-soap-gateway.js";
import { AtTransportError } from "../../domain/errors.js";
import { tagText } from "../../domain/services/xml-text.js";

// Par fictício a fazer de «chave do Sistema de Autenticação da AT» (2048 bits, como a real).
const { publicKey, privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
const PUBLIC_PEM = publicKey.export({ type: "spki", format: "pem" }).toString();
const WFA = { username: "599999999/37", password: "senha-ficticia-ç" };

const decryptAes = (ks: Buffer, b64: string) => {
  const d = createDecipheriv("aes-128-ecb", ks, null);
  return Buffer.concat([d.update(Buffer.from(b64, "base64")), d.final()]).toString("utf8");
};

function gatewayCapturing(reply: string | Error = "<ok/>") {
  const calls: Array<{ url: string; xml: string }> = [];
  const gw = new AtSoapGateway({ environment: "test", pfx: Buffer.alloc(0), passphrase: "", authPublicKeyPem: PUBLIC_PEM }, async (url, xml) => {
    calls.push({ url, xml });
    if (reply instanceof Error) throw reply;
    return reply;
  });
  return { gw, calls };
}

describe("AtSoapGateway — WS-Security («Aspetos genéricos» 2.2.1)", () => {
  it("Nonce = chave AES-128 cifrada com a chave pública; Password e Created cifrados com ela", async () => {
    const { gw, calls } = gatewayCapturing();
    const before = Date.now();
    await gw.send("efatura", "<doc:X/>", WFA);

    const xml = calls[0]!.xml;
    const ks = privateDecrypt({ key: privateKey, padding: constants.RSA_PKCS1_PADDING }, Buffer.from(tagText(xml, "Nonce")!, "base64"));
    expect(ks).toHaveLength(16);
    expect(tagText(xml, "Username")).toBe("599999999/37");
    expect(decryptAes(ks, tagText(xml, "Password")!)).toBe("senha-ficticia-ç");
    const created = decryptAes(ks, tagText(xml, "Created")!);
    expect(created).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
    expect(Date.parse(created)).toBeGreaterThanOrEqual(before - 1000);
    expect(xml).toContain("<S:Body><doc:X/></S:Body>");
    expect(xml).not.toContain("senha-ficticia");
  });

  it("chave simétrica nova em cada pedido (a AT recusa repetidas — código 12)", async () => {
    const { gw, calls } = gatewayCapturing();
    await gw.send("efatura", "<a/>", WFA);
    await gw.send("efatura", "<a/>", WFA);
    expect(tagText(calls[0]!.xml, "Nonce")).not.toBe(tagText(calls[1]!.xml, "Nonce"));
  });

  it("endereços de testes: séries na porta 722, e-Fatura na 723", async () => {
    const { gw, calls } = gatewayCapturing();
    await gw.send("series", "<a/>", WFA);
    await gw.send("efatura", "<a/>", WFA);
    expect(calls.map((c) => c.url)).toEqual([AT_ENDPOINTS.test.series, AT_ENDPOINTS.test.efatura]);
    expect(AT_ENDPOINTS.test.series).toBe("https://servicos.portaldasfinancas.gov.pt:722/SeriesWSService");
    expect(AT_ENDPOINTS.test.efatura).toBe("https://servicos.portaldasfinancas.gov.pt:723/fatcorews/ws/");
  });

  it("falha de ligação → AtTransportError genérico (o detalhe só no log, nunca o pedido)", async () => {
    const log = jest.spyOn(console, "error").mockImplementation(() => undefined);
    const { gw } = gatewayCapturing(Object.assign(new Error("getaddrinfo ENOTFOUND 10.0.0.1"), { code: "ENOTFOUND" }));
    const err = await gw.send("efatura", "<a/>", WFA).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(AtTransportError);
    expect((err as Error).message).toBe("falha de ligação à AT");
    expect(JSON.stringify(log.mock.calls)).toContain("ENOTFOUND");
    expect(JSON.stringify(log.mock.calls)).not.toContain("senha");
    const slow = gatewayCapturing(new Error("tempo esgotado"));
    expect(((await slow.gw.send("efatura", "<a/>", WFA).catch((e: unknown) => e)) as Error).message).toBe("tempo esgotado na ligação à AT");
    log.mockRestore();
  });

  it("chave pública inválida → erro ao montar (o módulo desliga a comunicação)", () => {
    expect(() => new AtSoapGateway({ environment: "test", pfx: Buffer.alloc(0), passphrase: "", authPublicKeyPem: "não é uma chave" }, async () => "")).toThrow();
  });
});
