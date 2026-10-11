# Relatório — Fase 1: Fundação (identidade, acessos, organização e motor de configurações)

## Resumo

A base de segurança e o motor de configurações do Novo RH estão feitos, nos
dois repositórios, na branch `rh-novo-modelo`:

- **Motor de configurações** com cascata pessoal > grupo > departamento > centro > global (D3), datas de efeito, alterações retroativas só com permissão própria, dependências entre parâmetros e histórico exportável.
- **Auditoria transversal** append-only, encadeada por hash.
- **Estrutura organizacional:** departamentos, grupos hierárquicos, pertenças com vigência, contactos por função e registo de aceitação de termos/DPA.
- **Acessos:** perfis Geral ou Específico, âmbitos com vigência, privacidade por campo e histórico de papéis exportável.
- **Identidade:** MFA obrigatória (TOTP) para perfis de gestão, revogação imediata de sessões e fim de sessão por inatividade.
- **Notificações** dentro da aplicação.
- **Ecrãs no Novo RH:** Configurações, Estrutura, Acessos e Auditoria (só Admin, com MFA).

Fica visível em **RH → Novo RH**, separado do RH atual.

## Critérios de aceitação

| ID | Estado | Teste automatizado (ficheiro::nome) |
|---|---|---|
| RE-33 | parcial | `src/infra/scoped-db/__tests__/re-33-novo-rh-tenant-structure.test.ts::RE_33_*` (13 tabelas, CI) · `re-33-novo-rh-isolation.integration.test.ts::RE_33_*` (escrito, **não corrido**: precisa do stack Supabase local) |
| CF-1 | passa | `src/modules/settings/__tests__/use-cases/settings.test.ts::CF_1_cascata_global_pessoal_e_volta_ao_global_ao_desativar_a_pessoal` |
| CF-12 | passa | `settings.test.ts::CF_12_historico_com_antes_depois_e_motivo` · `settings.controller.test.ts::CF_12_historico_exportavel_em_csv_com_antes_depois_e_motivo` |
| TK-3 | passa | `src/modules/access/__tests__/domain/tk-03-04-mfa-sessions.test.ts::TK_3_*` · front `MfaGate.test.tsx` |
| TK-4 | passa | `tk-03-04-mfa-sessions.test.ts::TK_4_token_emitido_antes_da_revogacao_deixa_de_valer` · `access-admin.test.ts::TK_4_mudar_o_perfil_ou_desativar_revoga_as_sessoes_abertas` |
| TK-5 | passa | `src/tools/authz-matrix/__tests__/authz-matrix.test.ts::TK_5_*` (500 endpoints, 0 por classificar; bloqueia a CI) |
| TK-6 | passa | `settings.test.ts::TK_6_*` · `settings.controller.test.ts::TK_6_http_*` |
| TK-7 | passa | `settings.test.ts::TK_7_*` · `settings.controller.test.ts::TK_7_http_dependencia_em_falta_devolve_422_rule_violation` |
| TK-8 | passa | `settings.test.ts::TK_8_colaborador_em_dois_segmentos_recebe_sempre_o_mesmo_valor_pela_ordem_D3` |

Antecipado da Fase 2 (parcial): RE-34, âmbitos e verificação (`access-governance.test.ts::RE_34_*`).

**Totais:**
- Backend: 2703 testes a passar. A verificação de tipos e a de fronteiras entre camadas (dependency-cruiser) passam.
- Frontend: 386 testes a passar. A verificação de tipos passa.

## Desvios à especificação

| Requisito | Desvio | Motivo | ADR |
|---|---|---|---|
| OIDC | Supabase Auth (compatível com OIDC); sem fornecedor de identidade corporativo | D2 | 0024 |
| MFA para "papéis administrativos" | Exigida a qualquer perfil com permissão de gerir, nas rotas do Novo RH (`MFA_ENFORCEMENT=novo-rh`). `all` fica para depois de todos ativarem a app | Ligar a todo o ERP de uma vez bloquearia quem ainda não tem a app | 0024 |
| `tenant` / `legal_entity` | Uma entidade legal por organização (a própria `organizations`) | Angry Box tem uma; várias entidades fora da Fase 1 | 0018 |
| Inatividade (12.5) | Aplicada no frontend; só na área de gestão (o Portal fica de fora) | No Portal, o colaborador pica o ponto; voltar a entrar sempre seria um entrave | — |
| Outbox transacional (§4.2) | A auditoria e as notificações gravam depois da escrita, não na mesma transação | O Supabase REST não junta escritas numa transação; precisa de funções na BD | 0022 |
| Reautenticação em ações críticas; bloqueio progressivo (§4.2) | Não feito | Não é critério da Fase 1. O Supabase Auth tem limites de tentativas, ainda por configurar | — |
| Notificações | Só dentro da aplicação; e-mail/push depois | D12 (Fase 9) | — |
| Privacidade por campo | Modelo, regras e API feitos; aplicada aos dados do colaborador na Fase 2 | As fichas do Novo RH chegam na Fase 2 | — |
| `resolved_setting_snapshot` | Não feito | Só faz sentido com o apuramento diário (Fase 4, TK-13) | — |
| Pertença a grupos | Só direta: o subgrupo não herda o grupo-pai | Opção mais restritiva; rever com RH | — |

