# Análise de Vendas

Author: Gerência
Status: confirmed
Date: 2026-11-21

## Problem

A gerência não consegue ver, num só sítio, **quando** a loja vende: por hora, por dia, por dia da semana, quais são os dias e as horas fortes e fracos, e como o período se compara com o passado.

Hoje a informação está espalhada:

- A página **Vendus** tem uma distribuição simples e só períodos curtos (Hoje, Ontem, 7 dias, Último mês).
- A página **Resultados** só funciona por mês completo e vai buscar a AirMenu automaticamente.
- A página **Air Menu** depende da API da AirMenu, que dá muitos problemas. Uma falha deixa a página sem dados.

Exemplo real: para saber se a terça às 16h vale a pena ter alguém no salão, ou qual foi o melhor sábado do mês e porquê, é preciso juntar números à mão de várias páginas.

## Proposed outcome

Uma página nova, **«Análise de Vendas»**, dentro do grupo **Operação** do menu, que dá a informação completa das vendas da loja.

**Fonte dos dados**
- Por defeito mostra só a **Vendus**.
- Um seletor permite ver **AirMenu** ou **Ambas**. A AirMenu **nunca** é consultada sem o utilizador a escolher.

**Período**
- Por defeito, do dia 1 do mês até hoje.
- Atalhos: Este mês, Mês anterior (mês completo), Este ano, Personalizado (de… até…).
- Máximo de 12 meses.

**Números principais (cartões no topo)**
- Receita bruta (com a líquida, sem IVA, em segundo plano), n.º de vendas, ticket médio e média diária.
- Cada cartão mostra a variação face ao **mesmo período do ano anterior**.
- **Previsão do mês** (só no mês corrente), feita com **IA**. Para cada dia que falta, olha para os mesmos dias da semana das últimas semanas (os mais fracos e os mais fortes) e para a tendência do mês, e propõe um valor provável com um intervalo (cenário fraco e cenário forte) e o n.º de vendas esperado. **Não** é uma média diária.

**Receita por dia (gráfico)**
- Uma barra por dia com o **n.º de vendas** por cima.
- Uma linha com o **mesmo dia do mês anterior**.
- No mês corrente, os dias que faltam aparecem como barras tracejadas com a previsão.
- Dia mais forte e dia mais fraco destacados. Os dias sem vendas contam para o mais fraco.

**Destaques, dias da semana, horas**
- Dia mais forte e mais fraco (data, valor, n.º de vendas).
- Hora de pico e hora mais fraca, sempre com o **n.º de vendas** (total e por dia).
- Horas sem vendas dentro do horário.
- Vendas fora do horário: contam nos totais e aparecem assinaladas.
- Média por dia da semana (segunda a domingo).
- Média por hora.
- **Mapa de calor** dia da semana × hora, com o n.º de vendas em cada quadrado.

**Canais**
- Salão, Take Away, Eatz e **Apps** (Vendus); Uber Eats, Glovo e Bolt Food (AirMenu).
- O método «Apps» da Vendus **continua em uso**: antes eram as plataformas faturadas na Vendus, agora é o **delivery próprio**. Aparece como canal normal.
- Receita, peso no total, vendas, ticket, variação face ao ano anterior e hora de pico de cada canal.

**Tudo é clicável**
- Ao clicar numa barra do dia, num destaque, num dia da semana, numa hora, num quadrado do mapa de calor ou num canal, abre-se um painel ao lado com o detalhe.
- O detalhe de um dia mostra receita, n.º de vendas, ticket médio, comparação com o mesmo dia do mês anterior e do ano anterior, e uma tabela **hora a hora** com receita, n.º de vendas, ticket e vendas por canal.
- Dentro do painel pode-se continuar a navegar (por exemplo, da hora 20h para as sextas, e daí para um dia concreto) e voltar atrás.

**Dados das plataformas (AirMenu) sem depender da API**
- A AirMenu é consultada **mês a mês**, e só quando o utilizador a escolhe. Acima de 1 mês, a API fica bloqueada.
- Cada mês já fechado que se consulta (por exemplo julho) fica **gravado** e nunca mais é pedido à API. Para ter vários meses, vai-se buscando um mês de cada vez.
- Por agora **não há envio de SAF-T**.
- Os dados das plataformas guardam-se por hora e por plataforma.
- Se faltar um mês, a página avisa «Sem dados da AirMenu para <mês>». Se a AirMenu falhar, os dados da Vendus continuam visíveis.

