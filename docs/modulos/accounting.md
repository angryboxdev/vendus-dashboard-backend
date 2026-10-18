# Módulo: accounting

**Área:** Financeiro · **Estado (README):** active · **Código:** 33 ficheiros, 8 ficheiros de teste

## Objetivo
Todos os meses a Angrybox tem de organizar as suas faturas/notas de crédito (já geridas no módulo `invoices`), apurar o IVA do período e enviar tudo ao contabilista. Nem toda a despesa passa pela conta/cartão/caixa da empresa: às vezes um sócio ou funcionário adianta dinheiro do próprio bolso, uma plataforma de delivery desconta uma comissão, ou é preciso lançar uma nota de crédito, um documento manual ou uma regular

## Estado atual
Implementado (README: active). Sem trabalho em curso registado.

## Arquitetura
- Código: `src/modules/accounting/` (domain, application, adapters); composição: `accounting.module.ts`; documentação detalhada: `src/modules/accounting/README.md`.
- Endpoints (11, sob `/api`): `GET /accounting/documents`, `GET /accounting/documents/:id`, `GET /accounting/settings`, `GET /accounting/vat-overview`, `PATCH /accounting/documents/:id`, `PATCH /accounting/settings`, `POST /accounting/documents`, `POST /accounting/documents/:id/attachment`, `POST /accounting/documents/:id/cancel`, `POST /accounting/documents/:id/mark-pendency`, `POST /accounting/documents/:id/validate`.

## Dependências
Importa portas/tipos de: [financial-base](financial-base.md), [invoices](invoices.md), [vendus](vendus.md).

## Regras de negócio
Ver «Decisões de design» no README do módulo.

## Problemas conhecidos
Ver «Pontos de atenção» no README do módulo.

## Próximos trabalhos
Nenhum registado.
