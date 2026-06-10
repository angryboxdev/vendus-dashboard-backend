import { ListTasksUseCase } from "../../application/use-cases/list-tasks.use-case.js";
import { FakeTaskRepository } from "../fakes/fake-task-repository.js";
import { Task } from "../../domain/entities/task.js";

describe("ListTasksUseCase", () => {
  it("retorna lista vazia quando não há tasks", async () => {
    const useCase = new ListTasksUseCase(new FakeTaskRepository());
    const result = await useCase.execute();
    expect(result).toEqual([]);
  });

  it("retorna todas as tasks como DTOs simples", async () => {
    const repo = new FakeTaskRepository();
    const t1 = Task.create("Task A");
    const t2 = Task.create("Task B");
    t2.complete();
    await repo.save(t1);
    await repo.save(t2);

    const useCase = new ListTasksUseCase(repo);
    const result = await useCase.execute();

    expect(result).toHaveLength(2);

    const dtoA = result.find((t) => t.id === t1.id)!;
    expect(dtoA.title).toBe("Task A");
    expect(dtoA.status).toBe("pending");
    expect(dtoA.createdAt).toBeInstanceOf(Date);

    const dtoB = result.find((t) => t.id === t2.id)!;
    expect(dtoB.title).toBe("Task B");
    expect(dtoB.status).toBe("done");
  });

  it("os DTOs não expõem internals do VO (title é string, não TaskTitle)", async () => {
    const repo = new FakeTaskRepository();
    await repo.save(Task.create("Tarefa qualquer"));

    const useCase = new ListTasksUseCase(repo);
    const [dto] = await useCase.execute();

    expect(typeof dto!.title).toBe("string");
  });
});
