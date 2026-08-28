import { mintOrganizationId } from "../../../../kernel/organization-id.js";
import { CreateRecurrenceUseCase } from "../../application/use-cases/create-recurrence.use-case.js";
import { PauseRecurrenceUseCase } from "../../application/use-cases/pause-recurrence.use-case.js";
import { ResumeRecurrenceUseCase } from "../../application/use-cases/resume-recurrence.use-case.js";
import { CloseRecurrenceUseCase } from "../../application/use-cases/close-recurrence.use-case.js";
import { FakeRecurrenceRepository } from "../fakes/fake-recurrence-repository.js";
import { RecurrenceNotFoundError, RecurrenceClosedError, RecurrenceAlreadyPausedError } from "../../domain/errors.js";

const organizationId = mintOrganizationId("org-a");

const BASE_CMD = {
  organizationId,
  name: "Contabilidade",
  supplierName: "Contabilista Lda",
  type: "recurring_service" as const,
  estimatedAmountCents: 25000,
  dayOfMonth: 10,
  startDate: "2026-01-01",
  paymentMethod: "transfer" as const,
};

describe("Pause / Resume / Close recurrence use cases", () => {
  function make() {
    const repo = new FakeRecurrenceRepository();
    return {
      repo,
      create: new CreateRecurrenceUseCase(repo),
      pause: new PauseRecurrenceUseCase(repo),
      resume: new ResumeRecurrenceUseCase(repo),
      close: new CloseRecurrenceUseCase(repo),
    };
  }

  it("pausa uma recorrência activa", async () => {
    const { create, pause } = make();
    const dto = await create.execute(BASE_CMD);
    const paused = await pause.execute({ organizationId, id: dto.id });
    expect(paused.status).toBe("paused");
  });

  it("retoma uma recorrência pausada", async () => {
    const { create, pause, resume } = make();
    const dto = await create.execute(BASE_CMD);
    await pause.execute({ organizationId, id: dto.id });
    const resumed = await resume.execute({ organizationId, id: dto.id });
    expect(resumed.status).toBe("active");
  });

  it("fecha uma recorrência activa", async () => {
    const { create, close } = make();
    const dto = await create.execute(BASE_CMD);
    const closed = await close.execute({ organizationId, id: dto.id });
    expect(closed.status).toBe("closed");
  });

  it("lança RecurrenceNotFoundError para id inexistente", async () => {
    const { pause } = make();
    await expect(pause.execute({ organizationId, id: "nao-existe" })).rejects.toThrow(RecurrenceNotFoundError);
  });

  it("lança RecurrenceNotFoundError para uma recorrência que pertence a outra organização", async () => {
    const { create, pause } = make();
    const dto = await create.execute(BASE_CMD);
    const otherOrganizationId = mintOrganizationId("org-b");
    await expect(pause.execute({ organizationId: otherOrganizationId, id: dto.id })).rejects.toThrow(
      RecurrenceNotFoundError,
    );
  });

  it("lança RecurrenceAlreadyPausedError ao pausar de novo", async () => {
    const { create, pause } = make();
    const dto = await create.execute(BASE_CMD);
    await pause.execute({ organizationId, id: dto.id });
    await expect(pause.execute({ organizationId, id: dto.id })).rejects.toThrow(RecurrenceAlreadyPausedError);
  });

  it("lança RecurrenceClosedError ao fechar encerrada", async () => {
    const { create, close } = make();
    const dto = await create.execute(BASE_CMD);
    await close.execute({ organizationId, id: dto.id });
    await expect(close.execute({ organizationId, id: dto.id })).rejects.toThrow(RecurrenceClosedError);
  });
});
