import { Router } from "express";
import type { CreateTaskPort } from "../../domain/ports/in/create-task.port.js";
import type { CompleteTaskPort } from "../../domain/ports/in/complete-task.port.js";
import type { ListTasksPort } from "../../domain/ports/in/list-tasks.port.js";
import { TaskAlreadyDoneError, TaskNotFoundError } from "../../domain/errors.js";

export class TaskController {
  readonly router: Router;

  constructor(
    private readonly createTask: CreateTaskPort,
    private readonly completeTask: CompleteTaskPort,
    private readonly listTasks: ListTasksPort,
  ) {
    this.router = Router();
    this.registerRoutes();
  }

  private registerRoutes(): void {
    /**
     * POST /tasks
     * Body: { title: string }
     * Cria uma nova tarefa com status "pending".
     */
    this.router.post("/tasks", async (req, res) => {
      try {
        const body = req.body as { title?: unknown };
        if (typeof body.title !== "string" || body.title.trim().length === 0) {
          res.status(400).json({ error: "title is required" });
          return;
        }
        const result = await this.createTask.execute({ title: body.title });
        res.status(201).json(result);
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : "Internal error";
        res.status(500).json({ error: msg });
      }
    });

    /**
     * PATCH /tasks/:id/complete
     * Marca a tarefa como concluída.
     * 404 se não encontrada, 409 se já estava concluída.
     */
    this.router.patch("/tasks/:id/complete", async (req, res) => {
      try {
        const taskId = req.params["id"] as string;
        await this.completeTask.execute({ taskId });
        res.status(204).send();
      } catch (e: unknown) {
        if (e instanceof TaskNotFoundError) {
          res.status(404).json({ error: e.message });
          return;
        }
        if (e instanceof TaskAlreadyDoneError) {
          res.status(409).json({ error: e.message });
          return;
        }
        const msg = e instanceof Error ? e.message : "Internal error";
        res.status(500).json({ error: msg });
      }
    });

    /**
     * GET /tasks
     * Retorna todas as tarefas como DTOs.
     */
    this.router.get("/tasks", async (_req, res) => {
      try {
        const tasks = await this.listTasks.execute();
        res.json(tasks);
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : "Internal error";
        res.status(500).json({ error: msg });
      }
    });
  }
}
