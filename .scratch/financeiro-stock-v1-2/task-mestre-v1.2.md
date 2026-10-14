# TASK MESTRE — Fornecedores, Financeiro e Stock
**Mezza ERP | v1.2 | 14/10/2026**

**Substitui as especificações v1.0/v1.1; não é um aditamento.** Preservar funcionalidades já implementadas que cumpram esta versão. Base: task v1.1, imagens e decisões desta conversa.

**Execução:** uma fase de cada vez, pela ordem F1–F4. Sem outra indicação, começar pela F1; apresentar resultados/testes e aguardar autorização antes da seguinte. Ler o contrato comum, a fase em execução e as dependências relevantes, sem implementar antecipadamente o restante. Não reescrever módulos nem acrescentar funcionalidades fora do âmbito.

## 0. Contrato comum

**Uma fatura, três camadas separadas:**

| Camada | Responsabilidade |
|---|---|
| Documento original | Identidade fiscal, ficheiro, linhas reais, descontos, bases, IVA e totais. |
| Classificação financeira | Classificação única, por artigo ou por valores; uma obrigação financeira por documento. |
| Tratamento de Stock | Mapear cada linha real para artigo/destino ou «Não é item de stock». |

**As linhas de repartição financeira nunca são artigos nem substituem as linhas do PDF.** Financeiro não precisa mapear SKUs; Stock não pode reclassificar silenciosamente lançamentos financeiros. «Enviar para Stock» cria uma revisão, não uma entrada automática de inventário.

Não criar pedidos, receções, ativos fixos ou nova contabilidade. Não exigir data prevista de entrega. Reutilizar serviços, permissões, política de custos e design system existentes; assinalar lacunas antes de implementar soluções incompatíveis.

## F1 — Integridade documental, cálculos e segurança

### 1.1. Inspeção e modelo mínimo

Mapear modelos, fluxos de importação, saldos, conciliação, estados e movimentos existentes antes de alterar código. Reutilizar estruturas equivalentes, garantindo:
- Documento canónico com entidade compradora/tenant, identificação fiscal, ficheiro original, versões e origens de importação.
- Linhas documentais reais com IDs estáveis; valores extraídos, normalizados e confirmados separados.
- Alocações financeiras próprias: modo, centro de custo/subcategoria, loja quando aplicável e valor líquido. Associação às linhas reais apenas quando conhecida.
- Mapeamentos de Stock separados: linha original, artigo ou exclusão, conversão de unidade, destino e movimento.
- Estados financeiros e de Stock independentes; preferências e aprendizagem com âmbito, versão e auditoria.

Uma categoria financeira não determina, isoladamente, se existe inventário. CMV/Ingredientes é uma classificação de gestão, não uma ordem para contabilizar novamente o consumo. Movimentar Stock não cria outra despesa nem conta a pagar.

### 1.2. Duplicados e sincronização

Para faturas/NC, chave forte: `tenant + entidade compradora + país/NIF do emitente + tipo + série/número fiscal completo`. Usar ATCUD como evidência adicional quando disponível. Preservar séries, zeros e separadores significativos; não converter números fiscais em inteiros. Guias/obrigações sem número de fatura usam referência oficial e validação próprias; não inventar identidade fiscal.

Mesmo nome, data, valor ou nome de ficheiro não prova duplicação. Hash ajuda a reconhecer o mesmo ficheiro, mas não substitui a identidade fiscal. Identidade incompleta/ambígua fica em revisão, sem finalizar nova obrigação ou movimentar inventário.

Centralizar a verificação para ambos os módulos, no backend, com unicidade e transações. Pedidos simultâneos, repetição de eventos e reimportação devolvem o mesmo documento. Garantir idempotência também na obrigação financeira e nos movimentos por linha/destino; nova versão de extração não autoriza nova entrada de stock.

