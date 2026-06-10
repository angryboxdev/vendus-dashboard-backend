import { Task } from "../../domain/entities/task.js";
import type { TaskRepositoryPort } from "../../domain/ports/out/task-repository.port.js";
import type { NotificationPort } from "../../domain/ports/out/notification.port.js";
import type {
  CreateTaskPort,
  CreateTaskCommand,
  CreateTaskResult,
} from "../../domain/ports/in/create-task.port.js";

export class CreateTaskUseCase implements CreateTaskPort {
  constructor(
    private readonly taskRepository: TaskRepositoryPort,
    private readonly notification: NotificationPort,
  ) {}

  async execute(command: CreateTaskCommand): Promise<CreateTaskResult> {
    const task = Task.create(command.title);
    await this.taskRepository.save(task);
    await this.notification.notifyTaskCreated(task.id, task.title.value);
    return {
      id: task.id,
      title: task.title.value,
      status: task.status,
      createdAt: task.createdAt,
    };
  }
}
