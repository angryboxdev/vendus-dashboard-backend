# Novo RH — resumo final (Fases 0–9)

Estado a 2026-10-12. Ramo `rh-novo-modelo` nos dois repositórios, com
commits locais e **sem push**. O Novo RH vive em `/hr/novo` (só Admin, com
MFA) e não mexe no RH atual.

## O que existe

| Fase | Separador / módulo | Relatório |
|---|---|---|
| 0 | Base: CI, RFC 7807, idempotência, ETag, correlação, matriz de autorização, i18n | `fase-0.md` |
| 1 | Configurações (cascata, data de efeito), Auditoria, Estrutura, Acessos (âmbitos, privacidade por campo, MFA, revogação de sessões), Notificações | `fase-1.md` |
| 2 | Pessoas e contratos | `fase-2.md` |
| 3 | Tempo: horários versionados, feriados, férias, atribuições, tempo teórico | `fase-3.md` |
| 4 | Assiduidade: marcações (offline), motor diário, correções, incidentes | `fase-4.md` |
| 5 | Ausências: tipos, pedidos, aprovação multinível, saldos em ledger | `fase-5.md` |
| 6 | Banco de horas em ledger | `fase-6.md` |
| 7 | Escalas: versões publicadas, restrições, trocas | `fase-7.md` |
| 8 | Fecho de período, reabertura com dupla aprovação, exportações | `fase-8.md` |
| 9 | Comunicados, Alertas, Tarefas/Solicitações/Quem está, Relatórios | `fase-9.md` |

Rastreabilidade: `docs/rastreabilidade.md`. Todos os requisitos estão
**feitos**, exceto dois parciais que dependem de algo fora do código
(ver abaixo). Decisões: ADR-0018 a ADR-0033.

## Antes de pôr em produção

1. **Ativar o MFA TOTP no Supabase Auth.** Sem ele, o Novo RH fica
   bloqueado. Saída de emergência: `MFA_ENFORCEMENT=off`.
2. **Aplicar as 14 migrações por esta ordem** (cada uma tem rollback em
   `docs/migrations/rollback/`). A `20261012130000` tem de ir **antes** do
   deploy do backend, porque o backend lê `org_members.sessions_revoked_at`
   em todos os pedidos.

   ```
   20261012100000_novo_rh_settings_engine.sql
   20261012110000_novo_rh_audit_events.sql
   20261012120000_novo_rh_org_structure.sql
   20261012130000_novo_rh_sessions_revocation.sql
   20261012140000_novo_rh_access_scopes.sql
   20261012150000_novo_rh_notifications.sql
   20261013100000_novo_rh_people.sql
   20261014100000_novo_rh_time_base.sql
   20261015100000_novo_rh_attendance.sql
   20261016100000_novo_rh_absences.sql
   20261017100000_novo_rh_time_bank.sql
   20261018100000_novo_rh_rosters.sql
   20261019100000_novo_rh_pay_periods.sql
   20261020100000_novo_rh_communication.sql
   ```

3. Fazer o deploy do backend e depois do frontend. O backend local usa a
   base de dados de produção: não o reiniciar antes das migrações.
4. Validar em staging o que precisa de Docker e não foi possível correr
   neste PC: os triggers append-only e o teste de isolamento com 2
   organizações (RE-33).

## Decisões que dependem de pessoas

| ID | Quem | O que falta |
|---|---|---|
| D0 | Direção | Validar antes do uso comercial (risco aceite para desenvolvimento) |
| D4 | DPO | Prazo de retenção depois da saída (hoje 0 = desligado) |
| D6 | RH / jurídico | Valores legais: descanso, máximos, noturno, mínimo de férias (hoje sem valor — as regras não se aplicam) |
| D7 | DPO | DPIA para geolocalização (hoje desligada) |
| D8 | RH | Confirmar "horas de incidentes pendentes até validação" |
| D9 | RH | Pessoas de recurso por fluxo (hoje: administradores) |
| D10 | Contabilidade / Direção | Layout do processador de salários; aprovar ou não o modelo cliente/obra (ADR-0032, **proposto, não criado**) |
| D11 | RH / jurídico | Limite anual de horas pagas e validade do banco (hoje sem limite e sem expiração) |
| D12 | Direção / DPO | Canais de notificação externos (hoje só na aplicação) |
| TK-11 | RH | Aprovar os casos de teste do tempo teórico |
| TK-1 | Admin do GitHub | Tornar o job de CI obrigatório no merge |
| Segunda organização | — | O RLS por claim da organização nas tabelas comuns e os dados-modelo continuam por fechar: a organização de demonstração só serve em local/staging (ADR-0020/0021) |

## Dívida conhecida (resumo)

- Sem agendador para o Novo RH: alertas e expiração do banco são
  avaliados ao consultar ou a pedido.
- Fecho de período e relatórios calculam no momento do pedido; para
  centenas de colaboradores, passar a tarefas em fila.
- O Portal do Colaborador continua no RH atual. "O meu ponto", "As minhas
  ausências" e "O meu horário" do Novo RH são para teste até o Novo RH
  passar a principal.
- es-ES: só os textos base estão traduzidos (o resto cai em pt-PT).
