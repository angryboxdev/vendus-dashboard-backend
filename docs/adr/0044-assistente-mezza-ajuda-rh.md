# Assistente Mezza: ajuda do RH («como faço…?») a partir de um guia curado

Decidido em 2026-11-20 (pedido: «quero que a IA também responda a dúvidas
como "como posso criar um funcionário novo?" sobre os recursos humanos»).
Complementa o ADR-0038.

## Contexto

O Assistente Mezza só existia dentro de uma escala e só sabia consultar e
alterar turnos. As pessoas também querem perguntar como usar o RH (criar
colaborador, pedir férias, corrigir picagens…), em qualquer ecrã. Uma IA
sem fonte inventa menus e botões que não existem.

## Decisões

- **Guia curado no domínio** (`domain/services/help-articles.ts`): artigos
  com título, palavras-chave, rota do ecrã, passos e notas, escritos a partir
  dos ecrãs reais do frontend (com os rótulos exatos). Pesquisa pura sem
  acentos/plurais (`help-guide.ts`); sem correspondência → lista vazia.
  Alternativas rejeitadas: deixar a IA responder «de cabeça» (inventa) e
  pesquisa semântica com embeddings (nova dependência e infraestrutura para
  um guia de dezenas de artigos).
- **A IA só responde com o guia**: ferramenta `QUERY_HELP` (só leitura);
  instruções obrigam a passos curtos com os nomes dos artigos e, sem artigo,
  «Ainda não tenho essa resposta no guia do RH.». As fontes devolvidas ao
  ecrã são as que o servidor deu à IA (determinístico), com atalho para o ecrã.
- **Modo ajuda separado**: `POST /api/novo-rh/assistant/help` (+
  `GET …/help/status`) só oferece `QUERY_HELP` — sem dados de colaboradores,
  sem escritas, sem Idempotency-Key (não há efeitos). Acesso `base` (qualquer
  utilizador da área de gestão), em vez de `hr.schedules` READ. O Colaborador
  (Portal) fica de fora por agora.
- **Dentro da escala** o assistente também tem `QUERY_HELP`, por isso a bolinha
  de Escalas responde às duas coisas; noutros ecrãs do RH aparece a bolinha da
  ajuda (o frontend esconde-a em Escalas para não haver duas).
- **Manutenção**: quando um ecrã muda (rótulo, botão, fluxo), o artigo
  correspondente muda no mesmo PR. Há um teste que garante ids únicos, passos e
  rotas do RH, e que as perguntas mais comuns encontram o artigo certo.

## Consequências

- Respostas tão boas quanto o guia: o que não estiver escrito não é respondido.
- Custo: uma a três chamadas ao modelo por pergunta, como no assistente da escala.
- Não dá aconselhamento jurídico/laboral; remete para o responsável de RH.
