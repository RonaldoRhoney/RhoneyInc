-- ============================================================
-- RHONEYINC — SCHEMA SUPABASE (v2 — corrigido)
-- Rode este arquivo inteiro no SQL Editor do seu projeto Supabase
-- (Supabase Dashboard → SQL Editor → New query → colar → Run)
--
-- v2: corrige um bug de recursão infinita nas policies de admin
-- (testado e validado num Postgres real antes desta versão).
-- ============================================================

-- ============================================================
-- 1. EXTENSÕES
-- ============================================================
create extension if not exists "uuid-ossp";

-- ============================================================
-- 2. TABELA: profiles
-- Estende auth.users com dados públicos/controlados do app.
-- ============================================================
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  nome text not null,
  email text not null,
  role text not null default 'user' check (role in ('user', 'admin')),
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

-- ============================================================
-- 3. FUNÇÃO is_admin()
-- IMPORTANTE: "security definer" faz essa função rodar com
-- privilégios do dono (que ignora RLS), evitando que a checagem
-- de "sou admin?" reative a própria política de RLS de profiles
-- e cause recursão infinita.
-- ============================================================
create or replace function public.is_admin()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'admin'
  );
$$;

-- ============================================================
-- 4. POLICIES: profiles
-- ============================================================
create policy "profiles_select_own"
  on public.profiles for select
  using (auth.uid() = id);

create policy "profiles_update_own"
  on public.profiles for update
  using (auth.uid() = id);

create policy "profiles_select_admin"
  on public.profiles for select
  using (public.is_admin());

-- Admin pode alterar o role de qualquer perfil (promover/remover admin)
create policy "profiles_update_admin"
  on public.profiles for update
  using (public.is_admin());

-- Inserção do perfil acontece via trigger (abaixo), não direto pelo cliente.

