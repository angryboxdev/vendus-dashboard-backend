# Fecho de período, reabertura com dupla aprovação e exportações (Fase 8, D10)

Tomada com a opção recomendada (a mais segura) em 2026-10-12, por instrução
permanente do utilizador para seguir a recomendação sem perguntar.

## Decisões

- **Períodos** por organização ou por centro, com os estados aberto, fechado
  e reaberto; sem sobreposição no mesmo âmbito.
- **Pré-verificação (11):** incidentes abertos, ausências e pedidos de
  correção pendentes, e excedente por validar dentro do período. Se houver
  pendentes, o fecho só avança com **exceção explícita**: motivo + a lista
  exata dos pendentes fica gravada no fecho.
- **Fecho = congelar:** antes de fechar recalcula-se a assiduidade e
  sincroniza-se o banco de horas dos colaboradores do âmbito; o fecho guarda
  os totais por colaborador (fotografia, append-only). Com o período fechado,
  são recusadas com 409 (TK-17, RE-30) as escritas com data dentro dele:
  - revisões e correções de marcação, validação de incidentes, marcações
    offline antigas;
  - atribuir/aprovar/cancelar ausências;
  - movimentos do banco de horas (lançamentos, ajustes, compensações);
  - publicação de turnos.
- **Reabertura (TK-18):** pedido com motivo; precisa de **2 aprovadores
  distintos**, nenhum é quem pediu. Ao voltar a fechar, as diferenças face ao
  fecho anterior ficam registadas por colaborador.
- **Exportações assíncronas:** fila (processada em segundo plano), centro de
  transferências por utilizador, link com token que **expira em 24 h**.
  Colunas sensíveis (NIF) só para quem tem `hr.sensitive_data`.
- **D10 — formatos (v1, CSV `;`, UTF-8 com BOM, decimais com vírgula):**
  - **Salários:** uma linha por colaborador — horas trabalhadas, teóricas,
    diferença, noturnas, pendentes, ausências por tipo (código do tipo),
    horas pagas do banco no período.
  - **Faturação:** por **centro** (o modelo de cliente/obra ainda não existe —
    ver ADR-0032): horas trabalhadas por colaborador em cada centro.
  - Os totais exportados vêm da fotografia do fecho, que é a soma dos dias
    apurados e dos movimentos do período (TK-19).
- Os layouts específicos de software de salários (ex.: ficheiros do
  processador) ficam para quando a Contabilidade os indicar (D10 parcial).
