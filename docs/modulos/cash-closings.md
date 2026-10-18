# Módulo: cash-closings

**Área:** Financeiro · **Estado (README):** ativo (2026-09-04) · **Código:** 32 ficheiros, 15 ficheiros de teste

## Objetivo
No final de cada turno, o funcionário responsável pela caixa precisa de prestar contas do dinheiro e das vendas do dia. Este módulo é o sistema que suporta todo esse processo — desde o momento em que o funcionário introduz o PIN no kiosk até ao momento em que o manager aprova ou rejeita o fecho no backoffice.

## Estado atual
Implementado (README: ativo). Sem trabalho em curso registado.

## Arquitetura
- Código: `src/modules/cash-closings/` (domain, application, adapters); composição: `cash-closings.module.ts`; documentação detalhada: `src/modules/cash-closings/README.md`.
- Sem rotas HTTP próprias declaradas (exposto via outro módulo, cron ou portas internas).

## Dependências
Importa portas/tipos de: [air-menu](air-menu.md), [vendus](vendus.md).

## Regras de negócio
Ver «Decisões de design» no README do módulo.

## Problemas conhecidos
Ver «Pontos de atenção» no README do módulo.

## Próximos trabalhos
Nenhum registado.
