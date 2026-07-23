// ============================================================
// RHONEYINC — MÉTRICAS AGREGADAS DO MEUPET (server-side only)
//
// Por quê isso é uma função serverless e não uma query direta no
// front-end: o MeuPet é outro produto, com seu próprio projeto
// Supabase. Pra ler contagens agregadas (sem RLS por linha), é
// preciso a service_role key do MeuPet — e essa chave NUNCA pode
// aparecer em código que roda no navegador. Ela vive só aqui,
// como variável de ambiente no servidor (Vercel).
//
// Variáveis de ambiente exigidas (configure no painel da Vercel,
// nunca commitadas no repositório):
//   RHONEYINC_SUPABASE_URL         - URL do projeto Supabase da RhoneyInc
//   RHONEYINC_SERVICE_ROLE_KEY     - service_role key da RhoneyInc (secreta)
//   MEUPET_SUPABASE_URL            - URL do projeto Supabase do MeuPet
//   MEUPET_SERVICE_ROLE_KEY        - service_role key do MeuPet (secreta)
//
// Autenticação: o front-end manda o access_token da sessão Supabase
// da RhoneyInc no header Authorization. Esta função valida esse
// token contra o projeto da RhoneyInc e só segue adiante se o
// usuário for admin lá — nunca confia em nada vindo do cliente.
// ============================================================

const { createClient } = require('@supabase/supabase-js');

module.exports = async (req, res) => {
  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Método não permitido.' });
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
  const MEUPET_URL = process.env.MEUPET_SUPABASE_URL;
  const MEUPET_SERVICE_KEY = process.env.MEUPET_SERVICE_ROLE_KEY;

  if (!RHONEYINC_URL || !RHONEYINC_SERVICE_KEY || !MEUPET_URL || !MEUPET_SERVICE_KEY) {
    res.status(500).json({ error: 'Integração com o MeuPet ainda não configurada (variáveis de ambiente ausentes).' });
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

  // 3. Só a partir daqui consulta o banco do MeuPet
  const meupet = createClient(MEUPET_URL, MEUPET_SERVICE_KEY);

  const count = async (table, applyFilter) => {
    let query = meupet.from(table).select('*', { count: 'exact', head: true });
    if (applyFilter) query = applyFilter(query);
    const { count: c, error } = await query;
    if (error) throw error;
    return c ?? 0;
  };

  try {
    const [tutores, pets, posts, adocoesAtivas, petshops, assinaturasPagas] = await Promise.all([
      count('profiles'),
      count('pets'),
      count('posts'),
      count('adoption_listings', q => q.eq('status', 'available')),
      count('petshops'),
      count('profiles', q => q.neq('plan', 'free'))
    ]);

    res.status(200).json({
      tutores,
      pets,
      posts,
      adocoes_ativas: adocoesAtivas,
      petshops,
      assinaturas_pagas: assinaturasPagas
    });
  } catch (err) {
    res.status(500).json({ error: 'Erro ao consultar métricas do MeuPet.' });
  }
};
