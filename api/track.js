// ============================================================
// RHONEYINC — REGISTRO DE ACESSO (server-side only)
//
// Grava um evento de visita: caminho, dispositivo, navegador e
// localização aproximada (país/região/cidade), lidos dos headers de
// geolocalização que a própria Vercel injeta em toda requisição —
// nunca lemos ou guardamos o IP bruto do visitante.
//
// Por quê isso é uma função serverless: a tabela page_views não tem
// nenhuma policy de insert (só admin pode SELECT). A gravação usa a
// service_role key, que só pode viver no servidor — nunca no navegador.
//
// Variáveis de ambiente exigidas (mesmas do api/metrics-meupet.js):
//   RHONEYINC_SUPABASE_URL
//   RHONEYINC_SERVICE_ROLE_KEY
// ============================================================

const { createClient } = require('@supabase/supabase-js');

function detectarDispositivo(userAgent) {
  const ua = (userAgent || '').toLowerCase();
  if (/ipad|tablet/.test(ua)) return 'tablet';
  if (/mobi|iphone|android/.test(ua)) return 'mobile';
  return 'desktop';
}

function detectarNavegador(userAgent) {
  const ua = userAgent || '';
  if (/edg\//i.test(ua)) return 'Edge';
  if (/chrome\//i.test(ua) && !/chromium/i.test(ua)) return 'Chrome';
  if (/firefox\//i.test(ua)) return 'Firefox';
  if (/safari\//i.test(ua) && !/chrome/i.test(ua)) return 'Safari';
  return 'Outro';
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Método não permitido.' });
    return;
  }

  const SUPABASE_URL = process.env.RHONEYINC_SUPABASE_URL;
  const SERVICE_KEY = process.env.RHONEYINC_SERVICE_ROLE_KEY;
  if (!SUPABASE_URL || !SERVICE_KEY) {
    // Não quebra a experiência do visitante — analytics é best-effort.
    res.status(200).json({ ok: false, reason: 'not_configured' });
    return;
  }

  const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
  const path = typeof body.path === 'string' ? body.path.slice(0, 200) : '/';

  const admin = createClient(SUPABASE_URL, SERVICE_KEY);

  const { error } = await admin.from('page_views').insert({
    path,
    device: detectarDispositivo(req.headers['user-agent']),
    browser: detectarNavegador(req.headers['user-agent']),
    country: req.headers['x-vercel-ip-country'] || null,
    region: req.headers['x-vercel-ip-country-region'] || null,
    city: req.headers['x-vercel-ip-city'] ? decodeURIComponent(req.headers['x-vercel-ip-city']) : null,
    referrer: (req.headers['referer'] || '').slice(0, 300) || null,
  });

  if (error) {
    res.status(200).json({ ok: false });
    return;
  }

  res.status(200).json({ ok: true });
};