| Situação | Resultado |
|---|---|
| Já existe no Financeiro | Recusar nova cópia; informar origem e oferecer «Abrir documento existente». Encaminhar esse documento ao Stock apenas por ação autorizada. |
| Já existe apenas no Stock | Financeiro oferece «Completar lançamento existente», sem duplicar documento ou quantidades. |
| Possível duplicado | Comparação manual; não fundir automaticamente. |
| Novo documento | Criar uma identidade partilhada, registando o módulo de origem. |

Conservar proveniência de ambas as importações. Mesma identidade com montantes diferentes gera conflito para revisão, não substituição silenciosa do original validado. Ligações ao original respeitam permissões, sem revelar documentos de outras entidades.

### 1.3. Motor único de valores

Usar os mesmos cálculos nos três modos financeiros e no Stock:
`bruto − descontos comerciais efetivos = base líquida; base + IVA + ajustes documentados = total`.

- Dinheiro em decimal exato; quantidades/custos com precisão suficiente; apresentação `pt-PT`. Interpretar separadores segundo o documento, validando pelos totais.
- Desconto em **% ou €** representa a mesma operação, não dois descontos. Aceitar por linha e global adicional quando ambos existirem efetivamente.
- Identificar quando o desconto do rodapé apenas resume os descontos das linhas. Nesse caso não reaplicá-lo.
- Distribuir desconto global pelas linhas abrangidas, preservando grupos de IVA e reconciliando cêntimos deterministicamente. Não inventar incidência quando o documento for ambíguo.
- Extrair IVA por linha e quadro-resumo por taxa; ausência de taxa é dado por validar, não 0%. Não assumir taxa média ou taxa baseada no fornecedor/artigo. Classificação única e por valores também suportam múltiplas taxas sem exigir SKU.
- Distinguir desconto comercial de desconto financeiro, retenção e outras deduções. Usar apenas tratamentos suportados/validados, não inferências fiscais.
- Mostrar «Bruto antes de descontos», «Desconto», «Base após descontos», «IVA» e «Total». Não renomear retroativamente o antigo subtotal líquido como bruto.
- Trocar «Saldo» da conferência por **«Diferença para a fatura»**, distinto de saldo a pagar. Finalizar apenas com reconciliação em cêntimos; ajuste de arredondamento exige política explícita, explicação verificável e registo, nunca um acerto silencioso.
- Divergência real bloqueia finalização, mas permite rascunho. Falta de extração dos artigos não bloqueia o Financeiro se identidade, bases/IVA, descontos, totais e classificação estiverem validados.

### 1.4. Segurança, edição e migração

Validar no servidor permissões por entidade/loja e operação. Registar autor, origem, antes/depois e motivo de alterações relevantes. Controlo de versão impede que gravações concorrentes sobreponham decisões.

Depois da validação financeira, Stock apenas lê valores fiscais; pede correção ao Financeiro. Correções aprovadas atualizam a mesma identidade/versionamento. Depois de movimentar inventário, corrigir valor/quantidade por ajuste ou estorno auditável, não reexecutando a compra. Períodos fechados seguem bloqueios existentes.

Migração com simulação e relatório: preservar originais, liquidações e movimentos; distinguir falha de extração de documento não inventariável; retirar excluídos da fila ativa. Resolver duplicados históricos antes de impor restrições incompatíveis com os dados. Uma fusão exige reconciliar obrigações/pagamentos/movimentos, não apenas esconder uma linha. Não regenerar inventário nem aplicar novas preferências retroativamente.

## F2 — Fornecedores, três modos financeiros e indicadores

### 2.1. Predefinições e encaminhamento

Na ficha do fornecedor: centro de custo/subcategoria habitual; modo financeiro preferido; destino habitual quando inequívoco; política `Enviar por defeito / Não enviar / Decidir no documento`; exceções por entidade/loja.

Prioridade para campos operacionais: escolha manual autorizada → destino inequívoco/contexto confirmado → regra específica fornecedor/loja → regra geral/CC → sugestão de IA. Mostrar origem. Divergência com o documento fiscal exige conferência; prioridade manual não permite falsificar os dados do original.

