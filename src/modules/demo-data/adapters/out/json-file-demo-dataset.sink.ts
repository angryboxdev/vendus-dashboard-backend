import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import type { DemoDataset } from "../../domain/entities/demo-dataset.js";
import type { DemoDatasetSinkPort } from "../../domain/ports/out/demo-dataset-sink.port.js";

/** Escreve o conjunto num ficheiro JSON local (pasta `.demo/`, fora do git). */
export class JsonFileDemoDatasetSink implements DemoDatasetSinkPort {
  constructor(private readonly filePath: string) {}

  async write(dataset: DemoDataset): Promise<string> {
    const path = resolve(this.filePath);
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, JSON.stringify(dataset, null, 2), "utf8");
    return path;
  }
}
