import type { Router } from "express";
import { InMemoryTaskRepository } from "./adapters/out/in-memory-task.repository.js";
// Para usar Postgres: descomente a linha abaixo e comente a de cima.
// import { PostgresTaskRepository } from "./adapters/out/postgres-task.repository.js";
import { ConsoleNotificationAdapter } from "./adapters/out/console-notification.adapter.js";
import { CreateTaskUseCase } from "./application/use-cases/create-task.use-case.js";
import { CompleteTaskUseCase } from "./application/use-cases/complete-task.use-case.js";
import { ListTasksUseCase } from "./application/use-cases/list-tasks.use-case.js";
import { TaskController } from "./adapters/in/task.controller.js";

/**
 * Composition root do módulo tasks.
 *
 * Este é o ÚNICO lugar que conhece as implementações concretas dos adapters.
 * Todos os outros ficheiros do módulo (use cases, domínio) apenas conhecem
 * interfaces (ports).
 *
 * Para trocar de armazenamento em memória para Postgres basta:
 *   1. Substituir `new InMemoryTaskRepository()` por `new PostgresTaskRepository(client)`
 *   2. Fornecer o client de DB no construtor de PostgresTaskRepository
 *   — os use cases e o domínio não precisam de saber desta mudança.
 */
export function createTasksModule(): { router: Router } {
  // Adapters de saída (infra) — trocar aqui para mudar de provedor
  const taskRepository = new InMemoryTaskRepository();
  // const taskRepository = new PostgresTaskRepository(); // ← trocar aqui para Postgres
  const notification = new ConsoleNotificationAdapter();

  // Use cases recebem os output ports por injeção no construtor
  const createTask = new CreateTaskUseCase(taskRepository, notification);
  const completeTask = new CompleteTaskUseCase(taskRepository);
  const listTasks = new ListTasksUseCase(taskRepository);

  // Adapter de entrada (HTTP) — agrega os use cases e expõe via Express Router
  const controller = new TaskController(createTask, completeTask, listTasks);

  return { router: controller.router };
}
