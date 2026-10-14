import type { LocationReadPort } from "../../domain/ports/out/location-read.port.js";

export class FakeLocationRead implements LocationReadPort {
  locations = new Map<string, { id: string; name: string; isActive: boolean }>();
  seed(...ls: { id: string; name: string; isActive?: boolean }[]) {
    for (const l of ls) this.locations.set(l.id, { isActive: true, ...l });
    return this;
  }
  async findById(_o: unknown, id: string) {
    return this.locations.get(id) ?? null;
  }
}
