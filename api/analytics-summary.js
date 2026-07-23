// ============================================================
// RHONEYINC — RESUMO DE ANALYTICS (server-side only, admin)
//
// Agrega os dados de public.page_views: total de acessos, dispositivos,
// navegadores, top países/cidades e acessos por dia (últimos 14 dias).
// Mesma lógica de autenticação do api/metrics-meupet.js: valida o
// token de sessão e confirma que quem pediu é admin antes de responder.
//
// Variáveis de ambiente exigidas:
//   RHONEYINC_SUPABASE_URL
//   RHONEYINC_SERVICE_ROLE_KEY
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

  const SUPABASE_URL = process.env.RHONEYINC_SUPABASE_URL;
  const SERVICE_KEY = process.env.RHONEYINC_SERVICE_ROLE_KEY;
  if (!SUPABASE_URL || !SERVICE_KEY) {
    res.status(500).json({ error: 'Analytics ainda não configurado (variáveis de ambiente ausentes).' });
    return;
  }

  const admin = createClient(SUPABASE_URL, SERVICE_KEY);

  const { data: userData, error: userError } = await admin.auth.getUser(token);
  if (userError || !userData?.user) {
    res.status(401).json({ error: 'Sessão inválida.' });
    return;
  }

  const { data: profile, error: profileError } = await admin
    .from('profiles')
    .select('role')
    .eq('id', userData.user.id)
    .single();

  if (profileError || profile?.role !== 'admin') {
    res.status(403).json({ error: 'Acesso restrito a administradores.' });
    return;
  }

  try {
    const agora = new Date();
    const inicio7d = new Date(agora.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const inicio30d = new Date(agora.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();
    const inicio14d = new Date(agora.getTime() - 14 * 24 * 60 * 60 * 1000).toISOString();

    const contar = async (filtroTempo) => {
      let query = admin.from('page_views').select('*', { count: 'exact', head: true });
      if (filtroTempo) query = query.gte('created_at', filtroTempo);
      const { count, error } = await query;
      if (error) throw error;
      return count ?? 0;
    };

    const [totalGeral, total7d, total30d, linhas] = await Promise.all([
      contar(),
      contar(inicio7d),
      contar(inicio30d),
      admin
        .from('page_views')
        .select('device, browser, country, region, city, created_at')
        .gte('created_at', inicio30d)
        .limit(5000),
    ]);

    if (linhas.error) throw linhas.error;
    const rows = linhas.data || [];

    const contarPor = (campo) => {
      const mapa = {};
      for (const row of rows) {
        const chave = row[campo] || 'Desconhecido';
        mapa[chave] = (mapa[chave] || 0) + 1;
      }
      return Object.entries(mapa)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 8)
        .map(([label, total]) => ({ label, total }));
    };

    const porDia = {};
    for (const row of rows) {
      if (row.created_at < inicio14d) continue;
      const dia = row.created_at.slice(0, 10);
      porDia[dia] = (porDia[dia] || 0) + 1;
    }

    res.status(200).json({
      total_geral: totalGeral,
      total_7d: total7d,
      total_30d: total30d,
      dispositivos: contarPor('device'),
      navegadores: contarPor('browser'),
      paises: contarPor('country'),
      cidades: contarPor('city'),
      por_dia: Object.entries(porDia).sort(([a], [b]) => a.localeCompare(b)).map(([dia, total]) => ({ dia, total })),
    });
  } catch (err) {
    res.status(500).json({ error: 'Erro ao consultar analytics.' });
  }
};
