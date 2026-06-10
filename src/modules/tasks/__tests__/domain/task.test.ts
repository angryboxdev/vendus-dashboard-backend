import { Task } from "../../domain/entities/task.js";
import { TaskAlreadyDoneError } from "../../domain/errors.js";

describe("Task entity", () => {
  describe("Task.create", () => {
    it("cria uma task com status pending", () => {
      const task = Task.create("Comprar leite");

      expect(task.status).toBe("pending");
      expect(task.title.value).toBe("Comprar leite");
      expect(task.id).toBeDefined();
      expect(task.createdAt).toBeInstanceOf(Date);
    });

    it("normaliza o título (trim)", () => {
      const task = Task.create("  Lavar louça  ");
      expect(task.title.value).toBe("Lavar louça");
    });

    it("lança erro se o título estiver vazio", () => {
      expect(() => Task.create("")).toThrow("Task title cannot be empty");
    });

    it("lança erro se o título for só espaços", () => {
      expect(() => Task.create("   ")).toThrow("Task title cannot be empty");
    });

    it("lança erro se o título exceder 200 caracteres", () => {
      expect(() => Task.create("a".repeat(201))).toThrow(
        "Task title cannot exceed 200 characters",
      );
    });

    it("aceita exactamente 200 caracteres", () => {
      expect(() => Task.create("a".repeat(200))).not.toThrow();
    });
  });

  describe("Task.complete", () => {
    it("muda o status para done", () => {
      const task = Task.create("Estudar");
      task.complete();
      expect(task.status).toBe("done");
    });

    it("lança TaskAlreadyDoneError ao concluir duas vezes", () => {
      const task = Task.create("Estudar");
      task.complete();
      expect(() => task.complete()).toThrow(TaskAlreadyDoneError);
    });

    it("a mensagem do erro inclui o id da task", () => {
      const task = Task.create("Estudar");
      task.complete();
      try {
        task.complete();
        fail("devia ter lançado erro");
      } catch (e) {
        expect(e).toBeInstanceOf(TaskAlreadyDoneError);
        expect((e as Error).message).toContain(task.id);
      }
    });
  });

  describe("Task.reconstitute", () => {
    it("cria a task com os dados fornecidos sem re-validar", () => {
      const date = new Date("2024-01-01");
      const { TaskTitle } = require("../../domain/entities/task-title");
      const title = TaskTitle.create("Tarefa antiga");
      const task = Task.reconstitute({ id: "abc-123", title, status: "done", createdAt: date });

      expect(task.id).toBe("abc-123");
      expect(task.status).toBe("done");
      expect(task.createdAt).toBe(date);
    });
  });
});
