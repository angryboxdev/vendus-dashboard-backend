# Deploy da API em Staging (gratuito)

Ambiente de teste usando **Render** (tier gratuito), com subdomínio tipo `vendus-dashboard-api-staging.onrender.com`.

## Limitações do plano gratuito Render

- O serviço **adormece após ~15 min** sem pedidos; o primeiro pedido após isso pode demorar ~1 min (cold start).
- **750 horas/mês** grátis (suficiente para staging).
- Disco efémero (nada de ficheiros persistentes no servidor).

## Opção 1: Deploy pelo Dashboard Render (recomendado)

1. **Cria conta** em [render.com](https://render.com) (GitHub login).

2. **New → Web Service** e liga o repositório Git (GitHub/GitLab) deste projeto.

3. Configuração:
   - **Name:** `vendus-dashboard-api-staging` (ou outro).
   - **Region:** Frankfurt (ou o mais próximo).
   - **Branch:** `main` (ou a branch que quiseres para staging).
   - **Runtime:** Node.
   - **Build Command:** `npm ci && npm run build`
   - **Start Command:** `npm run start`
   - **Instance Type:** Free.

4. **Environment** – adiciona as variáveis (obrigatórias para a API):
   - `VENDUS_BASE_URL` – URL base da API Vendus (ex: `https://app.vendus.pt`).
   - `VENDUS_API_KEY` – chave da API Vendus.
   - `SUPABASE_URL` – URL do projeto Supabase.
   - `SUPABASE_ANON_KEY` – chave anon do Supabase.

   O `PORT` é definido automaticamente pelo Render; não é preciso configurar.

5. **Create Web Service**. O primeiro deploy pode levar alguns minutos.

6. A URL fica: `https://<nome-do-serviço>.onrender.com` (ex: `https://vendus-dashboard-api-staging.onrender.com`).

7. Testa: `GET https://<tua-url>.onrender.com/api/health` → `{"ok":true}`.

## Opção 2: Deploy com Blueprint (render.yaml)

Se o teu repositório tiver o ficheiro `render.yaml` na raiz:

1. No Render: **New → Blueprint**.
2. Liga o repo; o Render lê o `render.yaml` e cria o serviço.
3. No dashboard do serviço, em **Environment**, preenche os valores das variáveis que estão com `sync: false` (VENDUS_*, SUPABASE_*).

## Domínio próprio (opcional)

No Render, em **Settings → Custom Domain** podes adicionar um domínio teu (ex: `api-staging.seudominio.com`) e apontar o CNAME. O SSL é gerido pelo Render. No plano gratuito isto funciona.

## Variáveis de ambiente – resumo

| Variável           | Obrigatória | Descrição                          |
|--------------------|------------|------------------------------------|
| `VENDUS_BASE_URL`  | Sim        | Base URL da API Vendus             |
| `VENDUS_API_KEY`   | Sim        | API key Vendus                     |
| `SUPABASE_URL`     | Sim*       | URL do projeto Supabase            |
| `SUPABASE_ANON_KEY`| Sim*       | Anon key Supabase                  |
| `PORT`             | Não        | Definido pelo Render               |

\* Necessárias para endpoints que usam Supabase (pizzas, stock, relatórios, etc.). Sem elas, apenas rotas que não usam BD podem funcionar.

## CORS

A API usa `cors()` sem restrição de origem. Para staging está ok. Para produção, convém restringir `origin` no código (ex: lista de domínios permitidos).

## Troubleshooting

- **502 Bad Gateway:** O serviço pode estar a acordar (espera ~1 min e volta a tentar).
- **Build falha:** Confirma que `npm run build` corre localmente (`npm run build`).
- **Erro "Missing env var":** Verifica que todas as variáveis obrigatórias estão definidas no Render (Environment).