«Todas as lojas» nunca é destino de uma quantidade. Havendo ambiguidade, pedir seleção apenas antes da operação que precisa do destino. Validar pares CC/subcategoria e locais autorizados.

Substituir «Impacto no stock: Automático» por **«Enviar para Stock»**, com motivo discreto da predefinição. Fornecedor de ingredientes/CC compatível sugere marcado; energia/comunicações/serviços sugerem desmarcado. Política explícita e exceções prevalecem: fornecedor misto não é totalmente inventariável nem totalmente excluído.

Em «Decidir», exigir escolha explícita no lançamento; ausência de decisão não equivale a «Não enviar». Permitir desmarcar com motivo curto quando contrariar a predefinição. Não mudar regras futuras por causa de uma exceção. Uma exclusão manual no Stock permanece nas sincronizações; reencaminhar exige ação explícita.

### 2.2. Modos de classificação financeira

Seletor: **«Única» | «Por artigo» | «Por valores»**. Padrão Única; fornecedor misto pode ter Por valores como preferência aprovada.

| Modo | Operação |
|---|---|
| Única | Uma classificação para toda a base líquida; dados fiscais podem conter várias taxas. |
| Por artigo | Usar linhas reais extraídas; editar classificação, quantidade, desconto e IVA inline, enquanto rascunho autorizado. Não exigir associação a SKU. |
| Por valores | Criar repartições por CC/subcategoria e, quando necessário, loja: descrição/categoria + montante líquido. Sem quantidade, SKU ou taxa de IVA inventada. |

**Exemplo proposto, sem IVA e após descontos:** Bebidas 100 € + Equipamentos 250 € + Ingredientes 300 € = **650 € de base líquida**. Equipamentos usa categoria válida existente, não CMV por defeito. Estes três registos são alocações financeiras, não três artigos.

Regras:
- Por valores, soma das alocações = base líquida total. Mostrar **«Por distribuir»**; impedir finalização com valor em falta/excesso ou categoria inválida.
- Desconto comercial disponível nos **três modos**. Em Por valores, montantes já são líquidos: não descontar novamente cada categoria. Alterar desconto/base invalida a conferência das alocações manuais; não redistribuir silenciosamente.
- IVA permanece no quadro fiscal do documento, por taxa. Não deduzir IVA de Bebidas/Equipamentos/Ingredientes pelo nome. Quando forem exigidas alocações fiscais específicas, usar evidência das linhas ou validação financeira, nunca taxa média.
- Trocar de modo preserva original, linhas, impostos e mapeamentos. Conversão que perca detalhe pede confirmação/pré-visualização; não inventar uma correspondência artigo↔categoria.
- Importação mantém linhas reais disponíveis para Stock, mesmo ocultas no Financeiro. O seletor genérico «Tipo: Outro/Salário/Imposto...» sai do editor de artigo; preservar dados legados necessários.
- Ao detetar mistura de categorias, sugerir Por valores/Por artigo. Categorias fiáveis das linhas permitem propor montantes já somados; desconhecidas ficam por distribuir. Financeiro confirma a proposta, sem mapear SKUs. Não mudar uma escolha confirmada.
- «Guardar rascunho» não cria obrigação nem envia automaticamente revisão. «Guardar e gerar conta a pagar» cria/atualiza uma obrigação e, quando marcado, uma revisão de Stock, independentemente de SKUs.
- Preservar comportamentos existentes de «Fatura já paga» e débito direto. Marcar débito direto não comprova pagamento; «já paga» deve seguir o fluxo financeiro de validação, sem liquidação inventada.

### 2.3. Resumo junto dos filtros de Faturas

Na mesma barra, à direita e sem cards:
`[Pesquisa] [Período] [Filtros]     Total a pagar 0,00 € | Em atraso 0,00 €`

No telemóvel pode quebrar para a linha seguinte, sem novo painel. Valor vencido com ênfase discreta.

