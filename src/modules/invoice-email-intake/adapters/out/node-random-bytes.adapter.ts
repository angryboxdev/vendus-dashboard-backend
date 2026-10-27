import { randomBytes } from "node:crypto";
import type { RandomBytesPort } from "../../domain/ports/out/email-intake.out-ports.js";

export class NodeRandomBytesAdapter implements RandomBytesPort {
  bytes(length: number): Uint8Array {
    return randomBytes(length);
  }
}
