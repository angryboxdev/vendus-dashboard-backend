# Módulo: invoicing

**Área:** Vendas (faturação certificada AT) · **Estado (README):** active, em construção · **Código:** `src/modules/invoicing/`

## Objetivo
Motor de faturação do Mezza para certificação pela AT: documentos assinados (RSA-SHA1), numerados por série, com ATCUD, QR e SAF-T. Isolado: não toca em Vendus, AirMenu, DRE, custos nem stock.

## Estado atual
F1 feita (2026-11-03, ramo `faturacao-certificada`): domínio fiscal puro + assinador RSA + relógio, validados com os vetores oficiais da AT (cadeia de 36 documentos, hash do 1.º documento, 4 exemplos do QR). **F2 feita** (2026-11-03): migração `20261220100000_invoicing_certified_documents` (+ rollback; **não aplicada**) com séries, documentos, linhas, impostos e eventos imutáveis por trigger; RPC de emissão com compare-and-swap e de anulação; adapter `SupabaseInvoicingStore`. **F3 feita** (2026-11-03): casos de uso (emitir FT/FS/FR/NC/ND/CM, séries, 2.ª via, anulação, configuração), API `/api/invoicing` (permissão nova `sales.invoicing`, só Admin por omissão; emissão com `Idempotency-Key` obrigatório), taxas e menções oficiais, ligação no `server.ts`. Migração `20261220110000_invoicing_access` (+ rollback; não aplicada).

**F4 e F5 em produção** (modo formação): área «Vendas» no frontend e SAF-T (PT) 1.04_01 (#181/#154, #182/#155). **F6 feita no ramo** (2026-11-04, por publicar): comunicação à AT por webservice no ambiente de testes — e-Fatura (registo e mudança de estado, outbox derivada do registo de envios, cron de 10 min, prazo do dia 5) e séries (registar/finalizar/anular com credenciais WSE no momento); migração `20261220120000_invoicing_at_communication` (+ rollback; não aplicada); aba «Comunicação AT» no frontend. Falta o teste real: certificado de testes e chave pública da AT.

## Arquitetura
- Código: `src/modules/invoicing/`; composição: `invoicing.module.ts`; documentação detalhada: `src/modules/invoicing/README.md`.
- Spec, pesquisa e fases: `.scratch/certificacao-at/`.

## Dependências
`src/kernel` e `src/infra` (scoped-db, http: idempotência e Problem Details); o emitente vem de `legal-entities` por porta (server.ts). Nenhum canal de vendas.

## Regras de negócio
Ver «Design decisions» no README do módulo.

## Problemas conhecidos
Ver «Known gaps» no README do módulo.

## Próximos trabalhos
Pedir à AT o certificado de testes e a chave pública (`asi-cd@at.gov.pt`), configurar `INVOICING_AT_*` e testar F6 contra a AT; depois F7 — dossiê de certificação e Modelo 24 (`.scratch/certificacao-at/issues/07-dossie-certificacao.md`). Frontend: módulo `invoicing` (`/vendas`) no repositório do frontend.
