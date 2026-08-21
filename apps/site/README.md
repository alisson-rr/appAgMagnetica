# Site Agenda Magnética

Site comercial da recepção inteligente para autônomos e pequenos negócios.

Execute a partir da raiz do monorepo:

```bash
npm install
npm run dev:site
npm run build:site
npm run lint
```

O formulário usa `VITE_LEAD_WEBHOOK_URL` ou, como alternativa, abre o WhatsApp
configurado em `VITE_WHATSAPP_NUMBER`. Nenhuma credencial privada pode ser usada
no frontend.

Configuração de deploy: selecione `apps/site` como diretório raiz do projeto na
plataforma de hospedagem.
