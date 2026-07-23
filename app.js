// ============================================================
// RHONEYINC — APP.JS
// Lógica de autenticação, sessão e formulário de parceiros.
// Depende de supabase-client.js estar carregado antes deste arquivo.
// ============================================================

function clienteDisponivel(){
  return typeof supabaseClient !== 'undefined' && supabaseClient !== null;
}

// Diferencia "ainda não configurado" (dev/teste local, veja SETUP.md) de
// uma indisponibilidade real do banco em produção — mensagens diferentes
// evitam que quem está testando ache que é um bug.
function mensagemBancoIndisponivel(){
  if(typeof SUPABASE_CONFIGURADO !== 'undefined' && !SUPABASE_CONFIGURADO){
    return 'O Supabase ainda não foi configurado neste ambiente (veja o SETUP.md). Login, cadastro e parceiros ficam indisponíveis até isso ser feito.';
  }
  return 'Conexão com o banco indisponível no momento. Tente novamente mais tarde.';
}

// ---------- MODAL LOGIN/CADASTRO ----------
function openModal(tipo){
  document.getElementById('modalOverlay').classList.add('open');
  switchTo(tipo);
  clearAuthError();
}
function closeModal(){
  document.getElementById('modalOverlay').classList.remove('open');
  clearAuthError();
}
function switchTo(tipo){
  document.getElementById('modalLogin').style.display = tipo === 'login' ? 'block' : 'none';
  document.getElementById('modalCadastro').style.display = tipo === 'cadastro' ? 'block' : 'none';
  clearAuthError();
}
function clearAuthError(){
  document.querySelectorAll('.auth-error').forEach(el => { el.textContent = ''; el.style.display = 'none'; });
}
function showAuthError(formId, msg){
  const el = document.querySelector('#' + formId + ' .auth-error');
  if(el){ el.textContent = msg; el.style.display = 'block'; }
}

// ---------- LOGIN SOCIAL (Google / GitHub / Apple) ----------
async function entrarComProvider(provider){
  if(!clienteDisponivel()){
    alert(mensagemBancoIndisponivel());
    return;
  }
  const { error } = await supabaseClient.auth.signInWithOAuth({
    provider,
    options: { redirectTo: window.location.origin + window.location.pathname }
  });
  if(error){
    alert('Não foi possível iniciar o login com ' + provider + '. Tente novamente.');
  }
}

document.addEventListener('DOMContentLoaded', function(){
  const overlay = document.getElementById('modalOverlay');
  if(overlay){
    overlay.addEventListener('click', function(e){
      if(e.target === this) closeModal();
    });
  }
  document.addEventListener('keydown', function(e){
    if(e.key === 'Escape') closeModal();
  });

  // ---------- LOGIN ----------
  const loginForm = document.getElementById('formLogin');
  if(loginForm){
    loginForm.addEventListener('submit', async function(e){
      e.preventDefault();
      clearAuthError();
      if(!clienteDisponivel()){
        showAuthError('modalLogin', mensagemBancoIndisponivel());
        return;
      }
      const email = document.getElementById('login-email').value.trim();
      const senha = document.getElementById('login-senha').value;
      const btn = loginForm.querySelector('button[type="submit"]');
      btn.disabled = true; btn.textContent = 'Entrando...';

      const { data, error } = await supabaseClient.auth.signInWithPassword({ email, password: senha });

      btn.disabled = false; btn.textContent = 'Entrar na conta';

      if(error){
        showAuthError('modalLogin', traduzErro(error.message));
        return;
      }
      closeModal();
      await atualizarEstadoSessao();
    });
  }

  // ---------- CADASTRO ----------
  const cadastroForm = document.getElementById('formCadastro');
  if(cadastroForm){
    cadastroForm.addEventListener('submit', async function(e){
      e.preventDefault();
      clearAuthError();
      if(!clienteDisponivel()){
        showAuthError('modalCadastro', mensagemBancoIndisponivel());
        return;
      }
      const nome = document.getElementById('cad-nome').value.trim();
      const email = document.getElementById('cad-email').value.trim();
      const senha = document.getElementById('cad-senha').value;
      const btn = cadastroForm.querySelector('button[type="submit"]');

      if(senha.length < 6){
        showAuthError('modalCadastro', 'A senha precisa ter no mínimo 6 caracteres.');
        return;
      }

      btn.disabled = true; btn.textContent = 'Criando conta...';

      const { data, error } = await supabaseClient.auth.signUp({
        email,
        password: senha,
        options: { data: { nome: nome } }
      });

      btn.disabled = false; btn.textContent = 'Criar minha conta';

      if(error){
        showAuthError('modalCadastro', traduzErro(error.message));
        return;
      }

      if(data.session){
        // Confirmação de e-mail desativada no projeto: já entra logado
        closeModal();
        await atualizarEstadoSessao();
      } else {
        // Confirmação de e-mail ativada: avisa para checar a caixa de entrada
        showAuthError('modalCadastro', 'Conta criada! Verifique seu e-mail para confirmar o cadastro antes de entrar.');
      }
    });
  }

  // ---------- FORMULÁRIO DE PARCERIA ----------
  const parceriaForm = document.getElementById('formParceria');
  if(parceriaForm){
    parceriaForm.addEventListener('submit', async function(e){
      e.preventDefault();
      const btn = parceriaForm.querySelector('button[type="submit"]');
      const feedback = document.getElementById('parceria-feedback');
      feedback.textContent = ''; feedback.className = 'form-note';

      if(!clienteDisponivel()){
        feedback.textContent = mensagemBancoIndisponivel();
        feedback.style.color = '#E07A5F';
        return;
      }

      const payload = {
        nome: document.getElementById('p-nome').value.trim(),
        empresa: document.getElementById('p-empresa').value.trim(),
        email: document.getElementById('p-email').value.trim(),
        tipo: document.getElementById('p-tipo').value,
        mensagem: document.getElementById('p-msg').value.trim()
      };

      btn.disabled = true; btn.textContent = 'Enviando...';

      const { error } = await supabaseClient.from('partner_proposals').insert(payload);

      btn.disabled = false; btn.textContent = 'Enviar proposta';

      if(error){
        feedback.textContent = 'Não foi possível enviar agora. Tente novamente em instantes.';
        feedback.style.color = '#E07A5F';
        console.error(error);
        return;
      }

      parceriaForm.reset();
      feedback.textContent = 'Proposta enviada com sucesso! Responderemos pelo e-mail informado em até 3 dias úteis.';
      feedback.style.color = 'var(--sinal)';
    });
  }

  // ---------- LOGOUT ----------
  document.querySelectorAll('[data-action="logout"]').forEach(btn => {
    btn.addEventListener('click', async function(){
      await supabaseClient.auth.signOut();
      await atualizarEstadoSessao();
      window.location.hash = 'topo';
    });
  });

  // Estado inicial da sessão ao carregar a página
  atualizarEstadoSessao();

  // Mantém a UI sincronizada se a sessão mudar em outra aba
  if(clienteDisponivel()){
    supabaseClient.auth.onAuthStateChange((_event, _session) => {
      atualizarEstadoSessao();
    });
  }
});

function traduzErro(msg){
  const mapa = {
    'Invalid login credentials': 'E-mail ou senha incorretos.',
    'User already registered': 'Já existe uma conta com este e-mail.',
    'Email not confirmed': 'Confirme seu e-mail antes de entrar.',
    'Password should be at least 6 characters': 'A senha precisa ter no mínimo 6 caracteres.'
  };
  return mapa[msg] || msg;
}

