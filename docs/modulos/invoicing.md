# Módulo: invoicing

**Área:** Vendas (faturação certificada AT) · **Estado (README):** active, em construção · **Código:** `src/modules/invoicing/`

## Objetivo
Motor de faturação do Mezza para certificação pela AT: documentos assinados (RSA-SHA1), numerados por série, com ATCUD, QR e SAF-T. Isolado: não toca em Vendus, AirMenu, DRE, custos nem stock.

## Estado atual
F1 feita (2026-11-03, ramo `faturacao-certificada`): domínio fiscal puro + assinador RSA + relógio, validados com os vetores oficiais da AT (cadeia de 36 documentos, hash do 1.º documento, 4 exemplos do QR). Sem rotas, sem BD, fora do `server.ts`.

## Arquitetura
- Código: `src/modules/invoicing/`; composição: `invoicing.module.ts`; documentação detalhada: `src/modules/invoicing/README.md`.
- Spec, pesquisa e fases: `.scratch/certificacao-at/`.

## Dependências
Só `src/kernel/money`. Nenhum outro módulo.

## Regras de negócio
Ver «Design decisions» no README do módulo.

## Problemas conhecidos
Ver «Known gaps» no README do módulo.

## Próximos trabalhos
F2 — persistência imutável e emissão compare-and-swap (`.scratch/certificacao-at/issues/02-persistencia-imutavel.md`).
