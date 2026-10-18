# Módulo: settings

**Área:** Plataforma · **Estado (README):** active · **Código:** 12 ficheiros, 2 ficheiros de teste

## Objetivo
O motor de configurações do Novo RH: as regras (tolerância de entrada, saída automática, fim de sessão…) definem-se uma vez para toda a empresa e podem ter exceções por centro, departamento, grupo ou colaborador, sempre com data de efeito e motivo, e com histórico de quem mudou o quê.

## Estado atual
Implementado (README: active). Sem trabalho em curso registado.

## Arquitetura
- Código: `src/modules/settings/` (domain, application, adapters); composição: `settings.module.ts`; documentação detalhada: `src/modules/settings/README.md`.
- Endpoints: 11 rotas (prefixo definido no controller) — lista e permissões em `docs/matriz-autorizacao.md`.

## Dependências
Sem dependências diretas de outros módulos (integrações via portas no composition root / `src/server.ts`).

## Regras de negócio
Ver «Decisões de design» no README do módulo.

## Problemas conhecidos
Ver «Pontos de atenção» no README do módulo.

## Próximos trabalhos
Nenhum registado.
