# PATCH CORRETIVO — Folga Compensatória (à task RH 2.0)

Status: incorporado na spec (`spec.md`, tickets 07–08) — task RH 2.0 recebida em 2026-10-05.
Recebido: 2026-10-05 (versão consolidada colada pelo utilizador; substitui a primeira versão "Task_Corretiva_Fecho_Mensal_Folga_Compensatoria.md", com o mesmo conteúdo).
Dependências: Base Organizacional ticket 04 (feriados) — o feriado trabalhado precisa dos feriados.

Aplicar somente as alterações abaixo à task RH 2.0.

## 1. FECHO MENSAL

Manter o Fecho Mensal em `Assiduidade → Fecho Mensal`.

No tratamento de feriado trabalhado, o Fecho deve apenas:

- mostrar horas planeadas e efetivamente trabalhadas;
- permitir definir o tratamento: Folga compensatória; Acréscimo remuneratório; Por definir;
- manter pendência enquanto estiver `Por definir`;
- ao escolher Folga compensatória, gerar o respetivo crédito;
- mostrar apenas uma confirmação como `Folga compensatória — 4h geradas`.

### Remover do Fecho Mensal

Não gerir nem mostrar aqui: saldo disponível da folga; horas utilizadas; histórico do crédito; data de utilização; consumo parcial.

## 2. FÉRIAS & AUSÊNCIAS

A gestão do crédito de folga compensatória ocorre exclusivamente em `Férias & Ausências`. Ali devem existir: origem do crédito; crédito inicial; utilizado; saldo disponível; estado.

Quando o crédito for utilizado, criar uma ausência do tipo `Folga compensatória` ligada ao crédito de origem. Permitir utilização parcial quando já suportada pela estrutura.

## 3. FONTE ÚNICA E CONSISTÊNCIA

Deve existir apenas um crédito/saldo.

- `Fecho Mensal` → decide o tratamento e gera/referencia o crédito.
- `Férias & Ausências` → gere utilização e saldo.

A criação da decisão + crédito deve ser atómica/idempotente: não marcar o tratamento como resolvido se o crédito falhar; o mesmo feriado não pode gerar o mesmo crédito duas vezes.

Não alterar nenhuma outra funcionalidade da task RH 2.0.

## Critérios de aceitação (da primeira versão)

1. Fecho Mensal continua dentro de Assiduidade.
2. Fecho decide o tratamento do feriado.
3. Folga compensatória gera crédito apenas uma vez.
4. Fecho mostra apenas o crédito gerado, não a sua gestão.
5. Saldo/utilização/histórico ficam em Férias & Ausências.
6. Folga utilizada vira ausência do tipo Folga compensatória.
7. Não existe saldo duplicado entre os dois módulos.
8. A correção não altera outras funcionalidades da task RH 2.0.

## Mockups recebidos (2026-10-05, 6 imagens — não guardadas no repo)

1. Escalas & Turnos → Modelos & Automatizações → modal "Aplicar modelo de turno" (passos Configuração/Pré-visualização/Confirmar; aplicar a: um/vários/todos/por cargo/por local; quando: datas/seg–sex/fins de semana/personalizado; tipo: aplicar uma vez ou guardar como automatização com horizonte de geração).
2. Escalas & Turnos → Modelos & Automatizações (listas "Modelos de turno" e "Automatizações de turnos" com recorrência Semanal/Rotação A/B/Diária/Período fixo, estados Ativa/Pausada).
3. Modal "Novo modelo de turno" (Direto/Repartido, horário, local padrão, estado; alterações ao modelo não mudam turnos já criados — guardam cópia).
4. Férias & Ausências → Calendário (mês/semana/dia; tipos Férias, Baixa médica, Licença, Ausência autorizada, Folga compensatória, Feriado (Empresa & Estrutura), Outro; lista de registos; KPIs).
5. Pré-visualização da escala (turnos válidos, conflitos de horário, ocorrências em férias/ausências, turno já existente; resolver: manter existente / substituir / ignorar).
6. Modal "Registar ausência" (dia inteiro/período ou parcial com horas; turnos afetados: manter / cancelar-remover da escala / cancelar operação; turnos nunca eliminados do histórico).
Menu dos mockups: Dashboard, Colaboradores, Cargos, Locais, Escalas & Turnos, Férias & Ausências, Assiduidade, Documentos, Empresa & Estrutura, Relatórios, Configurações.
