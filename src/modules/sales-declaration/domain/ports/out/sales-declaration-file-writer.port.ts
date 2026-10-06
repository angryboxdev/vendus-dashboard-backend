import type { SalesDeclarationRow, SalesDeclarationStore } from "../../entities/sales-declaration.js";

/** Serializa as linhas no formato de ficheiro pedido pelo centro comercial. */
export interface SalesDeclarationFileWriterPort {
  write(store: SalesDeclarationStore, rows: SalesDeclarationRow[]): Buffer;
}
