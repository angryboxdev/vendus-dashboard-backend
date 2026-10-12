# Comunicados, alertas, tarefas, visibilidade e relatórios (Fase 9, D12)

Tomada com a opção recomendada (a mais segura) em 2026-10-12, por instrução
permanente do utilizador para seguir a recomendação sem perguntar.

## Decisões

- **D12 — canais:** só notificações **na aplicação**. E-mail, push e
  WhatsApp existem como parâmetros desligados ("a validar") até a Direção e
  o DPO decidirem (base legal, subcontratantes, retenção). Nada é enviado
  para fora da aplicação.
- **Comunicados:** rascunho editável; ao publicar, os destinatários são
  resolvidos e **congelados** (RE-31: mudar o público depois → 409). Mudar o
  texto depois de publicado cria **versão nova**; entregue/lido/confirmado
  registam-se por versão (RE-32), e uma versão nova pede nova leitura.
- **Alertas (RE-24, RE-36):** regras por tipo de origem (pedidos de ausência,
  correções, reaberturas, trocas e solicitações pendentes há mais de N dias;
  fim de contrato e de período experimental a N dias; tarefas em atraso).
  Cada alerta tem origem, dono, estado (aberto → em tratamento → fechado),
  prazo (SLA) e escalonamento automático quando o prazo passa. Fecha
  sozinho quando a origem deixa de estar pendente; fecho manual exige nota.
  Avaliação ao consultar (no máximo de 10 em 10 minutos por organização) e
  a pedido; uma tarefa agendada fica como melhoria.
- **Pedidos pendentes não expiram sozinhos** (não se aprova nem recusa sem
  uma pessoa): a "expiração" é o alerta e o escalonamento.
- **Visibilidade (C6.7, CF-15):** "Quem está" mostra, por omissão, só o
  próprio centro; turnos e contactos dos colegas não são mostrados. A
  restrição é aplicada na API (não só na interface).
- **Solicitações personalizadas (C6.3):** formulário (título obrigatório,
  até 50 campos, prazo de resposta); decide a gestão, nunca o próprio.
- **Tarefas operacionais:** checklist e prazo; só se concluem com os itens
  obrigatórios feitos.
- **Relatórios prioritários:** assiduidade, saldos, ausências, dados
  incompletos e histórico de alterações — sempre no âmbito de quem consulta,
  NIF/IBAN nunca incluídos, exportação CSV com neutralização de fórmulas.
