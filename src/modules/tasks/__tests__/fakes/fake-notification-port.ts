import type { NotificationPort } from "../../domain/ports/out/notification.port.js";

export class FakeNotificationPort implements NotificationPort {
  readonly calls: Array<{ taskId: string; taskTitle: string }> = [];

  async notifyTaskCreated(taskId: string, taskTitle: string): Promise<void> {
    this.calls.push({ taskId, taskTitle });
  }
}
