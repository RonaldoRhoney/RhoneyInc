# RhoneyInc

Site institucional da RhoneyInc — estúdio de engenharia de software fundado em
Belém, PA. HTML/CSS/JS estático, sem build step, com um painel admin embutido
(Supabase) e um punhado de funções serverless na Vercel.

🔗 Produção: [rhoneyinc.com](https://rhoneyinc.com)

## Stack

- HTML/CSS/JS puro (sem framework, sem bundler)
- [Supabase](https://supabase.com) — auth (email/senha + social), banco Postgres com RLS, tabelas de parceiros/propostas/softwares/cursos
- Funções serverless na Vercel (`api/`) para tudo que precisa da `service_role key` (nunca exposta no client)
- Deploy via `vercel --prod` (não é gatilho automático por push — ver `SETUP.md`)

## Estrutura

```
index.html        Página principal (hero, softwares, processo, stack, parceiros, vagas, cursos, sobre, painel admin)
app.js            Lógica pública: auth, i18n (PT/EN/ES), softwares dinâmicos, vagas, cursos, gráficos do admin
admin.js          Painel admin: métricas, analytics de acesso, gestão de parceiros/propostas/cursos/usuários
supabase-client.js Inicialização do client Supabase (URL + anon key, públicas por design)
schema.sql        Schema do banco (tabelas + RLS policies), para referência/reprodução
api/
  analytics-summary.js  Resumo de acessos (dispositivos, navegadores, países, cidades) — usa service_role key
  metrics-meupet.js      Métricas cross-produto do MeuPet, exibidas no admin
  sync-vagas.js          Cron diário: agrega vagas remotas (Remotive) pro Supabase
  track.js               Registra um acesso anônimo (sem cookies, sem IP salvo)
assets/           Ícones dos produtos do ecossistema (SVG)
changelog.html, termos.html, privacidade.html  Páginas legais/institucionais
```

## Rodando localmente

Como não há build step, basta servir os arquivos estáticos:

```bash
python3 -m http.server 8000
```

As funções em `api/` só rodam de fato via `vercel dev` ou em produção (dependem de env vars da Vercel — ver `SETUP.md`).

## Variáveis de ambiente

Configuradas na Vercel, nunca commitadas:

- `RHONEYINC_SUPABASE_URL` / `RHONEYINC_SERVICE_ROLE_KEY`
- `MEUPET_SUPABASE_URL` / `MEUPET_SERVICE_ROLE_KEY`

Detalhes de setup (OAuth social, Supabase, cron) em `SETUP.md`.

## Deploy

```bash
vercel --prod
```

O projeto já está linkado ao Vercel (`.vercel/`, git-ignorado). Deploy é manual, não por push — ver nota em `SETUP.md`.
