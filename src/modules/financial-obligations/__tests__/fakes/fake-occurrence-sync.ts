import type { OccurrenceSyncPort } from "../../domain/ports/out/occurrence-sync.port.js";

export class FakeOccurrenceSync implements OccurrenceSyncPort {
  readonly synced: string[] = [];

  async syncPayableMarkedPaid(payableEntryId: string): Promise<void> {
    this.synced.push(payableEntryId);
  }
}
