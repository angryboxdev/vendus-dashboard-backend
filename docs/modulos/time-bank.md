# Módulo: time-bank

**Área:** Novo RH · **Estado (README):** active · **Código:** 9 ficheiros, 2 ficheiros de teste

## Objetivo
Novo RH → Banco de horas: o excedente e o défice de cada dia fechado vão para um saldo que se pode compensar em descanso ou pago. Cada mexida é um movimento novo — o histórico nunca muda; uma correção de um dia antigo entra como ajuste com a data de hoje.

## Estado atual
Implementado (README: active). Faz parte do Novo RH (fases 0–9 em produção desde 2026-10-12). Decisões humanas pendentes D0–D12: `docs/relatorios/novo-rh-resumo-final.md`.

## Arquitetura
- Código: `src/modules/time-bank/` (domain, application, adapters); composição: `time-bank.module.ts`; documentação detalhada: `src/modules/time-bank/README.md`.
- Endpoints: 12 rotas (prefixo definido no controller) — lista e permissões em `docs/matriz-autorizacao.md`.

## Dependências
Sem dependências diretas de outros módulos (integrações via portas no composition root / `src/server.ts`).

## Regras de negócio
Ver «Decisões de design» no README do módulo.

## Problemas conhecidos
Ver «Pontos de atenção» no README do módulo.

## Próximos trabalhos
Nenhum registado.
