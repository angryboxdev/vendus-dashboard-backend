# Módulo: org-structure

**Área:** Novo RH · **Estado (README):** active · **Código:** 7 ficheiros, 1 ficheiros de teste

## Objetivo
A estrutura da empresa no Novo RH para além dos locais: departamentos, grupos (com subgrupos), a que departamentos/grupos cada colaborador pertence e desde quando, os contactos por função da empresa e o registo de aceitação dos termos e do DPA.

## Estado atual
Implementado (README: active). Faz parte do Novo RH (fases 0–9 em produção desde 2026-10-12). Decisões humanas pendentes D0–D12: `docs/relatorios/novo-rh-resumo-final.md`.

## Arquitetura
- Código: `src/modules/org-structure/` (domain, application, adapters); composição: `org-structure.module.ts`; documentação detalhada: `src/modules/org-structure/README.md`.
- Endpoints: 14 rotas (prefixo definido no controller) — lista e permissões em `docs/matriz-autorizacao.md`.

## Dependências
Sem dependências diretas de outros módulos (integrações via portas no composition root / `src/server.ts`).

## Regras de negócio
Ver «Decisões de design» no README do módulo.

## Problemas conhecidos
Ver «Pontos de atenção» no README do módulo.

## Próximos trabalhos
Nenhum registado.
