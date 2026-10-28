/** Texto de um ficheiro enviado (PDF → camada de texto; CSV/texto → conteúdo). null se não houver texto. */
export interface DocumentTextPort {
  extract(fileName: string, content: Uint8Array): Promise<string | null>;
}
