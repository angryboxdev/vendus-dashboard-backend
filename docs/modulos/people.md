# Módulo: people

**Área:** Novo RH · **Estado (README):** active · **Código:** 12 ficheiros, 3 ficheiros de teste

## Objetivo
Novo RH → Pessoas: a ficha de cada colaborador (dados pessoais e de trabalho), contratos com vigência, responsáveis e validadores, complementos e benefícios, campos personalizados da empresa, desativação, importação e exportação. Cada pessoa vê só os campos que o seu perfil permite e só os colaboradores do seu âmbito.

## Estado atual
Implementado (README: active). Faz parte do Novo RH (fases 0–9 em produção desde 2026-10-12). Decisões humanas pendentes D0–D12: `docs/relatorios/novo-rh-resumo-final.md`.

## Arquitetura
- Código: `src/modules/people/` (domain, application, adapters); composição: `people.module.ts`; documentação detalhada: `src/modules/people/README.md`.
- Endpoints: 29 rotas (prefixo definido no controller) — lista e permissões em `docs/matriz-autorizacao.md`.

## Dependências
Sem dependências diretas de outros módulos (integrações via portas no composition root / `src/server.ts`).

## Regras de negócio
Ver «Decisões de design» no README do módulo.

## Problemas conhecidos
Ver «Pontos de atenção» no README do módulo.

## Próximos trabalhos
Nenhum registado.
