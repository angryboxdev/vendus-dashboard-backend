import type { Router } from "express";
import type { SalesDeclarationStore } from "./domain/entities/sales-declaration.js";
import { XlsxSalesDeclarationWriterAdapter } from "./adapters/out/xlsx-sales-declaration-writer.adapter.js";
import { GenerateSalesDeclarationUseCase } from "./application/use-cases/generate-sales-declaration.use-case.js";
import { SalesDeclarationController } from "./adapters/in/sales-declaration.controller.js";

/** Identificação da loja no ficheiro do Mercado Bom Sucesso (colunas fixas). */
export const BOM_SUCESSO_STORE: SalesDeclarationStore = {
  businessUnitCode: "PT32",
  businessUnit: "Mercado Bom Sucesso",
  companyName: "ANGRY BOX PIZZA SHOP",
  storeNumber: "L027",
  contract: "0000100000040",
};

/**
 * Composition root do módulo sales-declaration — único sítio que conhece os
 * adapters concretos. Não depende de outros módulos nem de APIs externas:
 * trabalha só sobre os SAF-T enviados.
 */
export function createSalesDeclarationModule(): { router: Router } {
  const generateSalesDeclaration = new GenerateSalesDeclarationUseCase(
    new XlsxSalesDeclarationWriterAdapter(),
    BOM_SUCESSO_STORE,
  );
  const controller = new SalesDeclarationController(generateSalesDeclaration);
  return { router: controller.router };
}
