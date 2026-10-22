# RH — «Mais» (Documentos, Relatórios, Organograma), Análise da equipa e relatórios de assiduidade

Pedido do utilizador (2026-10-22). Uma fase de cada vez; mudanças visuais primeiro num «link à parte» (5174).

## Decisões (recomendação aplicada; o utilizador pode corrigir)
- **RH antigo:** sai do menu e as páginas `/hr/*` antigas redirecionam para `/hr/novo/*`. **O código não se apaga já:** o quiosque (`/kiosk`) ainda usa `pages/hr/hrApi` e `/api/hr/kiosk/*`, e as pré-condições da fase 2 do ADR-0040 (Portal ligado ao Novo RH em todas as organizações, quiosque refeito) estão por cumprir. Apagar `pages/hr` + `modules/hr` (≈24 400 linhas) fica para depois do quiosque no Novo RH.
- **Nome:** «Análise da equipa» (Relatórios → Análise da equipa).
- **Organograma:** gerado a partir das chefias diretas que já existem (`employee_managers`, `kind = direct`); editar = mudar a chefia (mesma API, com histórico). Sem tabela nova. Modelos prontos: por chefia, por centro, por departamento.
- **«Importar excel ou pdf»** = exportar (Excel e PDF), por grupo, centro ou pessoa.
- Sem dependências novas sem perguntar (há `recharts`, `jspdf`/`jspdf-autotable` no frontend; `xlsx` e `pdfkit` no backend).

## Estado (2026-10-22)
Fases 1–3 em produção (backend #100, frontend #75); fase 4 no `rh`, por publicar; fase 5 por fazer (depende do quiosque no Novo RH).

## Fases
1. **Navegação «Mais» + Documentos por pastas + RH antigo fora do menu**
   - Menu principal: Documentos sai; entra «Mais» com Documentos, Relatórios, Organograma.
   - Documentos → separadores «Colaboradores» (pastas → lista de colaboradores com ícone de pasta, quantidade, último arquivamento; abrir a pessoa) e «Empresa» (documentos da empresa + envios + importar recibos).
   - Backend: `GET /api/novo-rh/documents/folders` (agregado por pessoa × pasta: contagem e último `uploadedAt`, só documentos atuais; âmbito `canSee`). Sem migração.
   - Frontend: item «RH antigo» fora do menu; rotas antigas redirecionam; `/hr/novo/*` sai de dentro do `HrLayout`; quiosque intacto.
2. **Relatórios de assiduidade**: semana / mês / desde a admissão (ou intervalo), por centro, grupo, departamento ou pessoa; trabalhado vs. planeado, atrasos (n.º e minutos), faltas, saídas esquecidas, ausências justificadas, pontualidade %, por pessoa + totais; exportar Excel e PDF. Backend novo endpoint sobre `attendance.boardMany` (lote).
3. **Análise da equipa**: efetivo por mês (admissões/saídas), género, idade média, faixas etárias, por centro/departamento/grupo, gerações, nacionalidade, antiguidade; modo comparação (dois filtros lado a lado). Backend agregado (só números; respeita privacidade por campo e âmbito).
4. **Organograma**: árvore a partir das chefias diretas, modelos prontos, editar chefia no próprio organograma, exportar PDF/imagem. Backend: listar todas as chefias diretas num pedido.
5. **(Mais tarde)** Remover o código do RH antigo depois de o quiosque existir no Novo RH (ADR-0040 fases 3–4).
