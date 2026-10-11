import type { DemoDatasetOptions } from "../../domain/entities/demo-dataset.js";
import type { DemoDatasetSummary, GenerateDemoDatasetPort } from "../../domain/ports/in/generate-demo-dataset.port.js";
import type { DemoDatasetSinkPort } from "../../domain/ports/out/demo-dataset-sink.port.js";
import { generateDemoDataset } from "../../domain/services/demo-dataset.generator.js";

export class GenerateDemoDatasetUseCase implements GenerateDemoDatasetPort {
  constructor(private readonly sink: DemoDatasetSinkPort) {}

  async execute(options: DemoDatasetOptions): Promise<DemoDatasetSummary> {
    if (!Number.isInteger(options.seed)) throw new Error("A semente tem de ser um número inteiro.");
    if (!Number.isInteger(options.employeesPerCenter) || options.employeesPerCenter < 1 || options.employeesPerCenter > 500) {
      throw new Error("Funcionários por centro: entre 1 e 500.");
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(options.from) || !/^\d{4}-\d{2}-\d{2}$/.test(options.to) || options.from > options.to) {
      throw new Error("Período inválido (AAAA-MM-DD, início ≤ fim).");
    }
    const dataset = generateDemoDataset(options);
    const target = await this.sink.write(dataset);
    return {
      tenants: dataset.tenants.length,
      centers: dataset.centers.length,
      employees: dataset.employees.length,
      punches: dataset.punches.length,
      target,
    };
  }
}
