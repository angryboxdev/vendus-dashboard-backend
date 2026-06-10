import type { TaskRepositoryPort } from "../../domain/ports/out/task-repository.port.js";
import type {
  ListTasksPort,
  TaskDto,
} from "../../domain/ports/in/list-tasks.port.js";

export class ListTasksUseCase implements ListTasksPort {
  constructor(private readonly taskRepository: TaskRepositoryPort) {}

  async execute(): Promise<TaskDto[]> {
    const tasks = await this.taskRepository.findAll();
    return tasks.map((t) => ({
      id: t.id,
      title: t.title.value,
      status: t.status,
      createdAt: t.createdAt,
    }));
  }
}
