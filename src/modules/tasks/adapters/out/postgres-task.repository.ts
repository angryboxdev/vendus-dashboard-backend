import type { Task } from "../../domain/entities/task.js";
import type { TaskRepositoryPort } from "../../domain/ports/out/task-repository.port.js";

/**
 * Implementação persistente do TaskRepositoryPort usando PostgreSQL/Supabase.
 *
 * Estrutura preparada — queries marcadas com TODO.
 * Para activar: injectar um client de DB no construtor e implementar os métodos.
 *
 * Trocar de InMemoryTaskRepository para esta implementação requer apenas
 * alterar uma linha em tasks.module.ts — os use cases e o domínio não mudam.
 *
 * Schema SQL sugerido:
 *   CREATE TABLE tasks (
 *     id         TEXT PRIMARY KEY,
 *     title      TEXT NOT NULL,
 *     status     TEXT NOT NULL DEFAULT 'pending',
 *     created_at TIMESTAMPTZ NOT NULL
 *   );
 */
export class PostgresTaskRepository implements TaskRepositoryPort {
  // TODO: injectar cliente (ex.: SupabaseClient ou pg.Pool) no construtor

  async save(_task: Task): Promise<void> {
    // TODO: INSERT INTO tasks (id, title, status, created_at) VALUES ($1, $2, $3, $4)
    //       ON CONFLICT (id) DO UPDATE SET status = EXCLUDED.status
    throw new Error("PostgresTaskRepository not yet implemented");
  }

  async findById(_id: string): Promise<Task | null> {
    // TODO: SELECT id, title, status, created_at FROM tasks WHERE id = $1
    //       Reconstituir com: Task.reconstitute({ id, title: TaskTitle.create(row.title), ... })
    throw new Error("PostgresTaskRepository not yet implemented");
  }

  async findAll(): Promise<Task[]> {
    // TODO: SELECT id, title, status, created_at FROM tasks ORDER BY created_at DESC
    throw new Error("PostgresTaskRepository not yet implemented");
  }
}