## Decisões usadas / pendentes

| ID | Estado | Impacto se continuar pendente |
|---|---|---|
| D0 | Usada: risco aceite, o jurídico valida antes do uso comercial | Uso comercial bloqueado |
| D2 | Usada: Supabase Auth + TOTP | — |
| D3 | Usada: pessoal > grupo > departamento > centro > global | — |
| **D4** | **Pendente** (retenção, base legal, campos obrigatórios, n.º de identificação único) | **Bloqueia a Fase 2** |
| Região do Supabase (ADR-0019) | Pendente | Bloqueia os dados reais |
| Proteção da branch `main` (TK-1) | Pendente (admin do GitHub) | Sem ela, o merge não fica realmente bloqueado |
| Valor de inatividade (30 min) | `a_validar` | Valor por defeito até RH confirmar |

## Riscos e dívida técnica

- **Migrações (6) por aplicar em produção:**
  1. `20261012100000` — configurações e idempotência;
  2. `20261012110000` — auditoria;
  3. `20261012120000` — estrutura;
  4. `20261012130000` — revogação de sessões;
  5. `20261012140000` — âmbitos e privacidade;
  6. `20261012150000` — notificações.

  O pre-deploy do Render aplica-as antes de arrancar. **A `20261012130000` tem de estar aplicada antes de o backend novo arrancar**: ele lê `org_members.sessions_revoked_at` em cada pedido. Atenção: o backend local usa a BD de produção.
- **MFA TOTP** tem de estar ativa no projeto Supabase (Authentication → MFA). Sem isso, o Novo RH não abre para ninguém, porque as rotas exigem `aal2`. Saída de emergência: `MFA_ENFORCEMENT=off` no Render.
- O teste RE-33 com duas organizações ainda não correu (falta o stack local).
- O tratamento global de erros mudou na Fase 0 (respostas RFC 7807). Os ecrãs antigos leem `error`, que se mantém.

## Segurança e RGPD

- **Novos dados pessoais:**
  - contactos por função (nome, e-mail, telefone);
  - IP e dispositivo na auditoria e na aceitação de termos;
  - autor (e-mail) nas configurações, notificações e auditoria.

  Ficam todos dentro da organização, com RLS. A retenção depende de D4.
- **Novos endpoints:**
  - `/api/novo-rh/settings/*`, `/api/novo-rh/audit/*`, `/api/novo-rh/structure/*`;
  - `/api/me/notifications*`, `/api/me/session-policy`;
  - `/api/access-profiles/{history,history.csv,field-catalog,:id/governance,:id/scope-kind,:id/field-privacy}`;
  - `/api/users/:id/scopes*`.

  Todos estão classificados. Escritas com Idempotency-Key, alterações com If-Match e erros RFC 7807.
- **Matriz de autorização:** 500 endpoints, 0 por classificar. Configurações, auditoria e acessos: só o Admin. Estrutura: os perfis de gestão veem, só o Admin gere. `/api/me/*`: todos.
- **Logs:** nenhum dado pessoal (redação automática, Fase 0). As exportações CSV neutralizam fórmulas.

## Pedido de aprovação

Pronto para avançar para a Fase 2 (Pessoas e contratos)? **Sim, com condições:**
1. **D4 decidida** pelo DPO e por RH (bloqueia a Fase 2);
2. as 6 migrações aplicadas, com MFA TOTP ativa no Supabase;
3. teste com dois utilizadores no Novo RH: ativar a MFA, mudar um perfil (a sessão aberta deve terminar) e fazer uma alteração retroativa (os Admins devem receber a notificação).
