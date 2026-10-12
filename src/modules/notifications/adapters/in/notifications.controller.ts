import { Router } from "express";
import type { NotificationsPort } from "../../domain/ports/in/notifications.port.js";

/**
 * As minhas notificações — `/api/me/notifications` (classificado como
 * "portal": qualquer utilizador autenticado, só as suas).
 */
export function createNotificationsRouter(n: NotificationsPort): Router {
  const r = Router();
  r.get("/me/notifications", async (req, res) => {
    const limit = Number(typeof req.query.limit === "string" ? req.query.limit : 30);
    res.json(await n.listMine(req.auth!.orgId, req.auth!.sub, { unreadOnly: req.query.unread === "1", limit: Number.isFinite(limit) ? limit : 30 }));
  });
  r.get("/me/notifications/unread-count", async (req, res) => {
    res.json({ count: await n.unreadCount(req.auth!.orgId, req.auth!.sub) });
  });
  r.post("/me/notifications/read-all", async (req, res) => {
    await n.markAllRead(req.auth!.orgId, req.auth!.sub);
    res.json({ ok: true });
  });
  r.post("/me/notifications/:id/read", async (req, res) => {
    await n.markRead(req.auth!.orgId, req.auth!.sub, req.params.id as string);
    res.json({ ok: true });
  });
  return r;
}
