import { randomBytes } from "node:crypto";
import { decrypt, encrypt } from "../encryption.js";

describe("encryption", () => {
  it("round-trips arbitrary strings", () => {
    for (const plaintext of ["", "hello", "a".repeat(500), "ç é ñ 日本語 🔑"]) {
      expect(decrypt(encrypt(plaintext))).toBe(plaintext);
    }
  });

  it("produces a different ciphertext each time (random IV)", () => {
    expect(encrypt("same-secret")).not.toBe(encrypt("same-secret"));
  });

  it("fails loudly on a tampered ciphertext", () => {
    const raw = Buffer.from(encrypt("top-secret"), "base64");
    raw[raw.length - 1] = raw[raw.length - 1]! ^ 0xff;
    const tampered = raw.toString("base64");

    expect(() => decrypt(tampered)).toThrow();
  });

  it("fails loudly when decrypting with the wrong key", () => {
    const ciphertext = encrypt("top-secret", randomBytes(32));
    const wrongKey = randomBytes(32);

    expect(() => decrypt(ciphertext, wrongKey)).toThrow();
  });
});