// ---------- ESTADO DE SESSÃO (navbar) ----------
async function atualizarEstadoSessao(){
  if(!clienteDisponivel()) return;
  const { data: { session } } = await supabaseClient.auth.getSession();
  const authArea = document.querySelectorAll('.nav-auth');

  if(!session){
    authArea.forEach(area => {
      area.innerHTML = `
        <button class="btn btn-ghost" onclick="openModal('login')">Entrar</button>
        <button class="btn btn-solid" onclick="openModal('cadastro')">Criar conta</button>
      `;
    });
    toggleAdminLink(false);
    return;
  }

  // Busca o perfil (nome + role) na tabela profiles
  const { data: profile } = await supabaseClient
    .from('profiles')
    .select('nome, role')
    .eq('id', session.user.id)
    .single();

  const nomeExibido = profile?.nome || session.user.email.split('@')[0];
  const isAdmin = profile?.role === 'admin';

  authArea.forEach(area => {
    area.innerHTML = `
      <span class="user-chip${isAdmin ? ' is-admin' : ''}">${isAdmin ? '<span class="crown">👑</span>' : ''}<span class="user-chip-name" title="${escapeHtml(nomeExibido)}">${escapeHtml(nomeExibido)}</span></span>
      ${isAdmin ? '<a href="#admin" class="btn btn-ghost">Admin</a>' : ''}
      <button class="btn btn-ghost" data-action="logout">Sair</button>
    `;
  });

  // Reanexa o listener de logout (innerHTML novo perde os handlers antigos)
  document.querySelectorAll('[data-action="logout"]').forEach(btn => {
    btn.addEventListener('click', async function(){
      await supabaseClient.auth.signOut();
      await atualizarEstadoSessao();
      window.location.hash = 'topo';
    });
  });

  toggleAdminLink(isAdmin);
  if(isAdmin && document.getElementById('admin')){
    carregarPainelAdmin();
  }
}

function toggleAdminLink(mostrar){
  document.querySelectorAll('.admin-only').forEach(el => {
    el.style.display = mostrar ? '' : 'none';
  });
}

