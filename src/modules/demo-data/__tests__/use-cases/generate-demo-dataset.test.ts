import type { DemoDataset } from "../../domain/entities/demo-dataset.js";
import type { DemoDatasetSinkPort } from "../../domain/ports/out/demo-dataset-sink.port.js";
import { GenerateDemoDatasetUseCase } from "../../application/use-cases/generate-demo-dataset.use-case.js";

class FakeSink implements DemoDatasetSinkPort {
  written: DemoDataset | null = null;
  async write(dataset: DemoDataset): Promise<string> {
    this.written = dataset;
    return "memória";
  }
}

describe("GenerateDemoDatasetUseCase", () => {
  test("gera, entrega ao destino e devolve o resumo", async () => {
    const sink = new FakeSink();
    const summary = await new GenerateDemoDatasetUseCase(sink).execute({ seed: 1, employeesPerCenter: 3, from: "2026-10-19", to: "2026-10-20" });
    expect(summary).toMatchObject({ tenants: 2, centers: 4, employees: 12, target: "memória" });
    expect(summary.punches).toBe(sink.written!.punches.length);
  });

  test.each([
    [{ seed: 1.5, employeesPerCenter: 3, from: "2026-10-19", to: "2026-10-20" }],
    [{ seed: 1, employeesPerCenter: 0, from: "2026-10-19", to: "2026-10-20" }],
    [{ seed: 1, employeesPerCenter: 3, from: "2026-10-21", to: "2026-10-20" }],
  ])("recusa opções inválidas %#", async (opts) => {
    const sink = new FakeSink();
    await expect(new GenerateDemoDatasetUseCase(sink).execute(opts)).rejects.toThrow();
    expect(sink.written).toBeNull();
  });
});
