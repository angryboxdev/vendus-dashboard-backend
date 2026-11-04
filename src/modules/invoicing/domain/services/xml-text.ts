/**
 * Texto XML para os ficheiros e mensagens da AT (SAF-T, e-Fatura, Séries).
 * Puro; sem biblioteca de XML — as estruturas são fixas e conhecidas.
 */

/** Caracteres de controlo que o XML 1.0 não admite (a emissão já os recusa; defesa extra). */
// eslint-disable-next-line no-control-regex
const XML_INVALID = /[\u0000-\u0008\u000B\u000C\u000E-\u001F￾￿]/g;

export const esc = (v: string) =>
  v.replace(XML_INVALID, "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");

/** `<prefix:name>valor</prefix:name>` com o valor escapado. */
export const el = (name: string, value: string) => `<${name}>${esc(value)}</${name}>`;
export const wrap = (name: string, inner: string) => `<${name}>${inner}</${name}>`;

/** Texto cortado ao máximo do esquema, sem partir carateres compostos. */
export const fit = (v: string, max: number) => [...v].slice(0, max).join("");

const unescape = (v: string) =>
  v.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, "&");

/** Conteúdo de texto do primeiro elemento com este nome local (qualquer prefixo), ou null. */
export function tagText(xml: string, localName: string): string | null {
  const m = new RegExp(`<(?:[\\w.-]+:)?${localName}(?:\\s[^>]*)?>([^<]*)</(?:[\\w.-]+:)?${localName}>`).exec(xml);
  return m ? unescape(m[1]!.trim()) : null;
}

/** Conteúdo (XML interior) de cada elemento com este nome local. */
export function tagBlocks(xml: string, localName: string): string[] {
  const re = new RegExp(`<(?:[\\w.-]+:)?${localName}(?:\\s[^>]*)?>([\\s\\S]*?)</(?:[\\w.-]+:)?${localName}>`, "g");
  return [...xml.matchAll(re)].map((m) => m[1]!);
}
