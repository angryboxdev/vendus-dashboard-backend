# Módulo: hr

**Área:** RH (Base Organizacional / RH antigo) · **Estado (README):** active · **Código:** 181 ficheiros, 82 ficheiros de teste

## Objetivo
Módulo Pessoas & Documentos (RH-02) + Visão Geral operacional (RH-01) + Escalas & Turnos (RH-03). Trata o cadastro de colaboradores e o dossiê documental de cada um como a fonte operacional de RH — substitui a antiga entrada "Funcionários" por uma vista com sinais de completude de perfil e situação documental (o sinal de onboarding foi removido na Base Organizacional — ver Design decisions), mais um perfi

## Estado atual
Implementado — «RH antigo» (Pessoas & Documentos, Visão Geral, Escalas & Turnos). Mantido acessível no menu a pedido do utilizador; o Novo RH evolui nos módulos próprios.

## Arquitetura
- Código: `src/modules/hr/` (domain, application, adapters); composição: `hr.module.ts`; documentação detalhada: `src/modules/hr/README.md`.
- Endpoints (97, sob `/api`): `DELETE /hr/people/:id/documents/:docId`, `DELETE /hr/people/:id/portal-access`, `DELETE /hr/schedules/rotations/:id`, `DELETE /hr/schedules/work-shifts/:id`, `GET /hr/attendance/closure`, `GET /hr/attendance/employee/:employeeId`, `GET /hr/attendance/issues`, `GET /hr/attendance/issues/detail`, `GET /hr/attendance/rules`, `GET /hr/attendance/rules/history`, `GET /hr/attendance/summary`, `GET /hr/document-overview`, `GET /hr/leave/balances`, `GET /hr/leave/board`, … — lista completa e permissões em `docs/matriz-autorizacao.md`.

## Dependências
Importa portas/tipos de: [access](access.md), [documents](documents.md), [locations](locations.md).

## Regras de negócio
- Não estender o padrão antigo do RH para funcionalidades do Novo RH (ADR-0018/0025).

## Problemas conhecidos
Ver «Pontos de atenção» no README do módulo.

## Próximos trabalhos
Nenhum registado.