function escapeHtml(str){
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

// ---------- SOFTWARES PÚBLICOS (grid "O que estamos construindo") ----------
async function carregarSoftwaresPublicos(){
  const container = document.getElementById('softwaresGridDynamic');
  if(!container || !clienteDisponivel()) return;

  const { data: softwares, error } = await supabaseClient
    .from('softwares')
    .select('*')
    .eq('ativo', true)
    .order('ordem', { ascending: true });

  if(error || !softwares || softwares.length === 0){
    return; // mantém os cards estáticos já no HTML
  }

  container.innerHTML = softwares.map(s => {
    const cor = s.cor_acento || '#F2A65A';
    const marca = s.logo_url
      ? `<img src="${escapeHtml(s.logo_url)}" alt="${escapeHtml(s.nome)}" class="soft-icon" loading="lazy" />`
      : `<svg class="soft-icon is-svg-fallback" viewBox="0 0 40 40" fill="none">
          <path d="M20 8L32 20L20 32L8 20Z" stroke="${cor}" stroke-width="2.5" stroke-linejoin="round"/>
        </svg>`;
    const storeBadge = (url, label, iconSvg) => url
      ? `<span class="soft-store-badge" title="Disponível na ${label}" onclick="event.preventDefault(); event.stopPropagation(); window.open('${escapeHtml(url)}', '_blank', 'noopener');">${iconSvg}${label}</span>`
      : '';
    const playIcon = `<svg viewBox="0 0 24 24" width="12" height="12" fill="currentColor"><path d="M3 3.5v17a1 1 0 0 0 1.5.87l14-8.5a1 1 0 0 0 0-1.74l-14-8.5A1 1 0 0 0 3 3.5Z"/></svg>`;
    const appleIcon = `<svg viewBox="0 0 24 24" width="12" height="12" fill="currentColor"><path d="M17.05 12.34c-.03-2.7 2.2-4 2.3-4.06-1.25-1.83-3.2-2.08-3.9-2.11-1.66-.17-3.24 0.98-4.08.98-.84 0-2.14-.95-3.51-.93-1.8.03-3.47 1.05-4.4 2.66-1.88 3.26-.48 8.08 1.34 10.72.9 1.29 1.96 2.74 3.36 2.69 1.35-.05 1.86-.87 3.5-.87 1.64 0 2.1.87 3.53.84 1.46-.02 2.38-1.31 3.27-2.6.99-1.44 1.4-2.85 1.42-2.92-.03-.02-2.71-1.04-2.83-4.1Zm-2.66-7.53c.75-.9 1.25-2.17 1.11-3.43-1.07.04-2.37.72-3.14 1.6-.7.79-1.31 2.07-1.15 3.29 1.19.09 2.42-.6 3.18-1.46Z"/></svg>`;
    const conteudo = `
      <span class="soft-tag" style="color:${cor};">${s.status === 'disponivel' ? 'Disponível agora' : 'Em desenvolvimento'}</span>
      <div class="soft-icon-wrap">${marca}</div>
      <div class="soft-name">${escapeHtml(s.nome)}</div>
      <div class="soft-desc">${escapeHtml(s.descricao)}</div>
      ${(s.link_play_store || s.link_app_store) ? `<div class="soft-stores">
        ${storeBadge(s.link_play_store, 'Play Store', playIcon)}
        ${storeBadge(s.link_app_store, 'App Store', appleIcon)}
      </div>` : ''}
      <div class="soft-foot">
        <span>${escapeHtml(s.plataforma || 'WEB')}</span>
        ${s.link_url ? `<span class="soft-cta">Abrir projeto <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M7 17 17 7M8 7h9v9"/></svg></span>` : ''}
      </div>
    `;
    const classes = `soft-card reveal ${s.status === 'disponivel' ? '' : 'status-dev'}`;
    return s.link_url
      ? `<a class="${classes}" href="${escapeHtml(s.link_url)}" target="_blank" rel="noopener" style="text-decoration:none; --card-accent:${cor};">${conteudo}</a>`
      : `<div class="${classes}" style="--card-accent:${cor};">${conteudo}</div>`;
  }).join('');
  if(typeof iniciarRevealScroll === 'function') iniciarRevealScroll();
}

document.addEventListener('DOMContentLoaded', carregarSoftwaresPublicos);
document.addEventListener('DOMContentLoaded', iniciarSoftCarouselAuto);

// ---------- I18N (PT/EN/ES) ----------
// Cobre navegação, hero, cabeçalhos de seção, CTA final, rodapé e a UI de
// Vagas — o "esqueleto" que qualquer visitante lê primeiro. Parágrafos
// longos (Sobre, disclaimers legais, etapas do Processo, changelog) ficam
// só em PT por enquanto. data-i18n troca textContent; data-i18n-html troca
// innerHTML (só onde há tag inline, como <span class="accent">, dentro).
const I18N = {
  pt: {
    nav_softwares: 'Softwares', nav_processo: 'Processo', nav_stack: 'Stack',
    nav_parceiros: 'Parceiros', nav_vagas: 'Vagas', nav_cursos: 'Cursos', nav_sobre: 'Sobre',
    nav_entrar: 'Entrar', nav_criar_conta: 'Criar conta',
    hero_eyebrow: 'Estúdio de engenharia de software · Belém, PA',
    hero_title: 'Software com <span class="accent">prompt</span><br>e <span class="stroke">produto</span> definidos.',
    hero_sub: 'A RhoneyInc projeta e constrói produtos digitais do zero ao deploy — aplicativos, painéis e ferramentas que resolvem um problema real, com IA generativa, Claude Code e Supabase no centro do processo.',
    hero_cta_criar: 'Criar minha conta', hero_cta_ver: 'Ver softwares →',
    hero_meta_1: 'SOFTWARES NO ECOSSISTEMA', hero_meta_2: 'DESENHADO NO BRASIL', hero_meta_3: 'SEDE · BELÉM',
    soft_eyebrow: 'Linha de produtos', soft_title: 'O que estamos construindo',
    soft_desc: 'Cada software nasce de um problema vivido de perto, não de uma planilha de tendências.',
    proc_eyebrow: 'Método', proc_title: 'Do prompt à entrega',
    proc_desc: 'Quatro etapas, sempre na mesma ordem — com IA generativa acelerando cada uma delas.',
    stack_eyebrow: 'Ferramentas', stack_title: 'Stack que sustenta o produto',
    stack_desc: 'As mesmas peças, montadas de forma diferente para cada problema.',
    modal_eyebrow: 'Modalidades', modal_title: 'Três formas de caminhar com a gente',
    modal_desc: 'Escolha o formato que melhor se encaixa com o seu negócio.',
    parc_eyebrow: 'Hoje', parc_title: 'Parceiros atuais',
    parc_desc: 'A RhoneyInc ainda está formando sua rede de parceiros. Os espaços abaixo serão preenchidos conforme as parcerias forem fechadas.',
    parc_slot_label: 'VAGA<br>DISPONÍVEL',
    parc_nota: 'Nenhuma parceria comercial ativa no momento — esta seção será atualizada assim que houver acordos firmados.',
    cat_eyebrow: 'Categorias abertas', cat_title: 'Onde cabe um link de afiliado',
    cat_desc: 'Categorias relacionadas aos nossos softwares, abertas para propostas.',
    vagas_eyebrow: 'Oportunidades no mercado', vagas_title: 'Vagas de tecnologia',
    vagas_desc: 'Um retorno pra comunidade: vagas remotas reais, agregadas automaticamente, sem intermediar candidatura nenhuma.',
    vagas_banner_cta: 'Ver vagas por categoria',
    cursos_eyebrow: 'Estude de graça', cursos_title: 'CURSOS',
    cursos_desc: 'Uma seleção de cursos reais e gratuitos (ou com opção gratuita) das melhores referências em tecnologia — sem cadastro na RhoneyInc, direto pra fonte.',
    cursos_banner_cta: 'Ver cursos por categoria',
    cursos_cat_programacao: 'Programação', cursos_cat_dados_ia: 'Dados & IA', cursos_cat_cloud: 'Cloud & DevOps',
    cursos_cat_produto: 'Produto & Design', cursos_cat_br: 'Plataformas brasileiras',
    cursos_gratis: 'Gratuito', cursos_pago_variavel: 'Pago (com opções acessíveis)', cursos_acessar: 'Acessar curso ↗',
    cursos_fcc_desc: 'Currículo completo de programação, do zero ao avançado, com certificados gratuitos.',
    cursos_odin_desc: 'Trilha completa de desenvolvimento web full-stack, open source e orientada a projetos.',
    cursos_cs50_desc: 'Introdução à ciência da computação da Universidade Harvard — a base que muita gente da área começou.',
    cursos_dlai_desc: 'Cursos de machine learning e IA generativa criados por Andrew Ng, referência mundial na área.',
    cursos_kaggle_desc: 'Micro-cursos práticos de dados e IA, direto no navegador, sem instalar nada.',
    cursos_aws_desc: 'Treinamento oficial da AWS em nuvem, com centenas de cursos gratuitos.',
    cursos_msft_desc: 'Trilhas oficiais da Microsoft em Azure, DevOps e desenvolvimento, com certificação.',
    cursos_nng_desc: 'A referência mundial em UX Research e usabilidade, com cursos práticos e certificação.',
    cursos_alura_desc: 'A maior plataforma brasileira de cursos de tecnologia, com trilhas completas em português.',
    cursos_rocketseat_desc: 'Formações intensivas em desenvolvimento, com forte comunidade brasileira por trás.',
    cursos_aviso_titulo: 'Aviso de transparência — Cursos',
    cursos_aviso_texto: 'Esta é uma curadoria editorial da RhoneyInc — não somos afiliados nem recebemos comissão de nenhuma das plataformas listadas acima. São recomendações genuínas de onde a própria equipe RhoneyInc aprende. Preços e disponibilidade de cursos gratuitos podem mudar; confirme sempre no site oficial de cada plataforma.',
    vagas_filtro_todas: 'Todas', vagas_filtro_engenharia: 'Engenharia', vagas_filtro_produto: 'Produto',
    vagas_filtro_dados: 'Dados', vagas_filtro_lideranca: 'Liderança', vagas_filtro_gestao: 'Gestão',
    vagas_carregando: 'Carregando vagas...', vagas_vazio: 'Nenhuma vaga encontrada no momento.', vagas_ver_linkedin: 'Ver no LinkedIn ↗',
    cursos_carregando: 'Carregando cursos...', cursos_vazio: 'Nenhum curso cadastrado ainda.',
    sobre_eyebrow: 'Quem constrói', sobre_title: 'Sobre a RhoneyInc',
    cta_eyebrow: 'Comece agora', cta_title: 'Entre nessa nova era.',
    cta_desc: 'Crie sua conta para usar o MeuPet agora e acompanhar de perto o lançamento do FitNow, do Controle Financeiro e do que vier a seguir.',
    cta_button: 'Criar minha conta gratuita',
    parc_hero_eyebrow: 'Colaboração comercial',
    parc_hero_title: 'Parceiros e <span class="accent">patrocinadores</span> da RhoneyInc.',
    parc_hero_sub: 'Este é o combustível por trás da entrega: empresas, marcas e plataformas que apoiam o desenvolvimento dos nossos softwares — sempre de forma clara, identificada e dentro da lei.',
    footer_blurb: 'Estúdio de engenharia de software fundado em Belém do Pará, construindo produtos digitais com identidade própria.',
    footer_col_produtos: 'Produtos', footer_col_empresa: 'Empresa', footer_col_legal: 'Legal',
  },
  en: {
    nav_softwares: 'Software', nav_processo: 'Process', nav_stack: 'Stack',
    nav_parceiros: 'Partners', nav_vagas: 'Jobs', nav_cursos: 'Courses', nav_sobre: 'About',
    nav_entrar: 'Log in', nav_criar_conta: 'Create account',
    hero_eyebrow: 'Software engineering studio · Belém, Brazil',
    hero_title: 'Software with a clear <span class="accent">prompt</span><br>and a defined <span class="stroke">product</span>.',
    hero_sub: 'RhoneyInc designs and builds digital products from scratch to deploy — apps, dashboards and tools that solve a real problem, with generative AI, Claude Code and Supabase at the center of the process.',
    hero_cta_criar: 'Create my account', hero_cta_ver: 'See our software →',
    hero_meta_1: 'PRODUCTS IN THE ECOSYSTEM', hero_meta_2: 'DESIGNED IN BRAZIL', hero_meta_3: 'HQ · BELÉM',
    soft_eyebrow: 'Product line', soft_title: "What we're building",
    soft_desc: 'Every product is born from a problem lived up close, not a trend spreadsheet.',
    proc_eyebrow: 'Method', proc_title: 'From prompt to delivery',
    proc_desc: 'Four stages, always in the same order — generative AI speeds up each one.',
    stack_eyebrow: 'Tools', stack_title: 'The stack behind the product',
    stack_desc: 'The same pieces, assembled differently for each problem.',
    modal_eyebrow: 'Ways to work together', modal_title: 'Three ways to walk with us',
    modal_desc: 'Choose the format that best fits your business.',
    parc_eyebrow: 'Today', parc_title: 'Current partners',
    parc_desc: "RhoneyInc is still building its partner network. The spots below will fill in as partnerships close.",
    parc_slot_label: 'SPOT<br>AVAILABLE',
    parc_nota: 'No active business partnership at the moment — this section will be updated as soon as deals are closed.',
    cat_eyebrow: 'Open categories', cat_title: 'Where an affiliate link fits',
    cat_desc: 'Categories related to our software, open for proposals.',
    vagas_eyebrow: 'Opportunities in the market', vagas_title: 'Tech jobs',
    vagas_desc: 'Giving back to the community: real remote jobs, aggregated automatically, with no application handled by us.',
    vagas_banner_cta: 'See jobs by category',
    cursos_eyebrow: 'Learn for free', cursos_title: 'COURSES',
    cursos_desc: 'A curated selection of real, free (or free-tier) courses from the best references in tech — no RhoneyInc signup, straight to the source.',
    cursos_banner_cta: 'See courses by category',
    cursos_cat_programacao: 'Programming', cursos_cat_dados_ia: 'Data & AI', cursos_cat_cloud: 'Cloud & DevOps',
    cursos_cat_produto: 'Product & Design', cursos_cat_br: 'Brazilian platforms',
    cursos_gratis: 'Free', cursos_pago_variavel: 'Paid (with affordable options)', cursos_acessar: 'Go to course ↗',
    cursos_fcc_desc: 'Full programming curriculum, from zero to advanced, with free certifications.',
    cursos_odin_desc: 'Complete full-stack web development path, open source and project-based.',
    cursos_cs50_desc: 'Harvard University\'s introduction to computer science — where a lot of people in the field started.',
    cursos_dlai_desc: 'Machine learning and generative AI courses created by Andrew Ng, a world reference in the field.',
    cursos_kaggle_desc: 'Hands-on data and AI micro-courses, right in the browser, nothing to install.',
    cursos_aws_desc: 'Official AWS cloud training, with hundreds of free courses.',
    cursos_msft_desc: 'Official Microsoft learning paths for Azure, DevOps and development, with certification.',
    cursos_nng_desc: 'The world reference in UX research and usability, with hands-on courses and certification.',
    cursos_alura_desc: 'The largest Brazilian tech course platform, with complete tracks in Portuguese.',
    cursos_rocketseat_desc: 'Intensive development bootcamps, backed by a strong Brazilian community.',
    cursos_aviso_titulo: 'Transparency notice — Courses',
    cursos_aviso_texto: 'This is an editorial curation by RhoneyInc — we are not affiliated with nor do we receive commission from any of the platforms listed above. These are genuine recommendations of where the RhoneyInc team itself learns. Prices and free-tier availability may change; always confirm on each platform\'s official site.',
    vagas_filtro_todas: 'All', vagas_filtro_engenharia: 'Engineering', vagas_filtro_produto: 'Product',
    vagas_filtro_dados: 'Data', vagas_filtro_lideranca: 'Leadership', vagas_filtro_gestao: 'Management',
    vagas_carregando: 'Loading jobs...', vagas_vazio: 'No jobs found right now.', vagas_ver_linkedin: 'View on LinkedIn ↗',
    cursos_carregando: 'Loading courses...', cursos_vazio: 'No courses added yet.',
    sobre_eyebrow: 'Who builds it', sobre_title: 'About RhoneyInc',
    cta_eyebrow: 'Get started', cta_title: 'Step into this new era.',
    cta_desc: 'Create your account to use MeuPet now and follow the launch of FitNow, Controle Financeiro and what comes next.',
    cta_button: 'Create my free account',
    parc_hero_eyebrow: 'Business collaboration',
    parc_hero_title: "RhoneyInc's <span class=\"accent\">partners</span> and sponsors.",
    parc_hero_sub: 'This is the fuel behind the delivery: companies, brands and platforms that support the development of our software — always clearly identified and within the law.',
    footer_blurb: 'Software engineering studio founded in Belém, Brazil, building digital products with their own identity.',
    footer_col_produtos: 'Products', footer_col_empresa: 'Company', footer_col_legal: 'Legal',
  },
  es: {
    nav_softwares: 'Software', nav_processo: 'Proceso', nav_stack: 'Stack',
    nav_parceiros: 'Socios', nav_vagas: 'Empleos', nav_cursos: 'Cursos', nav_sobre: 'Nosotros',
    nav_entrar: 'Iniciar sesión', nav_criar_conta: 'Crear cuenta',
    hero_eyebrow: 'Estudio de ingeniería de software · Belém, Brasil',
    hero_title: 'Software con <span class="accent">prompt</span><br>y <span class="stroke">producto</span> definidos.',
    hero_sub: 'RhoneyInc diseña y construye productos digitales de principio a fin — apps, paneles y herramientas que resuelven un problema real, con IA generativa, Claude Code y Supabase en el centro del proceso.',
    hero_cta_criar: 'Crear mi cuenta', hero_cta_ver: 'Ver software →',
    hero_meta_1: 'PRODUCTOS EN EL ECOSISTEMA', hero_meta_2: 'DISEÑADO EN BRASIL', hero_meta_3: 'SEDE · BELÉM',
    soft_eyebrow: 'Línea de productos', soft_title: 'Lo que estamos construyendo',
    soft_desc: 'Cada software nace de un problema vivido de cerca, no de una hoja de tendencias.',
    proc_eyebrow: 'Método', proc_title: 'Del prompt a la entrega',
    proc_desc: 'Cuatro etapas, siempre en el mismo orden — con IA generativa acelerando cada una.',
    stack_eyebrow: 'Herramientas', stack_title: 'El stack detrás del producto',
    stack_desc: 'Las mismas piezas, combinadas de forma distinta para cada problema.',
    modal_eyebrow: 'Modalidades', modal_title: 'Tres formas de caminar con nosotros',
    modal_desc: 'Elige el formato que mejor se ajuste a tu negocio.',
    parc_eyebrow: 'Hoy', parc_title: 'Socios actuales',
    parc_desc: 'RhoneyInc todavía está formando su red de socios. Los espacios abajo se completarán a medida que se cierren las alianzas.',
    parc_slot_label: 'CUPO<br>DISPONIBLE',
    parc_nota: 'Ninguna alianza comercial activa por el momento — esta sección se actualizará en cuanto haya acuerdos cerrados.',
    cat_eyebrow: 'Categorías abiertas', cat_title: 'Dónde encaja un enlace de afiliado',
    cat_desc: 'Categorías relacionadas con nuestro software, abiertas a propuestas.',
    vagas_eyebrow: 'Oportunidades en el mercado', vagas_title: 'Empleos de tecnología',
    vagas_desc: 'Un aporte a la comunidad: empleos remotos reales, agregados automáticamente, sin intermediar ninguna postulación.',
    vagas_banner_cta: 'Ver empleos por categoría',
    cursos_eyebrow: 'Aprende gratis', cursos_title: 'CURSOS',
    cursos_desc: 'Una selección de cursos reales y gratuitos (o con opción gratuita) de las mejores referencias en tecnología — sin registro en RhoneyInc, directo a la fuente.',
    cursos_banner_cta: 'Ver cursos por categoría',
    cursos_cat_programacao: 'Programación', cursos_cat_dados_ia: 'Datos & IA', cursos_cat_cloud: 'Cloud & DevOps',
    cursos_cat_produto: 'Producto & Diseño', cursos_cat_br: 'Plataformas brasileñas',
    cursos_gratis: 'Gratis', cursos_pago_variavel: 'De pago (con opciones accesibles)', cursos_acessar: 'Ir al curso ↗',
    cursos_fcc_desc: 'Currículo completo de programación, de cero a avanzado, con certificados gratuitos.',
    cursos_odin_desc: 'Ruta completa de desarrollo web full-stack, open source y orientada a proyectos.',
    cursos_cs50_desc: 'Introducción a la ciencia de la computación de la Universidad de Harvard — donde mucha gente del área empezó.',
    cursos_dlai_desc: 'Cursos de machine learning e IA generativa creados por Andrew Ng, referencia mundial en el área.',
    cursos_kaggle_desc: 'Micro-cursos prácticos de datos e IA, directo en el navegador, sin instalar nada.',
    cursos_aws_desc: 'Entrenamiento oficial de AWS en la nube, con cientos de cursos gratuitos.',
    cursos_msft_desc: 'Rutas oficiales de Microsoft en Azure, DevOps y desarrollo, con certificación.',
    cursos_nng_desc: 'La referencia mundial en UX Research y usabilidad, con cursos prácticos y certificación.',
    cursos_alura_desc: 'La mayor plataforma brasileña de cursos de tecnología, con rutas completas en portugués.',
    cursos_rocketseat_desc: 'Formaciones intensivas en desarrollo, respaldadas por una fuerte comunidad brasileña.',
    cursos_aviso_titulo: 'Aviso de transparencia — Cursos',
    cursos_aviso_texto: 'Esta es una curaduría editorial de RhoneyInc — no somos afiliados ni recibimos comisión de ninguna de las plataformas listadas arriba. Son recomendaciones genuinas de dónde aprende el propio equipo de RhoneyInc. Precios y disponibilidad gratuita pueden cambiar; confirma siempre en el sitio oficial de cada plataforma.',
    vagas_filtro_todas: 'Todas', vagas_filtro_engenharia: 'Ingeniería', vagas_filtro_produto: 'Producto',
    vagas_filtro_dados: 'Datos', vagas_filtro_lideranca: 'Liderazgo', vagas_filtro_gestao: 'Gestión',
    vagas_carregando: 'Cargando empleos...', vagas_vazio: 'No se encontraron empleos por ahora.', vagas_ver_linkedin: 'Ver en LinkedIn ↗',
    cursos_carregando: 'Cargando cursos...', cursos_vazio: 'Todavía no hay cursos agregados.',
    sobre_eyebrow: 'Quién lo construye', sobre_title: 'Sobre RhoneyInc',
    cta_eyebrow: 'Empieza ahora', cta_title: 'Entra en esta nueva era.',
    cta_desc: 'Crea tu cuenta para usar MeuPet ahora y sigue de cerca el lanzamiento de FitNow, Controle Financeiro y lo que viene después.',
    cta_button: 'Crear mi cuenta gratis',
    parc_hero_eyebrow: 'Colaboración comercial',
    parc_hero_title: 'Socios y <span class="accent">patrocinadores</span> de RhoneyInc.',
    parc_hero_sub: 'Este es el combustible detrás de la entrega: empresas, marcas y plataformas que apoyan el desarrollo de nuestro software — siempre de forma clara, identificada y dentro de la ley.',
    footer_blurb: 'Estudio de ingeniería de software fundado en Belém, Brasil, construyendo productos digitales con identidad propia.',
    footer_col_produtos: 'Productos', footer_col_empresa: 'Empresa', footer_col_legal: 'Legal',
  },
};

function aplicarIdioma(lang){
  const dict = I18N[lang] || I18N.pt;
  document.querySelectorAll('[data-i18n]').forEach(el => {
    const key = el.getAttribute('data-i18n');
    if(dict[key]) el.textContent = dict[key];
  });
  document.querySelectorAll('[data-i18n-html]').forEach(el => {
    const key = el.getAttribute('data-i18n-html');
    if(dict[key]) el.innerHTML = dict[key];
  });
  document.querySelectorAll('.lang-options button').forEach(btn => {
    btn.classList.toggle('is-active', btn.dataset.lang === lang);
  });
  document.querySelectorAll('.lang-current-label').forEach(el => {
    el.textContent = lang.toUpperCase();
  });
  document.querySelectorAll('.lang-switch').forEach(group => group.classList.remove('is-open'));
  document.documentElement.setAttribute('lang', lang === 'pt' ? 'pt-BR' : lang);
  window.__rhoneyLang = lang;
  localStorage.setItem('rhoneyinc_lang', lang);
  // Só re-renderiza se as vagas já chegaram — senão sobrescreve o
  // "Carregando..." inicial com um "nenhuma vaga" falso antes da hora.
  if(typeof __vagasCache !== 'undefined' && __vagasCache.length > 0){
    renderVagas(document.querySelector('.vaga-filtro-btn.is-active')?.dataset.categoria || 'todas');
  }
}

function initLangSwitch(){
  const salvo = localStorage.getItem('rhoneyinc_lang');
  const lang = ['pt', 'en', 'es'].includes(salvo) ? salvo : 'pt';
  aplicarIdioma(lang);

  document.querySelectorAll('.lang-switch').forEach(group => {
    const trigger = group.querySelector('.lang-current');
    // Clique no botão atual abre/fecha (cobre touch, onde não existe hover).
    trigger.addEventListener('click', (e) => {
      e.stopPropagation();
      const abrir = !group.classList.contains('is-open');
      document.querySelectorAll('.lang-switch').forEach(g => g.classList.remove('is-open'));
      group.classList.toggle('is-open', abrir);
      trigger.setAttribute('aria-expanded', String(abrir));
    });
    // Escolher um idioma
    group.addEventListener('click', (e) => {
      const btn = e.target.closest('button[data-lang]');
      if(!btn) return;
      aplicarIdioma(btn.dataset.lang);
    });
  });

  // Clique fora fecha qualquer seletor aberto.
  document.addEventListener('click', () => {
    document.querySelectorAll('.lang-switch.is-open').forEach(g => {
      g.classList.remove('is-open');
      g.querySelector('.lang-current')?.setAttribute('aria-expanded', 'false');
    });
  });
}
document.addEventListener('DOMContentLoaded', initLangSwitch);

// Botão "Vagas & Cursos" do menu do topo — mesmo padrão de abrir/fechar do
// seletor de idioma (.lang-switch): hover abre no mouse (via CSS), clique
// abre/fecha no touch, clique fora fecha.
function initNavDropdown(){
  document.querySelectorAll('.nav-dropdown').forEach((group) => {
    const trigger = group.querySelector('.nav-dropdown-trigger');
    trigger.addEventListener('click', (e) => {
      e.stopPropagation();
      const abrir = !group.classList.contains('is-open');
      document.querySelectorAll('.nav-dropdown').forEach((g) => g.classList.remove('is-open'));
      group.classList.toggle('is-open', abrir);
      trigger.setAttribute('aria-expanded', String(abrir));
    });
  });
  document.addEventListener('click', () => {
    document.querySelectorAll('.nav-dropdown.is-open').forEach((g) => {
      g.classList.remove('is-open');
      g.querySelector('.nav-dropdown-trigger')?.setAttribute('aria-expanded', 'false');
    });
  });
}
document.addEventListener('DOMContentLoaded', initNavDropdown);


// ---------- VAGAS (agregadas via api/sync-vagas.js, lidas direto do Supabase) ----------
// Carregamento é preguiçoso: só busca no Supabase quando o banner grande é
// clicado, não no load da página — a seção nasce leve, com o resto do
// conteúdo escondido (ver .vagas-conteudo[hidden] em index.html).
let __vagasCache = [];
const ORDEM_CATEGORIAS = ['Engenharia', 'IA', 'Produto', 'Dados', 'Liderança', 'Gestão'];
const CHAVE_I18N_CATEGORIA = {
  Engenharia: 'vagas_filtro_engenharia', Produto: 'vagas_filtro_produto',
  Dados: 'vagas_filtro_dados', Liderança: 'vagas_filtro_lideranca', Gestão: 'vagas_filtro_gestao',
};

async function carregarVagas(){
  const grid = document.getElementById('vagasGrid');
  if(!grid || !clienteDisponivel()) return;

  const { data: vagas, error } = await supabaseClient
    .from('vagas')
    .select('*')
    .order('data_publicacao', { ascending: false })
    .limit(60);

  if(error || !vagas){
    grid.innerHTML = '<p class="vagas-vazio">Não foi possível carregar as vagas agora. Tente novamente mais tarde.</p>';
    return;
  }

  __vagasCache = vagas;
  renderVagas('todas');
}

function cardVagaHtml(v, dict){
  return `
    <div class="vaga-card reveal">
      <div class="vaga-card-top">
        <span class="vaga-titulo">${escapeHtml(v.titulo)}</span>
        <span class="vaga-badge">${escapeHtml(v.categoria)}</span>
      </div>
      <span class="vaga-empresa">${escapeHtml(v.empresa)}</span>
      ${v.localizacao ? `<span class="vaga-local">${escapeHtml(v.localizacao)}</span>` : ''}
      ${v.descricao_resumo ? `<p class="vaga-resumo">${escapeHtml(v.descricao_resumo)}</p>` : ''}
      <a class="vaga-cta" href="${escapeHtml(v.url_linkedin || v.url_original)}" target="_blank" rel="noopener noreferrer">
        ${dict.vagas_ver_linkedin}
      </a>
    </div>
  `;
}

// "Todas" agrupa por categoria (o pedido original: clicar no banner e as
// vagas aparecerem organizadas por categoria); escolher uma categoria
// específica no filtro mostra só o grupo dela.
function renderVagas(categoria){
  const grid = document.getElementById('vagasGrid');
  if(!grid) return;
  const dict = I18N[window.__rhoneyLang] || I18N.pt;

  if(__vagasCache.length === 0){
    grid.innerHTML = `<p class="vagas-vazio">${dict.vagas_vazio}</p>`;
    return;
  }

  const categorias = categoria === 'todas' ? ORDEM_CATEGORIAS : [categoria];

  const html = categorias.map(cat => {
    const vagasDaCategoria = __vagasCache.filter(v => v.categoria === cat);
    if(vagasDaCategoria.length === 0) return '';
    const labelKey = CHAVE_I18N_CATEGORIA[cat];
    const label = labelKey ? dict[labelKey] : cat;
    return `
      <div class="vagas-categoria-grupo">
        <div class="vagas-categoria-titulo">${escapeHtml(label)} <span class="count">${vagasDaCategoria.length}</span></div>
        <div class="vagas-grid">${vagasDaCategoria.map(v => cardVagaHtml(v, dict)).join('')}</div>
      </div>
    `;
  }).join('');

  grid.innerHTML = html || `<p class="vagas-vazio">${dict.vagas_vazio}</p>`;
  if(typeof iniciarRevealScroll === 'function') iniciarRevealScroll();
}

// ---------- CURSOS (curadoria manual — tabela cursos no Supabase, editada
// pelo painel admin. Diferente de Vagas, não existe API pública confiável
// pra "descobrir" cursos novos automaticamente, então isso não é
// sincronizado por cron — cresce conforme alguém adiciona no admin.) ----------
function cardCursoHtml(c, dict){
  const precoLabel = c.preco_tipo === 'gratuito' ? dict.cursos_gratis : dict.cursos_pago_variavel;
  return `
    <a class="vaga-card" href="${escapeHtml(c.url)}" target="_blank" rel="noopener noreferrer">
      <span class="vaga-titulo">${escapeHtml(c.titulo)}</span>
      <span class="vaga-empresa">${escapeHtml(precoLabel)}</span>
      ${c.descricao ? `<p class="vaga-resumo">${escapeHtml(c.descricao)}</p>` : ''}
      <span class="vaga-cta">${dict.cursos_acessar}</span>
    </a>
  `;
}

async function carregarCursos(){
  const grid = document.getElementById('cursosGrid');
  if(!grid || !clienteDisponivel()) return;
  const dict = I18N[window.__rhoneyLang] || I18N.pt;

  const { data: cursos, error } = await supabaseClient
    .from('cursos')
    .select('*')
    .order('ordem', { ascending: true });

  if(error){
    grid.innerHTML = '<p class="vagas-vazio">Não foi possível carregar os cursos agora. Tente novamente mais tarde.</p>';
    return;
  }
  if(!cursos || cursos.length === 0){
    grid.innerHTML = `<p class="vagas-vazio">${dict.cursos_vazio}</p>`;
    return;
  }

  // Agrupa mantendo a ordem em que as categorias aparecem (governada pelo
  // campo "ordem" de cada curso, definido no admin) — não é uma lista fixa
  // de categorias como em Vagas, porque aqui é curadoria livre.
  const categoriasNaOrdem = [...new Set(cursos.map((c) => c.categoria))];

  grid.innerHTML = categoriasNaOrdem.map((cat) => {
    const cursosDaCategoria = cursos.filter((c) => c.categoria === cat);
    return `
      <div class="vagas-categoria-grupo">
        <div class="vagas-categoria-titulo">${escapeHtml(cat)} <span class="count">${cursosDaCategoria.length}</span></div>
        <div class="vagas-grid">${cursosDaCategoria.map((c) => cardCursoHtml(c, dict)).join('')}</div>
      </div>
    `;
  }).join('');

  if(typeof iniciarRevealScroll === 'function') iniciarRevealScroll();
}

// Banner grande que esconde o conteúdo até o clique — mesmo padrão pra
// Vagas e Cursos: nasce leve, só "custa" alguma coisa (fetch, no caso de
// Vagas) quando a pessoa realmente demonstra interesse.
function initBannerToggle(bannerId, conteudoId, onFirstOpen){
  const banner = document.getElementById(bannerId);
  const conteudo = document.getElementById(conteudoId);
  if(!banner || !conteudo) return;
  let carregado = false;

  banner.addEventListener('click', async () => {
    const abrir = conteudo.hasAttribute('hidden');
    if(abrir){
      conteudo.removeAttribute('hidden');
      banner.setAttribute('aria-expanded', 'true');
      if(!carregado && onFirstOpen){
        carregado = true;
        await onFirstOpen();
      }
      if(typeof iniciarRevealScroll === 'function') iniciarRevealScroll();
      conteudo.scrollIntoView({ behavior: prefereMenosMovimento() ? 'auto' : 'smooth', block: 'nearest' });
    } else {
      conteudo.setAttribute('hidden', '');
      banner.setAttribute('aria-expanded', 'false');
    }
  });
}

document.addEventListener('DOMContentLoaded', function(){
  initBannerToggle('vagasBanner', 'vagasConteudo', carregarVagas);
  initBannerToggle('cursosBanner', 'cursosConteudo', carregarCursos);

  const filtros = document.getElementById('vagasFiltros');
  if(!filtros) return;
  filtros.addEventListener('click', function(e){
    const btn = e.target.closest('.vaga-filtro-btn');
    if(!btn) return;
    filtros.querySelectorAll('.vaga-filtro-btn').forEach(b => b.classList.remove('is-active'));
    btn.classList.add('is-active');
    renderVagas(btn.dataset.categoria);
  });
});

function softCarouselStep(track){
  const card = track.querySelector('.soft-card');
  if(!card) return 340;
  const gap = parseFloat(getComputedStyle(track).columnGap || getComputedStyle(track).gap || '28') || 28;
  return card.offsetWidth + gap;
}

function scrollSoftCarousel(dir){
  const track = document.getElementById('softCarousel');
  if(!track) return;
  avancarSoftCarousel(track, dir);
  reiniciarSoftCarouselAuto();
}

// Curva mais suave que a cúbica — acelera/desacelera com transição mais gradual,
// dando uma sensação de "deslizar" em vez de "pular" entre os cards.
const easeInOutCubic = t => -(Math.cos(Math.PI * t) - 1) / 2;

let __softCarouselAnim = null;

// Rola até um X específico com curva própria (ease-in-out), mais lenta e suave
// que o scroll "smooth" nativo do navegador — cancela uma animação anterior se
// ainda estiver em andamento, pra não competir consigo mesma.
function smoothScrollTo(el, targetLeft, duration = 1600){
  if(__softCarouselAnim) cancelAnimationFrame(__softCarouselAnim);
  const start = el.scrollLeft;
  const delta = targetLeft - start;
  const t0 = performance.now();
  const snapOriginal = el.style.scrollSnapType;
  el.style.scrollSnapType = 'none'; // evita o snap nativo brigar com a animação

  function passo(now){
    const p = Math.min(1, (now - t0) / duration);
    el.scrollLeft = start + delta * easeInOutCubic(p);
    if(p < 1){
      __softCarouselAnim = requestAnimationFrame(passo);
    } else {
      __softCarouselAnim = null;
      el.style.scrollSnapType = snapOriginal;
    }
  }
  __softCarouselAnim = requestAnimationFrame(passo);
}

// Anda automaticamente pro próximo card; ao chegar no fim, volta suavemente pro início.
function avancarSoftCarousel(track, dir = 1){
  const step = softCarouselStep(track);
  const max = track.scrollWidth - track.clientWidth;
  const atual = track.scrollLeft;

  if(dir > 0 && atual >= max - 8){
    smoothScrollTo(track, 0, 1900);
  } else if(dir < 0 && atual <= 8){
    smoothScrollTo(track, max, 1900);
  } else {
    smoothScrollTo(track, atual + dir * step, 1600);
  }
}

let __softCarouselTimer = null;

function iniciarSoftCarouselAuto(){
  const track = document.getElementById('softCarousel');
  if(!track) return;

  const play = () => { __softCarouselTimer = setInterval(() => avancarSoftCarousel(track, 1), 5200); };
  const pause = () => { if(__softCarouselTimer){ clearInterval(__softCarouselTimer); __softCarouselTimer = null; } };

  play();
  track.addEventListener('mouseenter', pause);
  track.addEventListener('mouseleave', play);
  track.addEventListener('touchstart', pause, { passive: true });
  track.addEventListener('touchend', () => setTimeout(play, 3000), { passive: true });

  window.__reiniciarSoftCarouselAuto = () => { pause(); play(); };
}

function reiniciarSoftCarouselAuto(){
  if(window.__reiniciarSoftCarouselAuto) window.__reiniciarSoftCarouselAuto();
}

// ============================================================
// NAVBAR + HERO — estado de scroll, menu mobile, scroll-spy,
// microinterações de botão e entrada do hero.
// Respeita prefers-reduced-motion: os efeitos puramente decorativos
// (ripple, glow, flutuação) não fazem sentido pra quem pediu menos movimento.
// ============================================================

const prefereMenosMovimento = () =>
  window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

function iniciarHeaderScroll(){
  const header = document.querySelector('header');
  if(!header) return;
  const limiar = 24;
  let ticking = false;

  function atualizar(){
    header.classList.toggle('is-scrolled', window.scrollY > limiar);
    ticking = false;
  }
  atualizar();
  window.addEventListener('scroll', () => {
    if(!ticking){
      requestAnimationFrame(atualizar);
      ticking = true;
    }
  }, { passive: true });
}

function iniciarMenuMobile(){
  const toggle = document.getElementById('navToggle');
  const menu = document.getElementById('mobileMenu');
  const fechar = document.getElementById('mobileClose');
  if(!toggle || !menu) return;

  function abrir(){
    menu.classList.add('is-open');
    menu.setAttribute('aria-hidden', 'false');
    toggle.setAttribute('aria-expanded', 'true');
    document.body.classList.add('menu-open');
  }
  function fecharMenu(){
    menu.classList.remove('is-open');
    menu.setAttribute('aria-hidden', 'true');
    toggle.setAttribute('aria-expanded', 'false');
    document.body.classList.remove('menu-open');
  }

  toggle.addEventListener('click', abrir);
  fechar?.addEventListener('click', fecharMenu);
  menu.querySelectorAll('a, button').forEach(el => el.addEventListener('click', fecharMenu));
  document.addEventListener('keydown', (e) => {
    if(e.key === 'Escape' && menu.classList.contains('is-open')) fecharMenu();
  });
}

// Destaca no menu o link da seção visível no momento — só nas seções que
// têm um link correspondente na nav (softwares, processo, stack, parceiros, sobre).
function iniciarScrollSpy(){
  const links = document.querySelectorAll('.nav-links a[href^="#"]');
  if(!links.length) return;
  const mapa = new Map();
  links.forEach(a => {
    const id = a.getAttribute('href').slice(1);
    const secao = document.getElementById(id);
    if(secao) mapa.set(secao, a.getAttribute('href'));
  });
  if(!mapa.size) return;

  const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if(!entry.isIntersecting) return;
      const href = mapa.get(entry.target);
      document.querySelectorAll('.nav-links a').forEach(a => {
        a.classList.toggle('is-active', a.getAttribute('href') === href);
      });
    });
  }, { rootMargin: '-45% 0px -50% 0px', threshold: 0 });

  mapa.forEach((_href, secao) => observer.observe(secao));
}

// Ripple no botão sólido: marca o ponto exato do clique via custom
// properties CSS, a animação em si é só CSS (@keyframes btn-ripple).
function iniciarRippleBotoes(){
  if(prefereMenosMovimento()) return;
  document.querySelectorAll('.btn-solid').forEach(btn => {
    btn.addEventListener('pointerdown', (e) => {
      const rect = btn.getBoundingClientRect();
      btn.style.setProperty('--ripple-x', `${e.clientX - rect.left}px`);
      btn.style.setProperty('--ripple-y', `${e.clientY - rect.top}px`);
      btn.classList.remove('is-rippling');
      // força reflow pra permitir reiniciar a animação em cliques seguidos
      void btn.offsetWidth;
      btn.classList.add('is-rippling');
    });
  });
}

// Botão magnético: desloca sutilmente em direção ao cursor dentro dos
// próprios limites, volta ao centro quando o mouse sai. Só desktop (mouse fino).
function iniciarBotaoMagnetico(){
  if(prefereMenosMovimento() || !window.matchMedia('(pointer: fine)').matches) return;
  document.querySelectorAll('.btn-solid').forEach(btn => {
    btn.addEventListener('mousemove', (e) => {
      const rect = btn.getBoundingClientRect();
      const relX = e.clientX - rect.left - rect.width / 2;
      const relY = e.clientY - rect.top - rect.height / 2;
      btn.style.transform = `translate(${relX * 0.18}px, ${relY * 0.35 - 1}px) scale(1.04)`;
    });
    btn.addEventListener('mouseleave', () => { btn.style.transform = ''; });
  });
}

// Libera a animação de entrada do hero (ver .is-ready no CSS) depois que a
// página está pronta, num pequeno atraso pra não competir com o primeiro paint.
function iniciarEntradaHero(){
  if(prefereMenosMovimento()){
    document.body.classList.add('is-ready');
    return;
  }
  requestAnimationFrame(() => {
    setTimeout(() => document.body.classList.add('is-ready'), 60);
  });
}

// Reveal por scroll: fade + leve translação ao entrar na viewport, uma
// única vez. .reveal sobe de baixo, .reveal-left/.reveal-right entram
// dos lados — pra dar sensação de conteúdo "chegando" enquanto rola,
// sem exagerar (call: :not(.is-visible) evita reobservar o que já
// apareceu quando a função roda de novo, ex: conteúdo dinâmico chegando).
function iniciarRevealScroll(){
  const alvos = Array.from(document.querySelectorAll('.reveal:not(.is-visible), .reveal-left:not(.is-visible), .reveal-right:not(.is-visible)'));
  if(!alvos.length) return;

  if(prefereMenosMovimento()){
    alvos.forEach(el => el.classList.add('is-visible'));
    return;
  }

  // Stagger: elementos que dividem o mesmo pai recebem um delay incremental
  // (130ms), até um teto, pra não atrasar demais grupos grandes.
  const porPai = new Map();
  alvos.forEach(el => {
    const pai = el.parentElement;
    if(!porPai.has(pai)) porPai.set(pai, []);
    porPai.get(pai).push(el);
  });
  porPai.forEach(irmaos => {
    irmaos.forEach((el, i) => {
      el.style.transitionDelay = `${Math.min(i, 6) * 130}ms`;
    });
  });

  const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if(entry.isIntersecting){
        entry.target.classList.add('is-visible');
        observer.unobserve(entry.target);
      }
    });
  }, { threshold: 0.15, rootMargin: '0px 0px -15% 0px' });
  alvos.forEach(el => observer.observe(el));
}

// Tilt 3D nos cards de software: segue delegação no container (não nos
// cards individuais), porque eles são recriados dinamicamente ao carregar
// do Supabase — assim funciona mesmo depois de um re-render.
function iniciarTiltCards(){
  const track = document.getElementById('softCarousel');
  if(!track || prefereMenosMovimento() || !window.matchMedia('(pointer: fine)').matches) return;

  track.addEventListener('mousemove', (e) => {
    const card = e.target.closest('.soft-card');
    if(!card) return;
    const rect = card.getBoundingClientRect();
    const px = (e.clientX - rect.left) / rect.width - 0.5;
    const py = (e.clientY - rect.top) / rect.height - 0.5;
    const rotateY = px * 10;
    const rotateX = py * -10;
    card.style.transform = `perspective(900px) translateY(-10px) scale(1.03) rotateX(${rotateX}deg) rotateY(${rotateY}deg)`;
    card.classList.add('is-tilting');
  });

  track.addEventListener('mouseleave', () => {
    track.querySelectorAll('.soft-card.is-tilting').forEach(card => {
      card.style.transform = '';
      card.classList.remove('is-tilting');
    });
  }, true);

  // sai de um card direto pro outro sem passar pelo fundo do track —
  // precisa limpar o card anterior individualmente também.
  track.addEventListener('mouseout', (e) => {
    const saindoDeUmCard = e.target.closest('.soft-card');
    const indoPraDentroDoMesmoCard = saindoDeUmCard && saindoDeUmCard.contains(e.relatedTarget);
    if(saindoDeUmCard && !indoPraDentroDoMesmoCard){
      saindoDeUmCard.style.transform = '';
      saindoDeUmCard.classList.remove('is-tilting');
    }
  });
}

// Ícones dos cards com ícone (Modalidades e Softwares): no mouse (pc), o
// hover no CSS já amplia 2x. Em touch não existe hover de verdade — clique
// alterna a mesma ampliação via classe.
//
// Delegação no document (em vez de um listener por ícone) de propósito: os
// cards de Software são recriados do zero via innerHTML depois que a página
// carrega (carregarSoftwaresPublicos, busca no Supabase) — um listener preso
// no elemento antigo se perde quando o card é substituído. Delegado no
// document, continua funcionando pra qualquer ícone que existir no momento
// do clique, novo ou velho.
const SELETOR_ICONES_ZOOM = '.tier-icon, .soft-icon-wrap';

function iniciarZoomIcones(){
  document.addEventListener('click', (e) => {
    const alvo = e.target.closest(SELETOR_ICONES_ZOOM);

    document.querySelectorAll(`${SELETOR_ICONES_ZOOM}.is-zoomed`).forEach((icone) => {
      if(icone !== alvo) icone.classList.remove('is-zoomed');
    });

    if(!alvo) return;
    // soft-icon-wrap pode estar dentro de um <a> (card de software clicável)
    // — sem isso, o clique navegaria pro link em vez de só ampliar o ícone.
    e.preventDefault();
    e.stopPropagation();
    alvo.classList.toggle('is-zoomed');
  });
}

// ══════════════════════════════════════════════════════
// CARDS EXPANSÍVEIS (Modalidades / #tiersGrid) — clique expande o card
// ══════════════════════════════════════════════════════
function expandirCard(card) {
  const grid = document.getElementById('tiersGrid');
  const jaExpandido = card.classList.contains('expanded');

  grid.querySelectorAll('.tier-card').forEach((c) => c.classList.remove('expanded'));

  if (!jaExpandido) card.classList.add('expanded');
}

document.addEventListener('DOMContentLoaded', () => {
  iniciarHeaderScroll();
  iniciarMenuMobile();
  iniciarScrollSpy();
  iniciarRippleBotoes();
  iniciarBotaoMagnetico();
  iniciarEntradaHero();
  iniciarRevealScroll();
  iniciarTiltCards();
  iniciarZoomIcones();
});
