import type { DemoDataset } from "../../entities/demo-dataset.js";

/** Para onde vai o conjunto gerado. Fase 0: ficheiro JSON. Depois: carregador na organização de demonstração. */
export interface DemoDatasetSinkPort {
  /** Devolve uma descrição do destino (ex.: caminho). */
  write(dataset: DemoDataset): Promise<string>;
}
