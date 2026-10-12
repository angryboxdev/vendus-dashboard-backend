# Proposta: modelo de cliente e obra para faturação de horas (D10)

Estado: **proposto** — a validar por Contabilidade e Direção antes de
implementar. Registado em 2026-10-12 (Fase 8).

## Contexto

A task pede exportação para faturação "a clientes por obra ou cliente". O
sistema não tem esse modelo: o CRM tem clientes de venda, não obras, e as
horas só estão ligadas a centros (locais da organização). Inventar a ligação
horas → obra produziria faturas erradas.

## Proposta

- `billing_clients` (org, nome, NIF do cliente, código, ativo).
- `billing_projects` (org, cliente, nome/obra, morada, código, início, fim,
  tarifa horária opcional por categoria).
- `employee_project_assignments` (org, colaborador, obra, de/até, %
  ou horas) — com vigência, como as outras atribuições.
- Opcional: marcação com obra (`clock_events.project_id`) quando o
  colaborador trabalha em várias obras no mesmo dia; sem isso, as horas do
  dia repartem-se pela atribuição em vigor.
- Exportação de faturação passa a ser por cliente/obra, com a mesma fonte
  de totais (dias apurados) e o mesmo fecho.

## Até lá

A exportação de faturação v1 é por **centro** (ADR-0031). Nenhuma tabela
desta proposta é criada sem aprovação.
