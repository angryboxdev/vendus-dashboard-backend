# Módulo: attendance

**Área:** Novo RH · **Estado (README):** active · **Código:** 15 ficheiros, 3 ficheiros de teste

## Objetivo
Novo RH → Assiduidade: o colaborador pica no Portal (entrada, pausa, remoto, saída), mesmo sem rede (a marcação fica em fila e é enviada depois, sem duplicar). O motor apura cada dia: horas trabalhadas, pausas, noturno, teórico, excedente e horas pendentes. A gestão corrige com motivo, decide pedidos de correção e resolve incidentes (falta, saída esquecida, atraso).

## Estado atual
Implementado (README: active). Faz parte do Novo RH (fases 0–9 em produção desde 2026-10-12). **Conferência V2** (ADR-0043, 2026-10-29, ramo `rh`, por publicar, com migração `20261212100000`): decisão de conferência por dia aplicada pelo motor; rotas `/conference*`. Decisões humanas pendentes D0–D12: `docs/relatorios/novo-rh-resumo-final.md`.

## Arquitetura
- Código: `src/modules/attendance/` (domain, application, adapters); composição: `attendance.module.ts`; documentação detalhada: `src/modules/attendance/README.md`.
- Endpoints: 26 rotas (prefixo definido no controller) — lista e permissões em `docs/matriz-autorizacao.md`.

## Dependências
Sem dependências diretas de outros módulos (integrações via portas no composition root / `src/server.ts`).

## Regras de negócio
Ver «Decisões de design» no README do módulo.

## Problemas conhecidos
Ver «Pontos de atenção» no README do módulo.

## Próximos trabalhos
Nenhum registado.
