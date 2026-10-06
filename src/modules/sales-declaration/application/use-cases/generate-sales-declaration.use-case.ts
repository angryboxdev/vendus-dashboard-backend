import type {
  GenerateSalesDeclarationInput,
  GenerateSalesDeclarationPort,
} from "../../domain/ports/in/generate-sales-declaration.port.js";
import type { SalesDeclarationFileWriterPort } from "../../domain/ports/out/sales-declaration-file-writer.port.js";
import type { SalesDeclarationFile, SalesDeclarationStore } from "../../domain/entities/sales-declaration.js";
import { InvalidSaftFileError, InvalidSalesDeclarationRequestError } from "../../domain/errors.js";
import { parseSaftSales } from "../../domain/services/saft-sales-parser.service.js";
import {
  buildSalesDeclarationRows,
  declarationPeriod,
  mergeSaftSales,
} from "../../domain/services/sales-declaration-builder.service.js";

export class GenerateSalesDeclarationUseCase implements GenerateSalesDeclarationPort {
  constructor(
    private readonly fileWriter: SalesDeclarationFileWriterPort,
    private readonly store: SalesDeclarationStore,
  ) {}

  async execute({ saftFiles }: GenerateSalesDeclarationInput): Promise<SalesDeclarationFile> {
    if (saftFiles.length === 0) {
      throw new InvalidSalesDeclarationRequestError("Envie pelo menos um ficheiro SAF-T");
    }

    const parsed = saftFiles.map((file) => {
      try {
        return parseSaftSales(file.content);
      } catch (e) {
        if (e instanceof InvalidSaftFileError) throw new InvalidSaftFileError(`${file.name}: ${e.message}`);
        throw e;
      }
    });

    const period = declarationPeriod(parsed);
    if (!period) {
      throw new InvalidSaftFileError("Os SAF-T não têm datas nem documentos de venda");
    }

    const rows = buildSalesDeclarationRows(period.since, period.until, mergeSaftSales(parsed));
    return {
      fileName: `SalesReport_${period.since}_${period.until}.xlsx`,
      content: this.fileWriter.write(this.store, rows),
    };
  }
}
