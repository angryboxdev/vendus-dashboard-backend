import { createInvoicingModule, readInvoicingConfig, safeInvoicingConfig } from "../../invoicing.module.js";
import { FakeIssuers } from "../fakes/fakes.js";

const noDb = (() => {
  throw new Error("sem BD neste teste");
}) as never;

describe("arranque da faturação: configuração errada não derruba o servidor", () => {
  let errors: jest.SpyInstance;
  beforeEach(() => {
    errors = jest.spyOn(console, "error").mockImplementation(() => undefined);
  });
  afterEach(() => errors.mockRestore());

  it("chave ilegível → emissão desligada, sem lançar e sem ecoar a chave", () => {
    // Texto que não é PEM válido (sem cabeçalho de chave, para o detetor de segredos não o confundir).
    const pem = "chave-invalida-SEGREDOFICTICIO";
    const mod = createInvoicingModule({ config: { privateKeyPem: pem, keyVersion: 1, certificateNumber: null }, issuers: new FakeIssuers(), scoped: noDb });

    expect(mod.useCases.meta().signingAvailable).toBe(false);
    expect(JSON.stringify(errors.mock.calls)).not.toContain("SEGREDOFICTICIO");
  });

  it("versão da chave ou n.º de certificado inválidos → configuração vazia", () => {
    expect(safeInvoicingConfig(() => readInvoicingConfig({ privateKeyPem: null, keyVersion: "x", certificateNumber: null }))).toEqual({
      privateKeyPem: null,
      keyVersion: 1,
      certificateNumber: null,
      software: { productName: "Mezza", producerTaxId: null, producerName: null, version: "1.0.0" },
      at: null,
    });
    expect(safeInvoicingConfig(() => readInvoicingConfig({ privateKeyPem: null, keyVersion: "1", certificateNumber: "12A" })).certificateNumber).toBeNull();
  });
});

describe("comunicação à AT: configuração", () => {
  const base = { privateKeyPem: null, keyVersion: "1", certificateNumber: null };

  it("sem certificado ou sem chave pública da AT → desligada (sem erro)", () => {
    expect(readInvoicingConfig(base).at).toBeNull();
    expect(readInvoicingConfig({ ...base, atTlsPfxBase64: "AAEC" }).at).toBeNull();
    expect(readInvoicingConfig({ ...base, atAuthPublicKeyPem: "pem" }).at).toBeNull();
  });

  it("com certificado e chave: ambiente de testes, .pfx descodificado de Base64", () => {
    const at = readInvoicingConfig({ ...base, atTlsPfxBase64: "AAEC", atTlsPassphrase: "frase", atAuthPublicKeyPem: "pem" }).at;
    expect(at).toEqual({ environment: "test", pfx: Buffer.from([0, 1, 2]), passphrase: "frase", authPublicKeyPem: "pem" });
  });

  it("produção recusada antes do certificado (configuração ilegível → tudo desligado)", () => {
    expect(() => readInvoicingConfig({ ...base, atEnvironment: "production" })).toThrow(/testes/);
  });

  it("chave pública da AT inválida → comunicação desligada, sem derrubar o arranque", () => {
    const errors = jest.spyOn(console, "error").mockImplementation(() => undefined);
    const config = readInvoicingConfig({ ...base, atTlsPfxBase64: "AAEC", atAuthPublicKeyPem: "não é uma chave" });
    const mod = createInvoicingModule({ config, issuers: new FakeIssuers(), scoped: noDb });
    expect(mod.atConfigured).toBe(false);
    errors.mockRestore();
  });
});
