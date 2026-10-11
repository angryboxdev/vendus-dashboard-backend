import { JsonFileDemoDatasetSink } from "./adapters/out/json-file-demo-dataset.sink.js";
import { GenerateDemoDatasetUseCase } from "./application/use-cases/generate-demo-dataset.use-case.js";
import type { GenerateDemoDatasetPort } from "./domain/ports/in/generate-demo-dataset.port.js";

/**
 * Composition root do módulo demo-data. Fase 0: só ficheiro JSON. O
 * carregador para a organização de demonstração entra quando o modelo novo
 * do RH tiver tabelas (Fase 1+) — ver README e ADR-0021.
 */
export function createDemoDataModule(options: { outputFile: string }): { generate: GenerateDemoDatasetPort } {
  const sink = new JsonFileDemoDatasetSink(options.outputFile);
  return { generate: new GenerateDemoDatasetUseCase(sink) };
}
