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
    const pem = "-----BEGIN RSA PRIVATE KEY-----\nSEGREDOFICTICIO\n-----END RSA PRIVATE KEY-----";
    const mod = createInvoicingModule({ config: { privateKeyPem: pem, keyVersion: 1, certificateNumber: null }, issuers: new FakeIssuers(), scoped: noDb });

    expect(mod.useCases.meta().signingAvailable).toBe(false);
    expect(JSON.stringify(errors.mock.calls)).not.toContain("SEGREDOFICTICIO");
  });

  it("versão da chave ou n.º de certificado inválidos → configuração vazia", () => {
    expect(safeInvoicingConfig(() => readInvoicingConfig({ privateKeyPem: null, keyVersion: "x", certificateNumber: null }))).toEqual({
      privateKeyPem: null,
      keyVersion: 1,
      certificateNumber: null,
    });
    expect(safeInvoicingConfig(() => readInvoicingConfig({ privateKeyPem: null, keyVersion: "1", certificateNumber: "12A" })).certificateNumber).toBeNull();
  });
});
