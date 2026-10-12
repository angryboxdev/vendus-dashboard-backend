# Relatório — Fase 0: Preparação

## Resumo

Base técnica do Novo RH dentro do Mezza ERP (backend e frontend), na branch
`rh-novo-modelo`:

- CI nos dois repositórios;
- ADRs 0018–0023;
- rastreabilidade de RE-1..36, CF-1..15 e TK-1..19;
- infraestrutura HTTP partilhada: erros RFC 7807, Idempotency-Key, ETag/If-Match, ID de correlação e logs sem dados pessoais;
- gerador de dados sintéticos;
- gerador da matriz papel × endpoint;
- base de i18n pt-PT/es-ES;
- entrada "Novo RH" no menu de RH, só para o Admin e separada do RH atual.

## Critérios de aceitação

| ID | Estado | Teste automatizado (ficheiro::nome) |
|---|---|---|
| TK-1 | parcial | `.github/workflows/ci.yml` (back e front): testes e gitleaks bloqueiam o job. Falta um admin do GitHub marcar `checks` e `secrets` como obrigatórios em `main`. |
| TK-2 | passa | `src/infra/http/__tests__/tk-02-write-integrity.test.ts::TK_2_post_repetido_com_mesma_idempotency_key_devolve_a_mesma_resposta_sem_duplicar`, `::TK_2_if_match_desatualizado_devolve_412` (+3 casos de apoio) |

## Desvios à especificação

| Requisito | Desvio | Motivo | ADR |
|---|---|---|---|
| Repositório novo | Evolui o repositório existente | D1 decidido pelo utilizador | 0018 |
| `tenant_id` | A coluna chama-se `org_id` | Convenção já em produção | 0018, 0020 |
| RLS como fronteira | O isolamento é feito na aplicação (helper de queries por organização) mais RLS por organização nas tabelas novas; o backend ainda liga como service role | Decisão anterior (ADR-0007); a troca de credencial é global | 0020 |
| Ambientes dev/teste/staging | Existem local e produção; staging está documentado (`docs/DEPLOY_STAGING.md`), mas não está criado | Precisa de conta e projeto Supabase/Render (Raul) | — |
| Migrações reversíveis | Supabase só anda para a frente; cada migração nova leva um script de rollback em `docs/migrations/rollback/` | Limitação da ferramenta | 0022 |
| Idempotency store | Fica em memória na Fase 0; a tabela persistente chega com as primeiras escritas do RH | Um reinício perde as chaves; sem escritas novas na Fase 0 | 0022 |
| E2E e testes de integração na CI | Não correm na CI | Precisam de uma BD de teste (stack Supabase na CI) | — |
| SAST e auditoria de dependências | Só relatório | O código legado nunca foi analisado; falta triar | 0022 |
| Gerador sintético: carga na BD | Gera um ficheiro JSON local, sem carregar na BD | As tabelas do modelo novo ainda não existem | 0021 |

## Decisões usadas / pendentes

| ID | Estado | Impacto se continuar pendente |
|---|---|---|
| D1 | Usada: evoluir o Mezza ERP; alojamento na UE. Falta confirmar a região do Supabase. | Bloqueia o go-live com dados reais, não o desenvolvimento |
| D13 | Usada: pt-PT agora, es-ES depois; fusos Europe/Lisbon e Europe/Madrid | — |
| D0 | Decidida 2026-10-11: risco aceite; o jurídico valida antes de qualquer uso comercial (ADR-0024) | Uso comercial bloqueado até validar |
| D2 | Decidida: Supabase Auth + MFA por app (TOTP) para perfis de gestão (ADR-0024) | — |
| D3 | Decidida: pessoal > grupo > departamento > centro > global (ADR-0024) | — |
| Bloqueio da 2.ª organização em produção | Pendente: falta RLS por organização nas tabelas comuns e dados-modelo | A organização de demonstração fica em local/staging |

## Riscos e dívida técnica

- O merge só fica realmente bloqueado depois de ativada a proteção da branch no GitHub.
- O `problemHandler` passa a responder JSON RFC 7807 aos erros não tratados de todas as rotas, em vez da página HTML do Express. As rotas legadas que já tratam os seus erros não mudam.
- O inventário da matriz é estático (lê o código). Se uma rota for montada de forma nova no `server.ts`, é preciso atualizar `mountOf()`.
- O ESLint do frontend tem 50 erros antigos; na CI fica só como relatório.

## Segurança e RGPD

- **Dados pessoais:** nenhum dado pessoal novo é tratado. O gerador produz só dados fictícios (`synthetic: true`, e-mails `.invalid`, sem NIF/NISS/IBAN/morada) e grava em `.demo/`, fora do git.
- **Logs:** a nova função `log()` redige os campos pessoais (teste em `src/infra/http/__tests__/correlation.test.ts`).
- **Endpoints:** nenhum endpoint novo em produção. O endpoint de exemplo do TK-2 existe só no teste.
- **Matriz de autorização:** 460 endpoints, 20 antes da autenticação (quiosque, dispositivos, públicos e cron) e **0 por classificar** (`docs/matriz-autorizacao.md`).
- **Subprocessador fora da UE:** OpenAI, usado só em faturas de fornecedores. Fica registado que não pode receber dados de RH (ADR-0019).

## Pedido de aprovação

Pronto para avançar para a Fase 1? **Sim, com condições:**

1. D0, D2 e D3 decididos;
2. confirmação da região do Supabase;
3. ativação da proteção da branch `main` (TK-1);
4. autorização para fazer commits na branch `rh-novo-modelo`.

**Aprovado pelo utilizador em 2026-10-11** ("vamos pra próxima fase"), com D0, D2 e D3 decididos. Região do Supabase e proteção da branch continuam pendentes (não bloqueiam o desenvolvimento).
