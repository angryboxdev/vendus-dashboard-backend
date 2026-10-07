import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import type { UpdateWorkShiftCommand } from "../../../domain/ports/in/schedule.ports.js";

// Mesmo padrão de `tokens-me-route.test.ts`: Express real + http.Server + fetch, sem supertest.
// eslint-disable-next-line @typescript-eslint/no-var-requires
const express = require("express") as typeof import("express");

jest.mock("../../../../../middleware/auth.js", () => ({
  requireAuth: (_req: unknown, _res: unknown, next: () => void) => next(),
  requireMinRole: () => (_req: unknown, _res: unknown, next: () => void) => next(),
}));

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { HrSchedulesController } = require("../../../adapters/in/hr-schedules.controller.js") as typeof import("../../../adapters/in/hr-schedules.controller.js");

/**
 * Editar um turno: "termina no dia seguinte" e o 2º período têm de chegar
 * ao caso de uso — antes a rota descartava-os e desmarcar a opção não era
 * gravado (turno do Kleiton, 2026-10-07).
 */
describe("PATCH /hr/schedules/work-shifts/:id", () => {
  let server: Server;
  let received: UpdateWorkShiftCommand | null = null;

  beforeAll(async () => {
    const update = {
      execute: async (cmd: UpdateWorkShiftCommand) => {
        received = cmd;
        return { id: cmd.id };
      },
    };
    const unused = new Proxy({}, { get: () => () => Promise.reject(new Error("not exercised")) });
    const args = Array.from({ length: 24 }, () => unused) as unknown[];
    args[2] = update; // updateWorkShift
    const controller = new (HrSchedulesController as unknown as new (...a: unknown[]) => { router: import("express").Router })(...args);
    const app = express();
    app.use(express.json());
    app.use((req, _res, next) => {
      (req as unknown as { auth: unknown }).auth = { orgId: "org-a", email: "gestor@example.com", sub: "u1" };
      next();
    });
    app.use(controller.router);
    server = app.listen(0);
  });

  afterAll(() => new Promise<void>((r) => server.close(() => r())));

  async function patch(body: unknown) {
    const { port } = server.address() as AddressInfo;
    return fetch(`http://127.0.0.1:${port}/hr/schedules/work-shifts/s1`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  }

  it("passa endsNextDay: false (desmarcar 'termina no dia seguinte')", async () => {
    const res = await patch({ startTime: "20:00", endTime: "23:59", endsNextDay: false });
    expect(res.status).toBe(200);
    expect(received).toMatchObject({ id: "s1", startTime: "20:00", endTime: "23:59", endsNextDay: false });
  });

  it("passa o 2º período e permite apagá-lo (null)", async () => {
    await patch({ secondStartTime: "19:00", secondEndTime: "23:00" });
    expect(received).toMatchObject({ secondStartTime: "19:00", secondEndTime: "23:00" });
    await patch({ secondStartTime: null, secondEndTime: null });
    expect(received).toMatchObject({ secondStartTime: null, secondEndTime: null });
  });

  it("sem os campos, não os envia (não mexe no que existe)", async () => {
    await patch({ startTime: "10:00" });
    expect(received).not.toHaveProperty("endsNextDay");
    expect(received).not.toHaveProperty("secondStartTime");
  });
});
