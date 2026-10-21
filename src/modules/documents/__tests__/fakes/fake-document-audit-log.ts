import type { DocumentAuditLogEntry, DocumentAuditLogPort } from "../../domain/ports/out/document-audit-log.port.js";

export class FakeDocumentAuditLog implements DocumentAuditLogPort {
  readonly entries: DocumentAuditLogEntry[] = [];

  async record(entry: DocumentAuditLogEntry): Promise<void> {
    this.entries.push(entry);
  }
}
