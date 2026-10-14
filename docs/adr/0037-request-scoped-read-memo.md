# Memo de leituras por pedido HTTP (perf da Visão geral)

Decidido em 2026-10-14 (Task "Otimização de performance da Visão geral";
o utilizador pediu para seguir as opções recomendadas).

## Contexto

Medido antes de otimizar, com um Supabase falso que conta pedidos
(40 colaboradores, 25 ms por ida à base): o snapshot do Dashboard demorava
15,1 s e a fonte "pedidos" era cortada pelo orçamento ("não puderam ser
contados"), com ~4 700 pedidos à base. Sem latência e com mais trabalho a
terminar, 13 349 pedidos. Causa: dentro do mesmo GET, as mesmas leituras
repetiam-se centenas de vezes — estrutura do colaborador
(`hr_employees`, `hr_employee_locations`, `employee_org_assignments`,
`org_departments`, `org_groups`: ~1 880× cada) e configurações
(`setting_profiles`, `setting_profile_targets`, `setting_values`: ~1 000×),
porque cada dia de cada pessoa resolve as regras de novo. A fonte
"Excedente de horas" da Caixa de pedidos ainda percorria a equipa em série.

## Decisões

- **Memo por pedido no `fetch` do cliente Supabase**
  (`src/infra/scoped-db/request-memo.ts`), ativo só em pedidos GET
  (`runWithRequestMemo`, `AsyncLocalStorage`). Leituras idênticas ao
  PostgREST (mesmo URL e cabeçalhos) vão uma vez à base; leituras em paralelo
  partilham a mesma ida. Uma escrita a uma tabela apaga o memo dessa tabela;
  erros não ficam guardados; RPC nunca é memorizado; cada entrada vale no
  máximo 30 s (trabalho em segundo plano depois da resposta não usa dados
  velhos). Fora de um contexto o comportamento é o de sempre.
- **Porque não cache entre pedidos**: dados de outro pedido exigiriam
  invalidação em todos os módulos que escrevem regras/estrutura; o memo por
  pedido não muda o que cada pedido vê (lê o estado da base no momento).
- **Porque no `fetch` e não em cada repositório**: um só ponto, sem tocar em
  domínio nem casos de uso, e cobre todas as leituras repetidas (incluindo as
  de módulos que ainda não foram medidos).
- **Caixa de pedidos — "Excedente de horas"**: pessoas em paralelo limitado
  (8), mesma ordem e mesmas regras.

## Resultado medido (mesmo cenário)

| | Antes | Depois |
|---|---|---|
| Snapshot frio (25 ms/ida) | 15,1 s, pedidos cortados | 3,8 s, completo |
| Pedidos à base (frio, 25 ms) | 4 670 (+ trabalho a continuar) | 1 500 |
| Snapshot quente (cache SWR) | 15,1 s | 0,026 s |
| 80 colaboradores, sem latência | 14 613 pedidos, 15 s cortado | 2 983 pedidos, 5,5 s |

## Consequências

- Um GET pode ver, dentro de si, o mesmo resultado de uma leitura feita
  segundos antes (é o pretendido). Escritas dentro do mesmo pedido apagam o
  memo da tabela escrita, por isso "ler → escrever → ler" continua correto.
- O que resta no frio são leituras próprias de cada pessoa (marcações,
  revisões, turnos); um apuramento em lote no módulo de assiduidade seria o
  passo seguinte se a equipa crescer muito.
