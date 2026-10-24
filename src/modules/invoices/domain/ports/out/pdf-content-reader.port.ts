import type { PdfContent } from "../../entities/invoice-reading.js";
import type { BarcodeState } from "../../entities/payment-document.js";

/** Texto nativo com posições + QR descodificados localmente (sem IA). null quando o ficheiro não é um PDF legível. */
export interface PdfContentReaderPort {
  read(fileBuffer: Buffer, mimeType: string): Promise<PdfContent | null>;
  /**
   * Códigos de barras 1D (CODE128), só quando pedidos: rasteriza pontualmente as
   * primeiras páginas em resolução progressiva. Nada sai do servidor.
   */
  readBarcode(fileBuffer: Buffer, maxPages: number): Promise<BarcodeState>;
  /**
   * Logótipo provável do emitente: imagem incorporada no topo da 1.ª página (não QR, nem fundo de
   * página), em PNG reduzido. null quando não há candidato claro.
   */
  extractLogo(fileBuffer: Buffer): Promise<{ png: Buffer; width: number; height: number } | null>;
}
