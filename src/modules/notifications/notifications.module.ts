import type { Router } from "express";
import { createScopedQuery } from "../../infra/scoped-db/scoped-query.js";
import { createNotificationsRouter } from "./adapters/in/notifications.controller.js";
import { SupabaseNotificationStore } from "./adapters/out/supabase-notification.store.js";
import { NotificationsUseCases } from "./application/use-cases/notifications.use-cases.js";
import type { NotificationsPort } from "./domain/ports/in/notifications.port.js";

/** Composition root das notificações (Novo RH, Fase 1 ticket 10). */
export function createNotificationsModule(): { router: Router; notifications: NotificationsPort } {
  const notifications = new NotificationsUseCases(new SupabaseNotificationStore(createScopedQuery));
  return { router: createNotificationsRouter(notifications), notifications };
}
