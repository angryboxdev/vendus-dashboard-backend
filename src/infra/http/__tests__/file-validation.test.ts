import { HR_DOCUMENT_POLICY, sniffKind, validateFile } from "../file-validation.js";

const bytes = (...b: number[]) => new Uint8Array([...b, ...new Array(16).fill(0)]);
const PDF = bytes(0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x37);
const PNG = bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a);
const JPG = bytes(0xff, 0xd8, 0xff, 0xe0);
const WEBP = new Uint8Array([0x52, 0x49, 0x46, 0x46, 1, 2, 3, 4, 0x57, 0x45, 0x42, 0x50, 0, 0]);
const EXE = bytes(0x4d, 0x5a, 0x90, 0x00);

describe("validação de ficheiros", () => {
  test("reconhece o tipo pelo conteúdo", () => {
    expect([PDF, PNG, JPG, WEBP, EXE].map(sniffKind)).toEqual(["pdf", "png", "jpeg", "webp", null]);
  });

  test("aceita PDF/imagem coerentes; recusa vazio, grande, tipo não aceite e conteúdo trocado", () => {
    expect(validateFile({ buffer: PDF, size: PDF.length, mimetype: "application/pdf" }, HR_DOCUMENT_POLICY)).toMatchObject({ ok: true, kind: "pdf" });
    expect(validateFile({ buffer: JPG, size: JPG.length, mimetype: "image/jpg" }, HR_DOCUMENT_POLICY)).toMatchObject({ ok: true, kind: "jpeg" });
    expect(validateFile({ buffer: new Uint8Array(), size: 0, mimetype: "application/pdf" }, HR_DOCUMENT_POLICY)).toMatchObject({ ok: false, reason: "empty" });
    expect(validateFile({ buffer: PDF, size: 11 * 1024 * 1024, mimetype: "application/pdf" }, HR_DOCUMENT_POLICY)).toMatchObject({ ok: false, reason: "too_large" });
    expect(validateFile({ buffer: EXE, size: EXE.length, mimetype: "application/pdf" }, HR_DOCUMENT_POLICY)).toMatchObject({ ok: false, reason: "type_not_allowed" });
    expect(validateFile({ buffer: PNG, size: PNG.length, mimetype: "application/pdf" }, HR_DOCUMENT_POLICY)).toMatchObject({ ok: false, reason: "content_mismatch" });
    expect(validateFile({ buffer: PNG, size: PNG.length, mimetype: "image/png" }, { allowed: ["pdf"], maxBytes: 1000 })).toMatchObject({ ok: false, reason: "type_not_allowed" });
  });
});
