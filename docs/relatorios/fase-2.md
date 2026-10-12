# Relatório — Fase 2: Pessoas e contratos

## Resumo

O separador **Novo RH → Pessoas** está entregue, sobre a mesma ficha do RH atual (ADR-0025: uma pessoa = uma ficha). Inclui:

- **Ficha do colaborador:** privacidade por campo, âmbitos, motivo obrigatório ao alterar campos sensíveis e fichas antigas assinaladas como "a completar".
- **Contratos** sem sobreposição.
- **Convénios.**
- **Responsáveis e validadores** (até 3 níveis, com datas).
- **Complementos e benefícios**, com a regra de moeda e de período de pagamento.
- **Campos personalizados da empresa.**
- **Transferência de centro** com data de efeito.
- **Desativação** que mantém os dados e revoga as sessões.
- **Importação CSV** com simulação e **exportação** que respeita as permissões de quem exporta.
- **D4:**
  - NIF obrigatório e único;
  - só o mínimo legal é obrigatório;
  - retenção como parâmetro a validar pelo DPO.

## Critérios de aceitação

| ID | Estado | Teste automatizado (ficheiro::nome) |
|---|---|---|
| RE-1 | passa | `src/modules/people/__tests__/use-cases/people.test.ts::RE_1_nome_e_apelido_sao_obrigatorios` |
| RE-2 | passa | `people.test.ts::RE_2_documento_duplicado_e_recusado_com_409` · `people.controller.test.ts` (HTTP 409) |
| RE-3 | passa | `people.test.ts::RE_3_exportacao_nao_inclui_colunas_sem_permissao` · `people.controller.test.ts::RE_3_http_*` |
| RE-4 | passa | `people.test.ts::RE_4_desativacao_revoga_sessoes_e_mantem_os_dados` |
| RE-34 | passa | `people.test.ts::RE_34_fora_do_ambito_nao_aparece_na_pesquisa_nem_se_abre` · `access-governance.test.ts::RE_34_*` |
| CF-2 | passa | `src/modules/org-structure/__tests__/org-structure.test.ts::CF_2_depois_da_transferencia_aplicam_se_as_regras_do_novo_centro_a_partir_da_data_de_efeito` |
| CF-14 | passa | `people.test.ts::CF_14_complemento_numa_moeda_diferente_e_recusado` |
| TK-9 | passa | `people.test.ts::TK_9_contratos_sobrepostos_sao_recusados_com_409` (aplicação + trigger na BD) |
| TK-10 | passa | `org-structure.test.ts::TK_10_transferencia_com_data_de_efeito_nao_altera_os_dias_anteriores` |

Repetidos da DoD:
- **RE-33:** a verificação estrutural cobre agora 20 tabelas do Novo RH (CI). O teste com duas organizações continua por correr, porque precisa do stack local.
- **TK-5:** 529 endpoints, 0 por classificar.

**Totais:**
- Backend: 2728 testes a passar, typecheck sem erros e nenhuma violação de fronteiras entre camadas.
- Frontend: 390 testes a passar e typecheck sem erros.

## Desvios à especificação

| Requisito | Desvio | Motivo | ADR |
|---|---|---|---|
| Tabela `employee` própria | Usa `hr_employees` + tabelas novas | Decisão do utilizador: sem duplicar pessoas | 0025 |
| NIF obrigatório | Só nas escritas do Novo RH; as fichas antigas sem NIF (5) ficam "a completar" | Não partir o RH atual | 0025 |
| "Jornada ≤ máximos legais" no contrato | Não validado | Precisa dos parâmetros legais D6 (Fase 3) | — |
| Exportação assíncrona com link a expirar (12.4) | Síncrona | Volume atual pequeno (9 fichas) | — |
| Contratos versionados | Versão + auditoria antes/depois; anular em vez de apagar | Equivalente, sem tabela de versões | — |
| Vistas de tabela guardadas, colunas configuráveis (2.1) | Não feito | Não é critério da fase | — |
| Centro principal | Só muda por transferência; numa transferência futura, o centro principal só muda quando a data chegar (as regras e os âmbitos já usam a data) | O RH atual lê o centro principal | — |

## Decisões usadas / pendentes

| ID | Estado | Impacto se continuar pendente |
|---|---|---|
| D4 | Usada (ADR-0025). O prazo de retenção continua por definir pelo DPO | Nada é anonimizado automaticamente |
| **D6** (feriados, férias, limites legais) | **Pendente** | **Bloqueia a Fase 3** |
| Região do Supabase; proteção da branch `main` | Pendentes | Dados reais e bloqueio de merge |

## Riscos e dívida técnica

- **Migração `20261013100000` por aplicar**, junto com as 6 da Fase 1 (total: 7). Só acrescenta colunas opcionais e tabelas novas. O índice único do NIF foi verificado em produção (só leitura): não há NIFs repetidos.
- O RH atual continua a poder criar fichas sem NIF. O Novo RH assinala-as para completar.
- Teste de integração RE-33 por correr.

## Segurança e RGPD

- **Novos dados pessoais:**
  - nome e apelido separados, género, e-mail pessoal, morada detalhada;
  - contratos;
  - responsáveis;
  - complementos;
  - campos personalizados (os sensíveis só para quem tem `hr.sensitive_data`).

  Tudo opcional, exceto o mínimo legal.
- **Auditoria:** guarda "[registado]" em vez dos valores de NIF, IBAN, NISS e salário.
- **Novos endpoints:** `/api/novo-rh/people/*` (`hr.employees`), `/api/novo-rh/people/export.csv` (especial `hr.people_export`: Admin e RH), `/api/novo-rh/catalog/*` (`company.structure`) e `/api/novo-rh/structure/transfers`. Todos estão classificados, com âmbito e privacidade aplicados no servidor (fora do âmbito → 404).
- **Exportação:** neutraliza fórmulas e fica auditada (quem, quantas linhas, que colunas).

## Pedido de aprovação

Pronto para avançar para a Fase 3 (Base do tempo: horários e calendários)? **Sim, com condições:**
1. **D6:** decisão sobre os parâmetros legais para PT/ES (descanso, limites de horas, trabalho noturno, dias de férias, feriados por centro) ou autorização para os criar todos sem valor, marcados "a validar".
2. As 7 migrações aplicadas.
3. Verificação rápida no Novo RH: criar uma ficha, tentar um NIF repetido, exportar com o perfil RH sem IBAN e transferir alguém com data futura.
