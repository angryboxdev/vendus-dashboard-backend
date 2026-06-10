import { CompleteTaskUseCase } from "../../application/use-cases/complete-task.use-case.js";
import { FakeTaskRepository } from "../fakes/fake-task-repository.js";
import { Task } from "../../domain/entities/task.js";
import { TaskNotFoundError } from "../../domain/errors.js";
import { TaskAlreadyDoneError } from "../../domain/errors.js";

describe("CompleteTaskUseCase", () => {
  it("muda o status da task para done", async () => {
    const repo = new FakeTaskRepository();
    const task = Task.create("Tarefa teste");
    await repo.save(task);

    const useCase = new CompleteTaskUseCase(repo);
    await useCase.execute({ taskId: task.id });

    const updated = await repo.findById(task.id);
    expect(updated!.status).toBe("done");
  });

  it("lança TaskNotFoundError para id inexistente", async () => {
    const useCase = new CompleteTaskUseCase(new FakeTaskRepository());
    await expect(useCase.execute({ taskId: "nao-existe" })).rejects.toThrow(
      TaskNotFoundError,
    );
  });

  it("lança TaskAlreadyDoneError se a task já estava concluída", async () => {
    const repo = new FakeTaskRepository();
    const task = Task.create("Já feita");
    task.complete();
    await repo.save(task);

    const useCase = new CompleteTaskUseCase(repo);
    await expect(useCase.execute({ taskId: task.id })).rejects.toThrow(
      TaskAlreadyDoneError,
    );
  });
});
