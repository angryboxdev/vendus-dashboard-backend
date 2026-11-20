/** Artigo do guia de ajuda do RH (ADR-0044). */
export interface HelpArticle {
  id: string;
  title: string;
  /** Ecrã onde se faz (rota do frontend), quando há um. */
  path: string | null;
  /** Palavras e expressões que as pessoas usam para perguntar isto. */
  keywords: string[];
  steps: string[];
  /** Notas: regras, validações, permissões. */
  notes?: string[];
}
