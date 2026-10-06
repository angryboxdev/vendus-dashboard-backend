Status: in-progress (backend feito)
Blocked by: 01

# Teste no telemóvel

Backend: origens CORS extra por env (`CORS_EXTRA_ORIGINS`, lista). Frontend dev: `VITE_API_URL` vazio para usar o proxy `/api`; Vite `server.host` + `allowedHosts` para o túnel. Guia: instalar `cloudflared` no PC, `cloudflared tunnel --url http://localhost:5173`, abrir o URL https no telemóvel, "Adicionar ao ecrã principal". Coordenadas do Mercado Bom Sucesso definidas no Local.