-- ============================================================
-- 5. TRIGGER: cria profile automaticamente ao criar usuário
-- ============================================================
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, nome, email, role)
  values (
    new.id,
    -- 'nome' vem do nosso form de cadastro; 'full_name'/'name' vêm do
    -- Google/Apple/GitHub via OAuth — cobre os dois casos
    coalesce(new.raw_user_meta_data->>'nome', new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name', split_part(new.email, '@', 1)),
    new.email,
    -- rhoneyinc@gmail.com é sempre promovido a admin automaticamente,
    -- não importa se o cadastro foi por e-mail/senha ou por OAuth
    case when new.email = 'rhoneyinc@gmail.com' then 'admin' else 'user' end
  );
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- ============================================================
-- 6. TABELA: partner_proposals
-- Propostas recebidas pelo formulário "Tem interesse em parceria?"
-- ============================================================
create table if not exists public.partner_proposals (
  id uuid primary key default uuid_generate_v4(),
  nome text not null,
  empresa text not null,
  email text not null,
  tipo text not null check (tipo in ('Parceiro de tecnologia', 'Patrocínio de marca', 'Programa de afiliados', 'Outro')),
  mensagem text not null,
  status text not null default 'pendente' check (status in ('pendente', 'aprovado', 'rejeitado')),
  created_at timestamptz not null default now()
);

alter table public.partner_proposals enable row level security;

-- Qualquer pessoa (mesmo anônima) pode enviar uma proposta
create policy "proposals_insert_public"
  on public.partner_proposals for insert
  with check (true);

-- Só admin pode ver e gerenciar propostas
create policy "proposals_select_admin"
  on public.partner_proposals for select
  using (public.is_admin());

create policy "proposals_update_admin"
  on public.partner_proposals for update
  using (public.is_admin());

create policy "proposals_delete_admin"
  on public.partner_proposals for delete
  using (public.is_admin());

-- ============================================================
-- 7. TABELA: partners
-- Parceiros já aprovados, exibidos publicamente no grid do site.
-- ============================================================
create table if not exists public.partners (
  id uuid primary key default uuid_generate_v4(),
  nome text not null,
  tipo text not null check (tipo in ('Parceiro de tecnologia', 'Patrocínio de marca', 'Programa de afiliados', 'Outro')),
  descricao text,
  link_url text,
  logo_url text,
  ativo boolean not null default true,
  ordem int not null default 0,
  created_at timestamptz not null default now()
);

alter table public.partners enable row level security;

-- Qualquer um (inclusive anônimo) pode VER parceiros ativos — é conteúdo público do site
create policy "partners_select_public"
  on public.partners for select
  using (ativo = true);

-- Admin vê todos (inclusive inativos) e gerencia
create policy "partners_select_admin"
  on public.partners for select
  using (public.is_admin());

create policy "partners_insert_admin"
  on public.partners for insert
  with check (public.is_admin());

create policy "partners_update_admin"
  on public.partners for update
  using (public.is_admin());

create policy "partners_delete_admin"
  on public.partners for delete
  using (public.is_admin());

-- ============================================================
-- 7B. TABELA: cursos
-- Conteúdo da seção "Cursos" — curadoria manual pelo painel admin (não
-- existe uma API pública equivalente à da Remotive/vagas pra "cursos de
-- tecnologia" com qualidade confiável, então isso não é sincronizado por
-- cron; é você que adiciona/edita/remove quando encontrar algo bom).
-- ============================================================
create table if not exists public.cursos (
  id uuid primary key default uuid_generate_v4(),
  titulo text not null,
  categoria text not null,
  preco_tipo text not null default 'gratuito' check (preco_tipo in ('gratuito', 'pago_variavel')),
  descricao text,
  url text not null,
  ordem int not null default 0,
  ativo boolean not null default true,
  created_at timestamptz not null default now()
);

alter table public.cursos enable row level security;

-- Qualquer um (inclusive anônimo) vê os cursos ativos — é conteúdo público do site
create policy "cursos_select_public"
  on public.cursos for select
  using (ativo = true);

-- Admin vê todos (inclusive inativos) e gerencia
create policy "cursos_select_admin"
  on public.cursos for select
  using (public.is_admin());

create policy "cursos_insert_admin"
  on public.cursos for insert
  with check (public.is_admin());

create policy "cursos_update_admin"
  on public.cursos for update
  using (public.is_admin());

create policy "cursos_delete_admin"
  on public.cursos for delete
  using (public.is_admin());

-- Seed com o conteúdo que já estava hardcoded no HTML
insert into public.cursos (titulo, categoria, preco_tipo, descricao, url, ordem)
select * from (values
  ('freeCodeCamp', 'Programação', 'gratuito', 'Currículo completo de programação, do zero ao avançado, com certificados gratuitos.', 'https://www.freecodecamp.org/', 0),
  ('The Odin Project', 'Programação', 'gratuito', 'Trilha completa de desenvolvimento web full-stack, open source e orientada a projetos.', 'https://www.theodinproject.com/', 1),
  ('CS50 — Harvard', 'Programação', 'gratuito', 'Introdução à ciência da computação da Universidade Harvard — a base que muita gente da área começou.', 'https://cs50.harvard.edu/x/', 2),
  ('DeepLearning.AI', 'Dados & IA', 'pago_variavel', 'Cursos de machine learning e IA generativa criados por Andrew Ng, referência mundial na área.', 'https://www.deeplearning.ai/', 3),
  ('Kaggle Learn', 'Dados & IA', 'gratuito', 'Micro-cursos práticos de dados e IA, direto no navegador, sem instalar nada.', 'https://www.kaggle.com/learn', 4),
  ('AWS Skill Builder', 'Cloud & DevOps', 'gratuito', 'Treinamento oficial da AWS em nuvem, com centenas de cursos gratuitos.', 'https://skillbuilder.aws/', 5),
  ('Microsoft Learn', 'Cloud & DevOps', 'gratuito', 'Trilhas oficiais da Microsoft em Azure, DevOps e desenvolvimento, com certificação.', 'https://learn.microsoft.com/training/', 6),
  ('Nielsen Norman Group', 'Produto & Design', 'pago_variavel', 'A referência mundial em UX Research e usabilidade, com cursos práticos e certificação.', 'https://www.nngroup.com/courses/', 7),
  ('Alura', 'Plataformas brasileiras', 'pago_variavel', 'A maior plataforma brasileira de cursos de tecnologia, com trilhas completas em português.', 'https://www.alura.com.br/', 8),
  ('Rocketseat', 'Plataformas brasileiras', 'pago_variavel', 'Formações intensivas em desenvolvimento, com forte comunidade brasileira por trás.', 'https://www.rocketseat.com.br/', 9)
) as seed(titulo, categoria, preco_tipo, descricao, url, ordem)
where not exists (select 1 from public.cursos);

-- ============================================================
-- 8. TABELA: softwares
-- Conteúdo da seção "O que estamos construindo" — editável pelo
-- painel admin, sem precisar mexer no HTML.
-- ============================================================
create table if not exists public.softwares (
  id uuid primary key default uuid_generate_v4(),
  nome text not null,
  descricao text not null,
  status text not null default 'em_desenvolvimento' check (status in ('disponivel', 'em_desenvolvimento')),
  plataforma text not null default 'WEB',
  link_url text,
  ativo boolean not null default true,
  ordem int not null default 0,
  created_at timestamptz not null default now()
);

alter table public.softwares enable row level security;

-- Qualquer um (inclusive anônimo) vê os softwares ativos — é conteúdo público do site
create policy "softwares_select_public"
  on public.softwares for select
  using (ativo = true);

-- Admin vê todos (inclusive inativos) e gerencia
create policy "softwares_select_admin"
  on public.softwares for select
  using (public.is_admin());

create policy "softwares_insert_admin"
  on public.softwares for insert
  with check (public.is_admin());

create policy "softwares_update_admin"
  on public.softwares for update
  using (public.is_admin());

create policy "softwares_delete_admin"
  on public.softwares for delete
  using (public.is_admin());

-- Seed com o conteúdo que já está no HTML hoje
insert into public.softwares (nome, descricao, status, plataforma, ordem)
select * from (values
  ('MeuPet', 'Rede social para tutores de pets: carteirinha digital, feed com ranking, adoção responsável e petshops perto de você. O primeiro produto RhoneyInc no ar.', 'disponivel', 'WEB · PWA', 0),
  ('FitNow', 'App de fitness inclusivo de verdade: biblioteca de treinos, receitas, comunidade e planilhas para baixar. Pensado para todo tipo de corpo e rotina.', 'em_desenvolvimento', 'WEB · MOBILE', 1),
  ('Controle Financeiro', 'Organize gastos, metas e relatórios com a TipsMoney, assistente de IA, e uma seção de educação financeira pensada para o brasileiro comum.', 'em_desenvolvimento', 'WEB · MOBILE', 2)
) as seed(nome, descricao, status, plataforma, ordem)
where not exists (select 1 from public.softwares);

-- ============================================================
-- 9. TABELA: page_views
-- Log de acessos ao site (visitantes anônimos): página, dispositivo,
-- navegador e localização aproximada (por IP, via headers da Vercel).
-- Nunca armazena IP bruto, nome ou qualquer dado identificável.
-- ============================================================
create table if not exists public.page_views (
  id uuid primary key default uuid_generate_v4(),
  path text not null,
  device text not null default 'desktop' check (device in ('mobile', 'tablet', 'desktop')),
  browser text,
  country text,
  region text,
  city text,
  referrer text,
  created_at timestamptz not null default now()
);

alter table public.page_views enable row level security;

-- Só admin lê os dados agregados. Não existe policy de insert pra
-- ninguém: a gravação acontece só pela função serverless api/track.js,
-- autenticada com a service_role key (que ignora RLS por completo) —
-- assim o navegador do visitante nunca tem permissão de escrever
-- direto na tabela, evitando spam/forjar registros.
create policy "page_views_select_admin"
  on public.page_views for select
  using (public.is_admin());

create index if not exists page_views_created_at_idx on public.page_views (created_at desc);

-- ============================================================
-- 10. TABELA: vagas
-- Vagas de tecnologia agregadas de APIs públicas de terceiros (ex: Remotive)
-- e exibidas na seção "Vagas" do site. A RhoneyInc não é a contratante, não
-- recebe candidaturas — cada card redireciona pro LinkedIn (link original,
-- se já for do domínio linkedin.com, ou uma busca gerada por título+empresa).
-- Sincronizada por um cron da Vercel (api/sync-vagas.js) a cada poucas
-- horas, nunca direto da API a cada page load do site.
-- ============================================================
create table if not exists public.vagas (
  id uuid primary key default uuid_generate_v4(),
  titulo text not null,
  empresa text not null,
  localizacao text,
  categoria text not null,
  descricao_resumo text,
  url_original text not null,
  url_linkedin text,
  fonte_api text not null default 'remotive',
  fonte_id text not null,
  data_publicacao timestamptz,
  data_sincronizacao timestamptz not null default now()
);

-- Evita duplicar a mesma vaga da mesma fonte a cada sincronização (upsert
-- por fonte_api + fonte_id, não pelo id interno).
create unique index if not exists vagas_fonte_idx on public.vagas (fonte_api, fonte_id);
create index if not exists vagas_categoria_idx on public.vagas (categoria);
create index if not exists vagas_data_publicacao_idx on public.vagas (data_publicacao desc);

alter table public.vagas enable row level security;

-- Leitura pública: é conteúdo informativo do site, sem dado sensível.
create policy "vagas_select_public"
  on public.vagas for select
  using (true);

-- Sem policy de insert/update/delete: só a service_role key (usada pelo
-- cron em api/sync-vagas.js) escreve aqui — ninguém grava vaga forjada
-- direto pela API pública.

-- ============================================================
-- 11. ADMIN
-- ============================================================
-- rhoneyinc@gmail.com já é promovido a admin automaticamente pelo
-- trigger handle_new_user() acima, no momento do cadastro (e-mail/senha,
-- Google, GitHub ou Apple — não importa o método).
--
-- Se essa conta já existia ANTES desta versão do schema (ou se quiser
-- promover outro e-mail no futuro), rode manualmente:
--
-- update public.profiles set role = 'admin' where email = 'rhoneyinc@gmail.com';
--
-- ============================================================
