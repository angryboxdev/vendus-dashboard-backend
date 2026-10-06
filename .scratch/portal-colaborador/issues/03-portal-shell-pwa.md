Status: in-progress (backend feito)
Blocked by: 02

# Portal: estrutura, Início e PWA

Módulo `employee-portal` (back+front). `GET /api/me` (nome curto, local, próximo turno publicado, estado da picagem de hoje, política GPS do local). Rota `/portal/*` fora do layout de gestão, navegação inferior Início | Escala | Documentos | Ausências | Perfil. Início: próximo turno, estado, botão principal. PWA sem dependências: `manifest.webmanifest` (scope `/portal`), ícones (logo 512 px a fornecer), service worker mínimo (sem cache de picagem). Safe-area e `theme-color`.
