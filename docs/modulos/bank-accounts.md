# Módulo: bank-accounts

**Área:** Financeiro · **Estado (README):** ativo (2026-08-28) · **Código:** 20 ficheiros, 6 ficheiros de teste

## Objetivo
O módulo de Bancos e Contas é o pré-requisito para a Conciliação Bancária. Antes de importar extratos, o gestor regista os bancos onde a empresa tem relação e, dentro de cada banco, as contas correntes e cartões de crédito existentes. Este registo permite que o sistema associe automaticamente os extratos importados à conta certa e apresente uma vista organizada por banco → conta → extratos.

## Estado atual
Implementado (README: ativo). Sem trabalho em curso registado.

## Arquitetura
- Código: `src/modules/bank-accounts/` (domain, application, adapters); composição: `bank-accounts.module.ts`; documentação detalhada: `src/modules/bank-accounts/README.md`.
- Endpoints (11, sob `/api`): `DELETE /bank-accounts/:accountId`, `DELETE /bank-accounts/banks/:bankId`, `GET /bank-accounts/:accountId`, `GET /bank-accounts/banks`, `GET /bank-accounts/banks/:bankId`, `GET /bank-accounts/formats`, `GET /bank-accounts/logos`, `PATCH /bank-accounts/:accountId`, `PATCH /bank-accounts/banks/:bankId`, `POST /bank-accounts/banks`, `POST /bank-accounts/banks/:bankId/accounts`.

## Dependências
Sem dependências diretas de outros módulos (integrações via portas no composition root / `src/server.ts`).

## Regras de negócio
Ver «Decisões de design» no README do módulo.

## Problemas conhecidos
Ver «Pontos de atenção» no README do módulo.

## Próximos trabalhos
Nenhum registado.
