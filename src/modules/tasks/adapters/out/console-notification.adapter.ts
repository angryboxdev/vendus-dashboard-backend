import type { NotificationPort } from "../../domain/ports/out/notification.port.js";

export class ConsoleNotificationAdapter implements NotificationPort {
  async notifyTaskCreated(taskId: string, taskTitle: string): Promise<void> {
    console.log(`[Notification] Task created: [${taskId}] "${taskTitle}"`);
  }
}
