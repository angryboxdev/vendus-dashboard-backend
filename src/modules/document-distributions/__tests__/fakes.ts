import type { OrganizationId } from "../../../kernel/organization-id.js";
import type { Audience, Distribution, DistributionRecipient } from "../domain/entities/distribution.js";
import type { DistributionFilesPort, DistributionsContextPort, DistributionsRepositoryPort } from "../domain/ports/out/distributions.ports.js";

/** Fakes dos ports de saída (sem BD nem armazenamento). */
export class FakeRepo implements DistributionsRepositoryPort {
  items: (Distribution & { storagePath: string })[] = [];
  rows: DistributionRecipient[] = [];
  async list() {
    return this.items.map(({ storagePath: _p, ...d }) => d);
  }
  async get(_o: OrganizationId, id: string) {
    const d = this.items.find((x) => x.id === id);
    return d ? { ...d } : null;
  }
  async create(_o: OrganizationId, d: Omit<Distribution, "id" | "status" | "createdAt"> & { storagePath: string }) {
    const row = { ...d, id: `d${this.items.length + 1}`, status: "sent" as const, createdAt: `2026-10-1${this.items.length}T09:00:00.000Z` };
    this.items.push(row);
    const { storagePath: _p, ...out } = row;
    return out;
  }
  async setStatus(_o: OrganizationId, id: string, status: Distribution["status"]) {
    this.items.find((x) => x.id === id)!.status = status;
  }
  async insertRecipients(_o: OrganizationId, distributionId: string, r: { employeeId: string; userId: string | null }[]) {
    this.rows.push(...r.map((x) => ({ ...x, distributionId, deliveredAt: "2026-10-12T09:00:00.000Z", readAt: null, confirmedAt: null })));
  }
  async listRecipients(_o: OrganizationId, id: string) {
    return this.rows.filter((r) => r.distributionId === id).map((r) => ({ ...r }));
  }
  async listAllRecipients(_o: OrganizationId, ids: string[]) {
    return this.rows.filter((r) => ids.includes(r.distributionId)).map((r) => ({ ...r }));
  }
  async recipientRows(_o: OrganizationId, employeeId: string) {
    return this.rows.filter((r) => r.employeeId === employeeId).map((r) => ({ ...r }));
  }
  async mark(_o: OrganizationId, id: string, employeeId: string, patch: { readAt?: string; confirmedAt?: string }) {
    const r = this.rows.find((x) => x.distributionId === id && x.employeeId === employeeId);
    if (!r) return null;
    if (patch.readAt && !r.readAt) r.readAt = patch.readAt;
    if (patch.confirmedAt && !r.confirmedAt) r.confirmedAt = patch.confirmedAt;
    return { ...r };
  }
}

export class FakeFiles implements DistributionFilesPort {
  stored: string[] = [];
  async store(_o: OrganizationId, _b: Buffer, name: string) {
    this.stored.push(name);
    return `org-a/distributions/x/${name}`;
  }
  async signedUrl(_o: OrganizationId, path: string) {
    return `https://signed.invalid/${path}`;
  }
}

export class FakeCtx implements DistributionsContextPort {
  sent: { userIds: string[]; title: string; dedupeKey: string }[] = [];
  audits: string[] = [];
  people = [
    { employeeId: "e1", userId: "u-e1", location: "porto" },
    { employeeId: "e2", userId: null, location: "porto" },
    { employeeId: "e3", userId: "u-e3", location: "lisboa" },
  ];
  async resolveAudience(_o: OrganizationId, a: Audience) {
    const pick = a.type === "all" ? this.people : a.type === "employees" ? this.people.filter((p) => a.ids.includes(p.employeeId)) : this.people.filter((p) => a.ids.includes(p.location));
    return pick.map(({ employeeId, userId }) => ({ employeeId, userId }));
  }
  async employeeForUser(_o: OrganizationId, userId: string) {
    return this.people.find((p) => p.userId === userId)?.employeeId ?? null;
  }
  async employeeNames() {
    return new Map([
      ["e1", "Ana Demo"],
      ["e2", "=Bruno Demo"],
      ["e3", "Rui Demo"],
    ]);
  }
  async notify(_o: OrganizationId, userIds: string[], n: { title: string; dedupeKey: string }) {
    this.sent.push({ userIds, title: n.title, dedupeKey: n.dedupeKey });
  }
  now() {
    return "2026-10-12T11:00:00.000Z";
  }
  async audit(_o: OrganizationId, e: { action: string }) {
    this.audits.push(e.action);
  }
}
