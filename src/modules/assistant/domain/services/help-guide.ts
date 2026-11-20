import type { HelpArticle } from "../entities/help-article.js";
import { HELP_ARTICLES } from "./help-articles.js";

export type { HelpArticle };

/**
 * Guia de ajuda do RH (perguntas «como faço…?»). O conteúdo vem dos ecrãs
 * reais (`help-articles.ts`); a IA só pode responder com o que estes artigos
 * dizem — nada de passos inventados. Pesquisa pura, sem IA e sem base de dados.
 */

const STOP = new Set(
  "a o as os um uma uns umas de do da dos das em no na nos nas por para com sem que e ou se como onde quando qual quais posso pode podemos devo faco fazer faz consigo consegue eu me meu minha meus minhas nosso nossa seu sua ao aos ate isto isso esta este estas estes ha tem ter mezza rh".split(" "),
);

const norm = (v: string) =>
  v
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase();

/** Raiz grosseira (plural/género) para «colaboradores» casar com «colaborador». */
const stem = (w: string) => (w.length > 4 ? w.replace(/(oes|aes|ies|es|s)$/, "").replace(/[ao]$/, "") : w);

export function tokens(v: string): string[] {
  return norm(v)
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length > 1 && !STOP.has(w))
    .map(stem);
}

export const MAX_HELP_RESULTS = 3;

/**
 * Artigos mais relevantes para a pergunta. Título e palavras-chave pesam mais
 * do que os passos; sem nenhuma palavra em comum → lista vazia (a IA diz que
 * não tem a resposta, em vez de adivinhar).
 */
export function searchHelp(query: string, articles: HelpArticle[] = HELP_ARTICLES, max = MAX_HELP_RESULTS): HelpArticle[] {
  const q = [...new Set(tokens(query))];
  if (!q.length) return [];
  const scored = articles.map((a) => {
    const title = new Set(tokens(a.title));
    const keys = new Set(a.keywords.flatMap(tokens));
    const body = new Set([...a.steps, ...(a.notes ?? [])].flatMap(tokens));
    const score = q.reduce((n, w) => n + (title.has(w) ? 3 : 0) + (keys.has(w) ? 2 : 0) + (body.has(w) ? 0.5 : 0), 0);
    return { a, score };
  });
  return scored
    .filter((s) => s.score >= 2)
    .sort((x, y) => y.score - x.score)
    .slice(0, max)
    .map((s) => s.a);
}

export function helpArticle(id: string, articles: HelpArticle[] = HELP_ARTICLES): HelpArticle | null {
  return articles.find((a) => a.id === id) ?? null;
}

/** Resultado da ferramenta QUERY_HELP (o que a IA recebe). */
export function queryHelp(question: unknown, articles: HelpArticle[] = HELP_ARTICLES): { articles: HelpArticle[]; message?: string } {
  const q = typeof question === "string" ? question.slice(0, 300) : "";
  const found = searchHelp(q, articles);
  return found.length ? { articles: found } : { articles: [], message: "O guia do RH não tem artigo para isto." };
}
