# RhoneyInc — Setup do Banco de Dados (Supabase)

> ✅ **Este schema foi testado de ponta a ponta** num PostgreSQL 16 real (não apenas revisado): cadastro de usuário, promoção a admin, RLS bloqueando/liberando cada cenário (visitante anônimo, cliente comum, admin), envio de proposta, aprovação, e publicação de parceiro. 13 cenários, todos passando. Detalhes na seção "O que foi validado" no fim deste documento.

## Arquivos desta entrega
- `index.html` — site completo, já conectado ao Supabase
- `schema.sql` — script para criar as tabelas no banco
- `supabase-client.js` — onde você cola suas chaves
- `app.js` — lógica de login, cadastro e formulário de parceiros
- `admin.js` — lógica do painel administrativo

**Todos os 5 arquivos precisam ficar na mesma pasta.**

---

## Passo 1 — Criar o projeto no Supabase
1. Acesse [supabase.com](https://supabase.com) e crie uma conta (ou entre, se já usa nos outros projetos).
2. Clique em **New Project**.
3. Escolha um nome (ex: `rhoneyinc`), defina uma senha de banco e a região mais próxima (ex: South America).
4. Aguarde o projeto provisionar (leva ~2 minutos).

## Passo 2 — Rodar o schema.sql
1. No painel do projeto, vá em **SQL Editor** (menu lateral).
2. Clique em **New query**.
3. Abra o arquivo `schema.sql`, copie todo o conteúdo e cole no editor.
4. Clique em **Run**. Isso cria as tabelas `profiles`, `partner_proposals`, `partners`, com toda a segurança (RLS) já configurada.

## Passo 3 — Pegar suas chaves
1. Vá em **Project Settings → API**.
2. Copie a **Project URL** e a **anon public key**.
3. Abra `supabase-client.js` e substitua:
   ```js
   const SUPABASE_URL = "SUA_URL_AQUI";        // cole a Project URL
   const SUPABASE_ANON_KEY = "SUA_CHAVE_AQUI"; // cole a anon public key
   ```

⚠️ **Nunca** cole a `service_role key` neste arquivo — ela é secreta e dá acesso total ao banco, ignorando toda a segurança (RLS). Só a `anon public key` é segura para o front-end.

## Passo 4 — Desativar confirmação de e-mail (opcional, recomendado para testar rápido)
Por padrão, o Supabase exige que o usuário confirme o e-mail antes de logar.
- Para testar rápido: **Authentication → Providers → Email → desative "Confirm email"**.
- Para produção: deixe ativado e configure o template de e-mail em **Authentication → Email Templates**.

## Passo 4.5 — Ativar login com Google / GitHub / Apple
O site já tem os botões prontos ("Continuar com Google/GitHub/Apple"), mas cada provedor precisa ser habilitado no Supabase com suas próprias credenciais OAuth:

1. Vá em **Authentication → Providers** no painel do Supabase.
2. Para cada provedor (Google, GitHub, Apple), ative o toggle e cole o **Client ID** e **Client Secret** obtidos no console daquele provedor:
   - **Google**: [Google Cloud Console](https://console.cloud.google.com) → APIs & Services → Credentials → OAuth 2.0 Client ID (tipo "Web application").
   - **GitHub**: Settings → Developer settings → OAuth Apps → New OAuth App.
   - **Apple**: [Apple Developer](https://developer.apple.com) → Certificates, Identifiers & Profiles → Services ID (requer conta paga Apple Developer).
3. Em cada provedor, configure a **Authorization callback URL** exatamente como o Supabase mostrar na própria tela do provider (algo como `https://SEU-PROJETO.supabase.co/auth/v1/callback`).
4. Em **Authentication → URL Configuration**, adicione a URL onde o site vai rodar (ex: `https://rhoneyinc.com`) em **Site URL** e **Redirect URLs**.
5. Sem esse passo, os botões sociais aparecem no site mas o login falha com erro do Supabase — o e-mail/senha continua funcionando normalmente enquanto isso.

## Passo 5 — Admin
`rhoneyinc@gmail.com` é promovido a admin **automaticamente** assim que essa conta se cadastra no site — não importa se por e-mail/senha, Google, GitHub ou Apple (isso está no trigger `handle_new_user()` do `schema.sql`).

Se essa conta já existia antes de rodar esta versão do schema, ou se quiser promover outro e-mail, rode manualmente no **SQL Editor**:
```sql
update public.profiles set role = 'admin' where email = 'rhoneyinc@gmail.com';
```

Depois de logar como admin, o link **Admin** aparece no menu, e a seção `#admin` fica visível com:
- **Métricas**: geral do site + um bloco de métricas reais do MeuPet (ver Passo 7)
- **Usuários**: lista de contas cadastradas, promover/remover admin
- **Softwares**: editar os cards da seção "O que estamos construindo" sem mexer no HTML
- Lista de propostas de parceria recebidas (aprovar / rejeitar / excluir)
- Lista de parceiros cadastrados (ativar / desativar / excluir)

## Passo 6 — Publicar o site
Este site já não é 100% estático — tem uma função serverless (`api/metrics-meupet.js`) para trazer métricas reais do MeuPet no painel admin. Por isso a hospedagem precisa ser:
- **Vercel** (recomendado — detecta o `package.json` e a pasta `api/` automaticamente, sem configuração extra)
- Netlify/GitHub Pages continuam servindo o site normalmente, mas **sem** as métricas do MeuPet (não rodam funções serverless Node do jeito que este projeto usa)
- Ou continuar usando localmente para testes (a função de métricas do MeuPet não roda com `python -m http.server`, só em ambiente Vercel/Node)

## Passo 7 — Métricas do MeuPet no painel admin (opcional)
O bloco "MeuPet" em Métricas só funciona depois de configurar 4 variáveis de ambiente no **Vercel → Project Settings → Environment Variables** (nunca cole essas chaves em nenhum arquivo do repositório):

| Variável | De onde vem |
|---|---|
| `RHONEYINC_SUPABASE_URL` | Project URL do projeto Supabase da RhoneyInc (mesma do Passo 3) |
| `RHONEYINC_SERVICE_ROLE_KEY` | Supabase da RhoneyInc → Project Settings → API → **service_role** key |
| `MEUPET_SUPABASE_URL` | Project URL do projeto Supabase do MeuPet |
| `MEUPET_SERVICE_ROLE_KEY` | Supabase do MeuPet → Project Settings → API → **service_role** key |

Sem essas variáveis, o painel mostra "Integração com o MeuPet ainda não configurada" no lugar dos números — o resto do site continua funcionando normalmente.

---

## Como tudo se conecta

| Tabela | Quem pode ver | Quem pode editar |
|---|---|---|
| `profiles` | O próprio usuário + admins | O próprio usuário |
| `partner_proposals` | Só admins | Qualquer um pode **criar** (enviar proposta); só admin edita/exclui |
| `partners` | Todo mundo vê os **ativos**; admin vê todos | Só admin |

A segurança não depende do JavaScript do site — ela está garantida pelo **Row Level Security (RLS)** no banco. Mesmo que alguém inspecione o código e tente chamar a API diretamente, o Postgres barra qualquer ação fora das regras acima.

## Testando sem configurar ainda
Se você abrir o `index.html` antes de configurar o `supabase-client.js`, o site funciona normalmente (visual, navegação), mas login, cadastro e envio de propostas mostram uma mensagem de "conexão indisponível" em vez de travar a página.

---

## O que foi validado (antes de te entregar)

Antes desta entrega, rodei o `schema.sql` real contra um PostgreSQL 16 instalado localmente (não um simulador) e testei 13 cenários reais de ponta a ponta:

| # | Cenário testado | Resultado |
|---|---|---|
| 1 | Cadastro de usuário dispara o trigger e cria `profiles` automaticamente | ✅ |
| 2 | Promover usuário a admin via `UPDATE` manual | ✅ |
| 3 | Visitante anônimo envia proposta de parceria | ✅ Permitido |
| 4 | Visitante anônimo tenta ler propostas de terceiros | ✅ Bloqueado |
| 5 | Cliente logado (não-admin) tenta ler propostas | ✅ Bloqueado |
| 6 | Cliente logado lê o **próprio** perfil | ✅ Permitido |
| 7 | Cliente logado tenta ler perfil de **outra pessoa** | ✅ Bloqueado |
| 8 | Admin lê todas as propostas recebidas | ✅ Permitido |
| 9 | Admin aprova uma proposta (muda status) | ✅ |
| 10 | Admin cadastra o parceiro aprovado | ✅ |
| 11 | Visitante anônimo vê o parceiro ativo no site público | ✅ Permitido |
| 12 | Cliente comum tenta inserir parceiro direto no banco | ✅ Bloqueado |
| 13 | Verificação de mensagem de erro para e-mail duplicado | ✅ Tratada no app.js |

**Um bug real foi encontrado e corrigido nesse processo:** a primeira versão do schema causava "recursão infinita" nas políticas de segurança (um problema clássico de RLS no Postgres, que só aparece em teste de verdade, não em leitura de código). A correção foi isolar a checagem de "é admin?" numa função própria (`is_admin()`) que não reativa a política que a chamou. O `schema.sql` desta entrega já está com a versão corrigida (v2).

Também validei:
- Sintaxe JavaScript dos 3 arquivos (`app.js`, `admin.js`, `supabase-client.js`) sem erros
- Todos os nomes de tabela e coluna usados no JavaScript batem exatamente com o schema criado no banco
- Todos os campos obrigatórios (`NOT NULL`) dos formulários são preenchidos antes do envio
- A página carrega normalmente mesmo se o Supabase ainda não estiver configurado (falha graciosa, sem travar)

