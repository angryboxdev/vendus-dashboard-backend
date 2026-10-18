# Módulo: payable-entries

**Área:** Financeiro · **Estado (README):** ativo (2026-08-28) · **Código:** 20 ficheiros, 11 ficheiros de teste

## Objetivo
Todos os meses a Angrybox tem despesas a pagar — electricidade, internet, fornecedores de ingredientes, plataformas, rendas. Sem um sistema centralizado, o manager não sabe ao certo o que falta pagar, o que já foi pago nem o que está em atraso. Este módulo é a lista de contas a pagar do negócio. Regista cada despesa pendente, acompanha o seu vencimento e marca-a como paga quando o pagamento é efectuado. O probl

## Estado atual
Implementado.

**Funcionalidades relevantes** (`[ramo financeiro]` = commits locais/ramo não integrado em `main`):
- Contas a pagar (pending/paid/overdue/cancelled), resumo e calendário.
- F1: índice único parcial «uma obrigação ativa por fatura» (migração 20261030130000) — só criado se não havia duplicados históricos.

## Arquitetura
- Código: `src/modules/payable-entries/` (domain, application, adapters); composição: `payable-entries.module.ts`; documentação detalhada: `src/modules/payable-entries/README.md`.
- Endpoints (9, sob `/api`): `DELETE /payable-entries/:id`, `GET /payable-entries`, `GET /payable-entries/:id`, `GET /payable-entries/calendar`, `GET /payable-entries/summary`, `PATCH /payable-entries/:id`, `PATCH /payable-entries/:id/cancel`, `PATCH /payable-entries/:id/paid`, `POST /payable-entries`.

## Dependências
Sem dependências diretas de outros módulos (integrações via portas no composition root / `src/server.ts`).

## Regras de negócio
- Pagamentos reconhecidos vêm das alocações bancárias (`bank_movement_entity_links`).

## Problemas conhecidos
- Não verificado se o índice único foi criado em produção (ver relatório `GET /api/invoices/integrity/payable-duplicates`).
- `/payable-entries/summary` soma o valor total, não o saldo aberto (o resumo novo das Faturas usa o saldo).

## Próximos trabalhos
Nenhum registado.
