import type { Task } from "../../entities/task.js";

export interface TaskRepositoryPort {
  save(task: Task): Promise<void>;
  findById(id: string): Promise<Task | null>;
  findAll(): Promise<Task[]>;
}
