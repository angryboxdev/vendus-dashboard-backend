import type { DemoDatasetOptions } from "../../entities/demo-dataset.js";

export interface DemoDatasetSummary {
  tenants: number;
  centers: number;
  employees: number;
  punches: number;
  /** Onde ficou (ex.: caminho do ficheiro). */
  target: string;
}

export interface GenerateDemoDatasetPort {
  execute(options: DemoDatasetOptions): Promise<DemoDatasetSummary>;
}
