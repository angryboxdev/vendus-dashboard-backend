import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Vetores oficiais da AT (Portal das Finanças › Certificação de Software de
 * Faturação): SAF-T de demonstração `saft_idemo599999999.xml` (empresa fictícia
 * 599999999) e o par de chaves de exemplo `Chave_Publica.txt` /
 * `Chave_Privada.txt`. A chave privada é a de exemplo publicada pela AT para
 * testes — não é segredo nem é a chave do Mezza.
 */
const dir = __dirname;

export const atPublicKeyPem = readFileSync(join(dir, "Chave_Publica.txt"), "utf8");
export const atPrivateKeyPem = readFileSync(join(dir, "Chave_Privada.txt"), "utf8");

export interface DemoSignedDocument {
  number: string;
  date: string;
  systemEntryDate: string;
  grossTotal: string;
  hash: string;
}

const tag = (block: string, name: string): string => {
  const m = new RegExp(`<${name}>([^<]*)</${name}>`).exec(block);
  if (!m) throw new Error(`Falta <${name}> no SAF-T de demonstração`);
  return m[1]!;
};

/** Faturas, documentos de conferência e guias, pela ordem do ficheiro. */
export function demoSignedDocuments(): DemoSignedDocument[] {
  const xml = readFileSync(join(dir, "saft_idemo599999999.xml"), "latin1");
  const blocks = xml.match(/<(Invoice|WorkDocument|StockMovement)>[\s\S]*?<\/\1>/g) ?? [];
  return blocks.map((b) => {
    const kind = /^<(\w+)>/.exec(b)![1];
    return {
      number: kind === "Invoice" ? tag(b, "InvoiceNo") : tag(b, "DocumentNumber"),
      date: tag(b, kind === "Invoice" ? "InvoiceDate" : kind === "WorkDocument" ? "WorkDate" : "MovementDate"),
      systemEntryDate: tag(b, "SystemEntryDate"),
      grossTotal: tag(b, "GrossTotal"),
      hash: tag(b, "Hash"),
    };
  });
}
