import { CreateTaskUseCase } from "../../application/use-cases/create-task.use-case.js";
import { FakeTaskRepository } from "../fakes/fake-task-repository.js";
import { FakeNotificationPort } from "../fakes/fake-notification-port.js";

describe("CreateTaskUseCase", () => {
  function makeUseCase() {
    const repo = new FakeTaskRepository();
    const notification = new FakeNotificationPort();
    const useCase = new CreateTaskUseCase(repo, notification);
    return { repo, notification, useCase };
  }

  it("persiste a task no repositório", async () => {
    const { repo, useCase } = makeUseCase();

    const result = await useCase.execute({ title: "Regar as plantas" });

    const saved = await repo.findById(result.id);
    expect(saved).not.toBeNull();
    expect(saved!.title.value).toBe("Regar as plantas");
    expect(saved!.status).toBe("pending");
  });

  it("dispara notificação com o id e título corretos", async () => {
    const { notification, useCase } = makeUseCase();

    const result = await useCase.execute({ title: "Regar as plantas" });

    expect(notification.calls).toHaveLength(1);
    expect(notification.calls[0]).toEqual({
      taskId: result.id,
      taskTitle: "Regar as plantas",
    });
  });

  it("retorna os dados correctos no resultado", async () => {
    const { useCase } = makeUseCase();

    const result = await useCase.execute({ title: "  Lavar louça  " });

    // O VO normaliza o título (trim)
    expect(result.title).toBe("Lavar louça");
    expect(result.status).toBe("pending");
    expect(result.createdAt).toBeInstanceOf(Date);
    expect(typeof result.id).toBe("string");
  });

  it("lança erro de domínio se título for vazio (sem chamar repo ou notificação)", async () => {
    const { repo, notification, useCase } = makeUseCase();

    await expect(useCase.execute({ title: "" })).rejects.toThrow(
      "Task title cannot be empty",
    );

    // Não deve ter persistido nada
    expect(await repo.findAll()).toHaveLength(0);
    // Nem disparado notificação
    expect(notification.calls).toHaveLength(0);
  });
});