- Agregar no backend o saldo aberto do razão financeiro, não o valor original da fatura. Pagamentos reconhecidos e NC aplicadas reduzem saldo uma vez; não voltar a subtraí-los se já refletidos.
- Em atraso = parcelas abertas com vencimento anterior à data civil atual da entidade. Vence hoje: não atrasado. Sem vencimento: inclui dívida, mas sinaliza data em falta.
- Respeitar entidade, moeda, fornecedor, loja, pesquisa e período; período usa a mesma data da listagem, identificada em ajuda contextual. Não chamar «dívida global» a um mês filtrado.
- Totais independentes da paginação e das abas de workflow; filtros de estado dessas abas não redefinem dívida. «Aguardando conciliação» não prova pagamento nem falta dele.
- Filtro de loja seleciona documentos associados; somar cada obrigação uma vez, mesmo com várias alocações. Em documentos multiloja, indicar que o saldo exibido é do documento, não uma dívida autónoma da loja. Não criar rateio fictício de pagamentos.
- Duplicados confirmados usam obrigação canónica reconciliada. Suspeitos mantêm o saldo registado e aviso de validação pendente, sem exclusão arbitrária.
- Incluir obrigações legítimas fiscais/contributivas do mesmo razão; não misturar moedas ou entidades sem seleção/conversão autorizada.
- Recalcular após alterações financeiras e passagem da data local; invalidar cache. Garantir `0 ≤ Em atraso ≤ Total a pagar` e concordância com o detalhe consultável.

## F3 — Stock: linhas reais, fila útil e importação

### 3.1. Revisão e conferência de faturas mistas

Receber **todas as linhas reais** da fatura, independentemente do modo financeiro. Na revisão, cada uma fica como:
**«Associar artigo» / «Criar artigo» / «Não é item de stock»**.

Campos: descrição/referência original, quantidade/unidade, desconto, base líquida/IVA, artigo, fator de conversão, destino e estado. Dados fiscais validados são de leitura; sugestões não confirmadas devem ser reconhecíveis.

Exemplo dos 650 €: bebidas e ingredientes geram movimentos a partir dos seus artigos/quantidades reais; equipamento marcado «Não é item de stock» permanece no documento e na classificação financeira, mas não aumenta inventário. Não criar produtos genéricos «100 € Bebidas» ou «300 € Ingredientes».

Conferências distintas:
1. **Documento:** todas as linhas, incluindo não inventariáveis, reconciliam com bases/IVA/totais.
2. **Stock:** apenas linhas inventariáveis geram quantidade e custo; não precisam somar o total financeiro.
3. **Categorias:** comparar valores financeiros com categorias das linhas quando existir associação fiável. Divergência abre pendência ao Financeiro; não redistribuir valores nem corrigir CC automaticamente.

Uma divergência apenas de categoria não impede entrada física com valores/quantidades válidos; divergência de quantidade, base, desconto ou custo necessário impede confirmar o movimento. Linhas não inventariáveis não são eliminadas da conferência.

Confirmar apenas com todas as linhas resolvidas, artigo ativo, unidades/fatores, quantidade e destino válidos. Divisão por lojas exige quantidades explícitas cuja soma iguala a linha original; nunca replicar a quantidade integral em cada loja. Faturas com todas as linhas não inventariáveis terminam «Excluída — não afeta Stock», sem movimento.

Custo unitário usa valor líquido e política financeira existente de IVA recuperável/custos elegíveis. Não espalhar custo de equipamento excluído pelos ingredientes. Embalagens alteradas exigem nova conferência; `cx→un` precisa fator conhecido. Calendário/fatura não comprovam entrega: confirmação operacional valida a entrada efetiva, sem criar módulo de receção.

Confirmação atómica neste âmbito: nenhum movimento parcial automático. Notas de crédito distinguem devolução física de correção de preço; esta última não subtrai quantidades, seguindo ajuste de valor autorizado.

### 3.2. Fila e remoção

