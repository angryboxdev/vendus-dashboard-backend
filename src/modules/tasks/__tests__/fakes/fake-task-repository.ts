import type { Task } from "../../domain/entities/task.js";
import type { TaskRepositoryPort } from "../../domain/ports/out/task-repository.port.js";

export class FakeTaskRepository implements TaskRepositoryPort {
  private readonly store = new Map<string, Task>();

  async save(task: Task): Promise<void> {
    this.store.set(task.id, task);
  }

  async findById(id: string): Promise<Task | null> {
    return this.store.get(id) ?? null;
  }

  async findAll(): Promise<Task[]> {
    return Array.from(this.store.values());
  }
}
