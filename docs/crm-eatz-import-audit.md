# Auditoria da importação de clientes eatz

> Data da análise: 2026-08-21
> Snapshot eatz: 2026-08-15
> Fonte: `clientes_extraidos_ordenados (1).xlsx` + `crm_customers` do DB live

## Totais reconciliados

| Item | Total |
|---|---:|
| Linhas no XLSX | 230 |
| Clientes no DB antes da importação | 230 |
| Novas linhas sem correspondência após incluir C068 | 61 |
| Novas pessoas após consolidar Licia e Marcelo | 59 |
| IDs reservados para novos clientes | C231–C289 |
| Clientes do DB confirmados fora do XLSX | 56 |

O cruzamento dá prioridade ao email exato e depois ao telefone normalizado. Nos telefones portugueses, `+351`, `351`, espaços e pontuação são ignorados. C068 foi identificado pelo telefone existente no campo `notes`.

## Contas repetidas no XLSX

- **Jonathan/Jon Grayson** — as duas contas são agregadas em C010; quantidade e gasto são somados, o primeiro cadastro e o último pedido são preservados.
- **Raquel Moreira** — as duas contas são agregadas em C021.
- **Licia Boaventura** — duas contas sem pedidos são inseridas como uma pessoa nova.
- **Marcelo Inacio Jeske** — duas contas sem pedidos são inseridas como uma pessoa nova.
- **Mário Mario / raultest raultesta** — usam o mesmo telefone e apontam para C160, mas nomes e emails são incompatíveis. Permanecem em quarentena e a migration não altera C160.

## Duplicados já existentes no DB

A migration atualiza apenas um registro canónico e não apaga nem funde duplicados:

| Pessoa | Canónico | Duplicado preservado | Critério |
|---|---|---|---|
| Paula Azevedo | C168 | C169 | ID mais antigo |
| Dinis Almeida | C156 | C151 | email exato |
| Raquel Moreira | C021 | C076 | email exato |
| Gabriel Catel | C069 | C171 | ID mais antigo |
| Luiz Fernando Lima Costa | C097 | C072 | email exato |
| Daniel Paz | C059 | C079 | ID mais antigo |
| Francisco Mangas | C215 | C074 | email exato |
| Diana Rocha | C032 | C071 | email exato |

## Regras de proteção de dados existentes

- `registered_at`, `opt_in`, `inactive` e demais campos CRM não são substituídos pelos equivalentes eatz.
- Email, telefone e aniversário só são preenchidos quando o campo CRM está nulo.
- `eatz_segment = Inativo` não altera o campo CRM `inactive`.
- `Marketing = Sim` é guardado em `eatz_marketing_opt_in`, sem alterar `opt_in`.
- As 14 datas de nascimento com ano 2026 são consideradas inválidas e não são importadas.
- A coluna NIF não é criada porque todas as 230 linhas têm o valor vazio (`-`).

## Resultado esperado

Ao aplicar `084_crm_eatz_snapshot.sql` no estado auditado, o DB passa de 230 para 289 clientes. A própria migration aborta se algum ID entre C231 e C289 já existir.