Vista ativa: documentos encaminhados ao Stock e ainda por tratar. Estados:
`A extrair → Por mapear → Em revisão → Pronto → Movimentado`, com `Falha de extração` e `Excluído` como alternativas.

Zero linhas não significa ausência de stock: extração termina em resultado ou falha explícita, sem processamento infinito. Oferecer reprocessamento limitado e introdução manual das linhas originais. Remover «Cancelar revisões sem linhas».

Ocultar Movimentado/Excluído/cancelamentos legados da vista ativa; histórico acessível por filtro. Mostrar fornecedor, documento, data, destino, origem, valor e progresso de linhas.

**«Retirar de Compras por rever»**: confirmação + motivo + auditoria, apenas no documento selecionado. Não elimina fatura, obrigação, pagamento ou conciliação. Em importação só de Stock, arquiva logicamente; não esconder do Financeiro uma obrigação legítima pendente. Compra já movimentada exige ajuste/estorno, nunca eliminação direta. Recuperação autorizada não pode repetir movimentos.

### 3.3. Importação diretamente no Stock

Botão «Importar fatura» usa ingestão e deteção de duplicados da F1. Documento novo recebe origem Stock e pendência **«Aguardando lançamento no Financeiro»**, visível nesse módulo, sem gerar automaticamente conta a pagar.

A pendência permanece no fluxo de validação financeira; não equivale a liquidação nem cria saldo no razão antes do lançamento. Stock pode mapear imediatamente. Pode confirmar inventário antes do lançamento financeiro somente com validação documental mínima por perfil autorizado: identidade, linhas, valores, unidades, destinos e política de custo definidos. Sem estes requisitos, guardar revisão, não movimentar. Validação documental/operacional não equivale a aprovação contabilística.

Financeiro completa a mesma fatura depois. Diferença posterior de custo segue correção versionada/ajuste; não repete quantidades. Documento já existente mas ainda não encaminhado oferece abrir e encaminhar com permissão, não nova importação. Excluir uma revisão não liberta a chave fiscal para duplicação.

## F4 — Calendário de fornecedores e aprendizagem controlada

### 4.1. Calendário

Configurar dias semanais, janela horária opcional, vigência e ativação para uma, várias ou todas as lojas ativas da entidade. «Todas» abrange também futuras lojas ativas dessa entidade; informar isso no formulário.

Exceção pontual prevalece sobre regra específica da loja, que substitui a regra geral para essa loja. Exemplo: segunda para todas + quinta específica para MBS resulta em quinta para MBS; incluir ambos os dias exige escolha explícita.

Impedir eventos repetidos por sobreposição. Calendário/ficha editam a mesma regra; filtrar por loja/fornecedor. Gerar ocorrências apenas para o intervalo consultado, sem criar faturas, pedidos ou movimentos.

### 4.2. Aprender com a prática

Implementar memória estruturada de decisões confirmadas, não «treinar a IA» indiscriminadamente nem enviar o histórico inteiro em cada pedido.

- Correspondência: entidade + fornecedor + referência/descrição normalizada + unidade/embalagem; destino específico apenas quando aplicável. Guardar artigo, conversão validada, sugestão de categoria ou «não inventariável», origem, confirmações, conflitos e versão.
- Reutilizar categorias habituais e correspondências, não montantes/percentagens históricos de repartição. Decisão humana pode gerar sugestão futura. Perguntar **«Usar nas próximas faturas deste fornecedor?»**; regra expressamente aprovada pode preencher automaticamente, mas não confirmar movimentos/obrigações.
- Não aprender de rascunhos, sugestões não verificadas ou aceitações automáticas. Uma exceção isolada não altera a regra geral. Conflito/alteração de embalagem suspende aplicação automática.
- IVA, preços, descontos e quantidades são extraídos novamente de cada documento; nunca copiados da compra anterior. Escolhas manuais confirmadas ficam protegidas em reprocessamentos.
- Mostrar motivo («referência já associada», «preferência aprovada») e permitir corrigir/desativar regras. Isolar aprendizagem por entidade; não partilhar dados entre clientes.
- IA não apaga documentos, publica em massa, cria artigos nem muda CC validado sem ação autorizada. Texto do PDF é dado, não instrução executável.
- Priorizar ficheiro estruturado/texto nativo, regras e correspondências aprovadas; usar IA só nas dúvidas, agrupadas por documento. OCR apenas quando necessário. Cache de extração por entidade/hash/versão; reprocessar somente o necessário, preservando linhas e decisões já confirmadas.
- Limites finitos de documentos, tentativas e orçamento diário de IA por entidade, aplicados no backend antes da chamada, com reserva para concorrência. Respeitar limites existentes mais restritos; se não configurados, não ativar consumo automático. Ao atingir limite, manter revisão manual, sem novas tentativas pagas.
- Medir aceitação/correções humanas e custo por documento. Sugestão frequente não se transforma sozinha em autorização de operação.