**Velocidade**
- Os dias já fechados da Vendus também ficam guardados, para que «Este ano» e a comparação com o ano anterior abram depressa. Só o dia de hoje é sempre pedido à Vendus.

## Affected users and areas

- **Quem vê:** só a gerência e o admin.
- **Loja:** só a Angry Box principal.
- **Onde:** um item novo no grupo **Operação** do menu, ao lado de Fechos de Caixa, Declaração de Vendas, Air Menu e Vendus. Não substitui nenhuma página existente (Vendus, Air Menu e Resultados ficam como estão).
- **Dados que usa:** vendas da Vendus e vendas da AirMenu (pela API, mês a mês, com os meses fechados gravados).

## Constraints

- A AirMenu **nunca** é consultada automaticamente, só quando o utilizador a escolhe. Nunca mais de 1 mês de cada vez pela API.
- Uma falha da AirMenu nunca pode deixar a página sem os dados da Vendus.
- Horário de funcionamento (fixo nesta versão): segunda a quinta e domingo das 12h00 às 22h30; sexta e sábado das 12h00 às 23h30.
- As horas têm de ser as de Lisboa, incluindo a mudança de hora.
- Os totais mensais têm de bater com a página Resultados e com a DRE (mesma regra de notas de crédito, com IVA).
- A receita bruta é o número principal, coerente com o resto do dashboard.
- A previsão é sempre uma **estimativa** e tem de estar assinalada como tal (cartão e barras com o selo «IA»).
- Só valores agregados (por dia, hora e canal). Não se guardam dados de clientes, como o NIF dos documentos.
- Nome «Análise de Vendas», e não «Faturação», para não se confundir com a faturação certificada do grupo Vendas.

## Out of scope

- Top de produtos e categorias (já existe em Resultados e na página Vendus). Fica para depois.
- Editar o horário de funcionamento nas Configurações. Fica para depois.
- Outras lojas (Porto) e seletor de loja.
- Envio do SAF-T da AirMenu (fica para depois).
- Escrever à mão os totais das plataformas.
- Mudar as páginas Vendus, Air Menu ou Resultados.

## Success looks like

- A gerência abre a página e, sem pedir nada à AirMenu, vê o mês corrente comparado com o ano anterior.
- Consegue responder em segundos: qual foi o dia mais forte e mais fraco, a que horas se vende mais e menos (e quantas vendas), que dia da semana é mais forte e que horas ficam vazias.
- Clica em qualquer número e vê o detalhe até ao nível da hora de um dia concreto.
- Vê uma previsão do fim do mês com um intervalo realista.
- «Este ano» abre depressa depois da primeira vez.
- Quando a AirMenu falha, a página continua útil e diz claramente o que falta.

## Prototype

- **Ramo:** `prototype/analise-de-vendas` no repositório do **frontend** (só local por agora; commit `dbbbc31`). Dados fictícios, sem backend.
- **Como abrir:** arrancar o frontend nesse ramo e ir a `/operacao/analise-de-vendas-prototipo`. A barra preta no fundo (ou as setas ← →) alterna as variantes A, B e C. `?detalhe=dia:2026-11-14` ou `?detalhe=previsao` abre um painel diretamente.
- **Variante preferida:** **A «Painel»**: cartões no topo, gráfico diário, destaques, dia da semana, hora, mapa de calor e tabela de canais.
- **Veredicto do utilizador:** «assim tá bom», mais os pedidos seguintes, todos já incluídos no protótipo:
  - as barras do dia são clicáveis e mostram o dia em detalhe, com o volume e o n.º de vendas por hora;
  - a hora de pico e a hora fraca mostram quantas vendas houve;
  - a previsão é feita com IA a partir dos dias fracos e fortes, só para o mês atual;
  - o gráfico diário mostra a linha do mês anterior;
  - as outras informações também são clicáveis.

  Depois disto: «seguimos com a variante A».

## Open questions

Nenhuma da parte do negócio. A gerência decidiu (2026-11-21) seguir sem a sessão de perguntas técnicas: as decisões de implementação ficam a cargo de quem constrói, dentro das regras acima.

Notas para quem constrói:
- **Canal «Apps» no ano anterior:** no ano anterior, «Apps» podia ser plataformas faturadas na Vendus; hoje é o delivery próprio. Na comparação mostra-se como está registado, sem tentar separar.
- **Previsão com IA:** só valores agregados por dia e hora são enviados; se a IA falhar, a página mostra os restantes dados sem a previsão.
- **Primeira consulta de «Este ano»** pode demorar até os dias fechados estarem gravados.
