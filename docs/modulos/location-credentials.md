# Módulo: location-credentials

**Área:** Plataforma · **Estado (README):** active · **Código:** 17 ficheiros, 8 ficheiros de teste

## Objetivo
Three physical screens — the kiosk, the till-closing screen and the kitchen display (KDS) — sit in a restaurant with no way to prove which organization or which store ("Location") they belong to. Today they all trust one hardcoded constant (`UNATTENDED_SCOPE`). That's safe only while a single organization exists: the moment a second one is provisioned, every unpaired screen in existence — old tenant's and new tenant'

## Estado atual
Implementado (README: active). Sem trabalho em curso registado.

## Arquitetura
- Código: `src/modules/location-credentials/` (domain, application, adapters); composição: `location-credentials.module.ts`; documentação detalhada: `src/modules/location-credentials/README.md`.
- Sem rotas HTTP próprias declaradas (exposto via outro módulo, cron ou portas internas).

## Dependências
Importa portas/tipos de: [locations](locations.md).

## Regras de negócio
Ver «Decisões de design» no README do módulo.

## Problemas conhecidos
Ver «Pontos de atenção» no README do módulo.

## Próximos trabalhos
Nenhum registado.
