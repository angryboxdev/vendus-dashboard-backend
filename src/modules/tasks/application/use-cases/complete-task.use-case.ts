import type { TaskRepositoryPort } from "../../domain/ports/out/task-repository.port.js";
import type {
  CompleteTaskPort,
  CompleteTaskCommand,
} from "../../domain/ports/in/complete-task.port.js";
import { TaskNotFoundError } from "../../domain/errors.js";

export class CompleteTaskUseCase implements CompleteTaskPort {
  constructor(private readonly taskRepository: TaskRepositoryPort) {}

  async execute(command: CompleteTaskCommand): Promise<void> {
    const task = await this.taskRepository.findById(command.taskId);
    if (!task) {
      throw new TaskNotFoundError(command.taskId);
    }
    task.complete();
    await this.taskRepository.save(task);
  }
}
