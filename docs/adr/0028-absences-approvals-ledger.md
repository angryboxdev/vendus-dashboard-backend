# Ausências, aprovações multinível e saldos em ledger (Fase 5, D9)

Tomada com a opção recomendada (a mais segura) em 2026-10-12, por instrução
permanente do utilizador para seguir a recomendação sem perguntar.

## Decisões

- **D9 — aprovador de recurso:** cada fluxo pode indicar pessoas de recurso;
  sem elas, o recurso são os administradores da organização. Um nível sem
  aprovador **não** é aprovado automaticamente (RE-23): o pedido escala para o
  recurso e fica um alerta (notificação). O comportamento observado (aprovar
  sozinho) foi considerado de risco elevado (C6.4).
- **Sem autoaprovação (RE-22):** quem pede e o próprio colaborador nunca contam
  como aprovadores. Um nível em que só eles aprovariam é tratado como vazio
  (escala). Não há parâmetro para ligar a autoaprovação.
- **Fluxo só se grava validado (CF-5):** cada nível tem de ter pelo menos uma
  pessoa ou um papel; papéis possíveis: responsáveis do colaborador
  (`employee_managers`, Fase 2) ou um perfil de acesso.
- **Saldos em ledger append-only (RE-25):** acumulação, pedido, anulação,
  ajuste, expiração, transição e compensação de feriado. Cancelar uma ausência
  aprovada gera um movimento de anulação; nada se apaga.
- **Acumulação:** criada uma vez por período com o limite configurado (+ dias
  por antiguidade). Sem proporcionalidade por data de entrada até RH/jurídico
  validar a regra (D6 — nenhum valor legal no código).
- **Férias** usam o calendário de férias atribuído ao colaborador (Fase 3).
  Os outros tipos têm as regras no próprio tipo. Nenhum tipo é criado por
  omissão (limites legais a validar).
- **Fora do contrato é sempre recusado (TK-14).**
- **Ausências privadas:** permissão especial `hr.absences_private`. Sem ela,
  vê-se "Ausência" sem tipo nem comentário.
- **Horas:** só contam as horas que coincidem com o horário planeado (CF-8),
  salvo se o tipo disser o contrário.
- **Efeito no tempo (CF-7):** "reduz o teórico", "conta como trabalhado" ou
  "nenhum", por tipo. O motor de assiduidade recebe-o no plano diário.
- **Compensação de feriado trabalhado (CF-9):** coeficiente do feriado (ou do
  calendário) × feriado confirmado com tempo trabalhado. Se o calendário pede
  aprovação, gera um pedido; o saldo só entra quando for aprovado.
- **Pedidos pendentes não expiram** (como observado); o alerta de pedidos
  parados é da Fase 9 (RE-24).

## Consequências

- Até existirem tipos e fluxos configurados, não há pedidos possíveis.
- O Portal do Colaborador continua com as ausências do RH atual; o Novo RH tem
  o seu "As minhas ausências" para teste.
