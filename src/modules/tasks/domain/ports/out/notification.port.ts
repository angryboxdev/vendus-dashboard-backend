export interface NotificationPort {
  notifyTaskCreated(taskId: string, taskTitle: string): Promise<void>;
}