## 5. Testes de aceitação e entrega por fase

Executar testes unitários, integração e UI conforme aplicável. Casos monetários usam dados controlados, não saldos presumidos de produção.

| Fase | Casos obrigatórios |
|---|---|
| F1 | Importação repetida/concorrente nas duas origens; identidades incompletas; séries diferentes com números semelhantes; uma obrigação/movimento; isolamento/permissões; conflito de edição; migração sem efeitos retroativos. |
| F1 | Mozzarella: `20 × 6,20 = 124,00`; desconto `10% = 12,40`; base `111,60`; IVA do documento `6% = 6,70`; total `118,30`; diferença `0,00`. Desconto do rodapé não duplicado. |
| F1 | Múltiplas taxas, desconto global/linha, arredondamentos, quantidade `20.000` conforme formato original e extração sem IVA confiável. |
| F2 | Três modos, desconto %/€, alternância sem perda e Por valores soma 650 €. Total 649 € ou 651 € bloqueia finalizar; mudança de desconto reabre conferência. Financeiro não precisa SKU. |
| F2 | Fornecedor/loja/CC predefinidos; exceção preservada; fatura mista sugerida; serviço não encaminhado; «já paga» e débito direto sem dívida/liquidação duplicada. |
| F2 | Indicadores sem cards, todas as páginas, abas independentes, filtros/moeda/multiloja; 200 € − pagamento reconhecido 50 € = 150 €; NC uma vez; prestações; vence hoje; falta de vencimento; passagem de dia. |
| F2 | Fixture das seis linhas do ecrã, em 14/10/2026: apenas após confirmar a duplicação 64311, sem outros documentos/pagamentos/NC, total 3.661,90 € e atraso 2.933,99 €. Suspeita não confirmada exige aviso, não corte automático. |
| F3 | Exemplo Makro: repartições 100/250/300 não viram artigos. Linhas reais reconciliam 650 €; equipamento excluído permanece financeiro; base inventariável 400 €, antes de eventual tratamento de custos/IVA. |
| F3 | Zero linhas/falha recuperável; todas não inventariáveis; conversões e embalagem alterada; divisão de quantidades por destino; confirmação repetida; diferença de categoria versus diferença de custo. |
| F3 | Retirar revisão preserva Financeiro; estorno após movimento; importação Stock primeiro com pendência financeira; conclusão posterior sem duplicar; NC de preço versus devolução física. |
| F4 | Uma/várias/todas as lojas, futura loja e exceção substitutiva; sem duplicação de calendário nem geração de stock. |
| F4 | Preferência confirmada sugere/preenche a próxima fatura; exceção não contamina regra; conflito suspende; IVA/desconto antigos não copiados; isolamento, cache e limite concorrente com alternativa manual. |

**Entrega de cada fase:** alterações e migrações realizadas, testes executados/resultados, riscos ou dependências encontrados e instruções de validação. Não declarar funcionalidade testada sem evidência. Ativar em produção apenas após aprovação, com reversão segura e sem operar em massa sobre dados reais.
