import { mintOrganizationId, type OrganizationId } from "../../../kernel/organization-id.js";
import { NotificationsUseCases } from "../application/use-cases/notifications.use-cases.js";
import { InvalidNotification, type Notification } from "../domain/entities/notification.js";
import type { NotificationStorePort } from "../domain/ports/out/notification-store.port.js";

const ORG = mintOrganizationId("org-a");

class FakeStore implements NotificationStorePort {
  rows: (Notification & { to: string; dedupe: string | null })[] = [];
  async insert(_o: OrganizationId, rows: { recipientUserId: string; kind: string; title: string; body: string | null; link: string | null; dedupeKey: string | null }[]) {
    let n = 0;
    for (const r of rows) {
      if (r.dedupeKey && this.rows.some((x) => x.to === r.recipientUserId && x.dedupe === r.dedupeKey)) continue;
      this.rows.push({ id: `n${this.rows.length + 1}`, to: r.recipientUserId, dedupe: r.dedupeKey, kind: r.kind, title: r.title, body: r.body, link: r.link, createdAt: `2026-10-11T10:00:0${this.rows.length}Z`, readAt: null });
      n++;
    }
    return n;
  }
  async list(_o: OrganizationId, userId: string, opts: { unreadOnly: boolean; limit: number }) {
    return this.rows.filter((r) => r.to === userId && (!opts.unreadOnly || !r.readAt)).reverse().slice(0, opts.limit);
  }
  async countUnread(_o: OrganizationId, userId: string) {
    return this.rows.filter((r) => r.to === userId && !r.readAt).length;
  }
  async markRead(_o: OrganizationId, userId: string, id: string | null) {
    for (const r of this.rows) if (r.to === userId && (!id || r.id === id)) r.readAt = "agora";
  }
  async activeAdmins() {
    return ["admin-1"];
  }
}

describe("Notificações na aplicação", () => {
  test("notifica cada destinatário uma vez; o mesmo evento repetido não duplica", async () => {
    const store = new FakeStore();
    const uc = new NotificationsUseCases(store);
    const cmd = { recipientUserIds: ["u1", "u2", "u1"], kind: "settings.retroactive_change", title: " Alteração retroativa ", link: "/hr/novo/configuracoes", dedupeKey: "settings:v1" };
    expect(await uc.notify(ORG, cmd)).toBe(2);
    expect(await uc.notify(ORG, cmd)).toBe(0);
    expect((await uc.listMine(ORG, "u1", { unreadOnly: false, limit: 10 }))[0]).toMatchObject({ title: "Alteração retroativa", link: "/hr/novo/configuracoes" });
  });

  test("só as minhas; marcar como lida uma ou todas", async () => {
    const store = new FakeStore();
    const uc = new NotificationsUseCases(store);
    await uc.notify(ORG, { recipientUserIds: ["u1"], kind: "x.y.z", title: "A" });
    await uc.notify(ORG, { recipientUserIds: ["u1"], kind: "x.y.z", title: "B" });
    await uc.notify(ORG, { recipientUserIds: ["u2"], kind: "x.y.z", title: "C" });
    expect(await uc.unreadCount(ORG, "u1")).toBe(2);
    await uc.markRead(ORG, "u1", "n1");
    expect((await uc.listMine(ORG, "u1", { unreadOnly: true, limit: 10 })).map((n) => n.title)).toEqual(["B"]);
    await uc.markAllRead(ORG, "u1");
    expect(await uc.unreadCount(ORG, "u1")).toBe(0);
    expect(await uc.unreadCount(ORG, "u2")).toBe(1);
  });

  test("valida tipo, título e ligação (só caminhos internos)", async () => {
    const uc = new NotificationsUseCases(new FakeStore());
    await expect(uc.notify(ORG, { recipientUserIds: ["u1"], kind: "X", title: "t" })).rejects.toBeInstanceOf(InvalidNotification);
    await expect(uc.notify(ORG, { recipientUserIds: ["u1"], kind: "a.b.c", title: " " })).rejects.toThrow("Título");
    await expect(uc.notify(ORG, { recipientUserIds: ["u1"], kind: "a.b.c", title: "t", link: "https://exemplo.invalid" })).rejects.toThrow("interno");
    await expect(uc.notify(ORG, { recipientUserIds: ["u1"], kind: "a.b.c", title: "t", link: "//evil.invalid" })).rejects.toThrow("interno");
    expect(await uc.notify(ORG, { recipientUserIds: [], kind: "a.b.c", title: "t" })).toBe(0);
  });
});
