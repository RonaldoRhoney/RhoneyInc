// ============================================================
// RHONEYINC — MÉTRICAS AGREGADAS POR PRODUTO (server-side only)
//
// Substitui a função dedicada que existia só pro MeuPet
// (metrics-meupet.js) por uma genérica, parametrizada via
// ?produto=<chave>. Cada produto é outro projeto Supabase — pra
// ler contagens agregadas (sem RLS por linha) é preciso a
// service_role key de cada um, e essa chave NUNCA pode aparecer em
// código que roda no navegador. Vive só aqui, como variável de
// ambiente no servidor (Vercel).
//
// Pra adicionar um produto novo no futuro: só uma entrada nova no
// mapa PRODUTOS abaixo + as duas variáveis de ambiente dele no
// painel da Vercel. Não precisa criar arquivo novo.
//
// Variáveis de ambiente exigidas (configure no painel da Vercel,
// nunca commitadas no repositório):
//   RHONEYINC_SUPABASE_URL / RHONEYINC_SERVICE_ROLE_KEY   - projeto da RhoneyInc
//   <urlEnv> / <keyEnv> de cada entrada em PRODUTOS         - projeto de cada produto
//
// Autenticação: o front-end manda o access_token da sessão Supabase
// da RhoneyInc no header Authorization. Esta função valida esse
// token contra o projeto da RhoneyInc e só segue adiante se o
// usuário for admin lá — nunca confia em nada vindo do cliente.
// ============================================================

const { createClient } = require('@supabase/supabase-js');

const PRODUTOS = {
  meupet: {
    urlEnv: 'MEUPET_SUPABASE_URL',
    keyEnv: 'MEUPET_SERVICE_ROLE_KEY',
    metricas: [
      { chave: 'tutores', tabela: 'profiles', label: 'Tutores cadastrados' },
      { chave: 'pets', tabela: 'pets', label: 'Pets cadastrados' },
      { chave: 'posts', tabela: 'posts', label: 'Posts no feed' },
      { chave: 'adocoes_ativas', tabela: 'adoption_listings', label: 'Anúncios de adoção ativos', filtro: (q) => q.eq('status', 'available') },
      { chave: 'petshops', tabela: 'petshops', label: 'Petshops cadastrados' },
      { chave: 'assinaturas_pagas', tabela: 'profiles', label: 'Assinaturas pagas', filtro: (q) => q.neq('plan', 'free') },
    ],
  },
  menuflex: {
    urlEnv: 'MENUFLEX_SUPABASE_URL',
    keyEnv: 'MENUFLEX_SERVICE_ROLE_KEY',
    metricas: [
      { chave: 'negocios', tabela: 'businesses', label: 'Negócios cadastrados' },
      { chave: 'negocios_pagos', tabela: 'businesses', label: 'Negócios em plano pago', filtro: (q) => q.neq('plan', 'free') },
      { chave: 'itens_cardapio', tabela: 'menu_items', label: 'Itens de cardápio cadastrados' },
      { chave: 'pedidos', tabela: 'orders', label: 'Pedidos realizados' },
      { chave: 'clientes', tabela: 'customers', label: 'Clientes cadastrados' },
      { chave: 'cardapios_enviados_whatsapp', tabela: 'whatsapp_events', label: 'Cardápios enviados via WhatsApp', filtro: (q) => q.eq('event_type', 'click_send') },
    ],
  },
};

module.exports = async (req, res) => {
  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Método não permitido.' });
    return;
  }

  const produtoKey = req.query.produto;
  const config = PRODUTOS[produtoKey];
  if (!config) {
    res.status(400).json({ error: 'Produto desconhecido.' });
    return;
  }

  const authHeader = req.headers.authorization || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
  if (!token) {
    res.status(401).json({ error: 'Token ausente.' });
    return;
  }

  const RHONEYINC_URL = process.env.RHONEYINC_SUPABASE_URL;
  const RHONEYINC_SERVICE_KEY = process.env.RHONEYINC_SERVICE_ROLE_KEY;

  if (!RHONEYINC_URL || !RHONEYINC_SERVICE_KEY) {
    res.status(500).json({ error: 'Integração administrativa da RhoneyInc ainda não configurada.' });
    return;
  }

  const rhoneyAdmin = createClient(RHONEYINC_URL, RHONEYINC_SERVICE_KEY);

  // 1. Valida o token e identifica quem está pedindo
  const { data: userData, error: userError } = await rhoneyAdmin.auth.getUser(token);
  if (userError || !userData?.user) {
    res.status(401).json({ error: 'Sessão inválida.' });
    return;
  }

  // 2. Confirma que essa pessoa é admin da RhoneyInc (nunca confiar em flag vinda do cliente)
  const { data: profile, error: profileError } = await rhoneyAdmin
    .from('profiles')
    .select('role')
    .eq('id', userData.user.id)
    .single();

  if (profileError || profile?.role !== 'admin') {
    res.status(403).json({ error: 'Acesso restrito a administradores.' });
    return;
  }

  // 3. Só a partir daqui consulta o banco do produto pedido
  const url = process.env[config.urlEnv];
  const key = process.env[config.keyEnv];
  if (!url || !key) {
    res.status(500).json({ error: `Integração com ${produtoKey} ainda não configurada (variáveis de ambiente ausentes).` });
    return;
  }

  const client = createClient(url, key);

  const count = async (tabela, filtro) => {
    let q = client.from(tabela).select('*', { count: 'exact', head: true });
    if (filtro) q = filtro(q);
    const { count: c, error } = await q;
    if (error) throw error;
    return c ?? 0;
  };

  try {
    const resultados = await Promise.all(config.metricas.map((m) => count(m.tabela, m.filtro)));
    const dados = {};
    config.metricas.forEach((m, i) => {
      dados[m.chave] = resultados[i];
    });
    res.status(200).json({
      metricas: config.metricas.map((m) => ({ chave: m.chave, label: m.label })),
      dados,
    });
  } catch (err) {
    res.status(500).json({ error: `Erro ao consultar métricas de ${produtoKey}.` });
  }
};
