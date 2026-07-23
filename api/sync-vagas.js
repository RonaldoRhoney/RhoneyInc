// ============================================================
// RHONEYINC — SINCRONIZAÇÃO DE VAGAS (Remotive API)
//
// Roda via Vercel Cron (vercel.json), a cada poucas horas — nunca é chamado
// direto pelo navegador do visitante. Busca vagas remotas de tecnologia na
// API pública da Remotive (sem API key), filtra por categoria relevante, e
// grava/atualiza em public.vagas via service_role key (RLS só permite
// leitura pública, escrita é só daqui).
//
// A RhoneyInc não hospeda candidaturas: cada vaga guarda um "url_linkedin"
// pronto — se a vaga já é do domínio linkedin.com, usa direto; senão, gera
// uma busca no LinkedIn por título + empresa.
//
// Variáveis de ambiente exigidas (painel da Vercel):
//   RHONEYINC_SUPABASE_URL
//   RHONEYINC_SERVICE_ROLE_KEY
// ============================================================

import { createClient } from '@supabase/supabase-js';

const CATEGORIAS_ALVO = ['software', 'engineering', 'product', 'ai', 'data', 'leadership', 'management'];

function categoriaDaVaga(remotiveCategory, title) {
  const texto = `${remotiveCategory || ''} ${title || ''}`.toLowerCase();
  if (/\bai\b|inteligência artificial|machine learning|ml engineer/.test(texto)) return 'IA';
  if (/lideran|leadership|head of|director|vp |chief/.test(texto)) return 'Liderança';
  if (/product manager|product owner|produto/.test(texto)) return 'Produto';
  if (/\bdata\b|dados|analytics|analista/.test(texto)) return 'Dados';
  if (/management|manager/.test(texto)) return 'Gestão';
  return 'Engenharia';
}

function linkLinkedin(url, titulo, empresa) {
  try {
    const parsed = new URL(url);
    if (parsed.hostname.includes('linkedin.com')) return url;
  } catch {
    // url inválida — cai no fallback de busca abaixo
  }
  const query = encodeURIComponent(`${titulo} ${empresa}`);
  return `https://www.linkedin.com/jobs/search/?keywords=${query}`;
}

export default async function handler(req, res) {
  const SUPABASE_URL = process.env.RHONEYINC_SUPABASE_URL;
  const SERVICE_KEY = process.env.RHONEYINC_SERVICE_ROLE_KEY;
  if (!SUPABASE_URL || !SERVICE_KEY) {
    res.status(500).json({ error: 'not_configured' });
    return;
  }

  const remotiveResp = await fetch('https://remotive.com/api/remote-jobs?category=software-dev');
  if (!remotiveResp.ok) {
    res.status(502).json({ error: 'remotive_unavailable' });
    return;
  }
  const remotiveData = await remotiveResp.json();
  const jobs = Array.isArray(remotiveData.jobs) ? remotiveData.jobs : [];

  const filtradas = jobs.filter((job) => {
    const texto = `${job.title || ''} ${job.category || ''} ${job.tags?.join(' ') || ''}`.toLowerCase();
    return CATEGORIAS_ALVO.some((termo) => texto.includes(termo));
  });

  const admin = createClient(SUPABASE_URL, SERVICE_KEY);

  const linhas = filtradas.map((job) => ({
    titulo: job.title,
    empresa: job.company_name,
    localizacao: job.candidate_required_location || null,
    categoria: categoriaDaVaga(job.category, job.title),
    descricao_resumo: (job.description || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 280) || null,
    url_original: job.url,
    url_linkedin: linkLinkedin(job.url, job.title, job.company_name),
    fonte_api: 'remotive',
    fonte_id: String(job.id),
    data_publicacao: job.publication_date || null,
    data_sincronizacao: new Date().toISOString(),
  }));

  if (linhas.length === 0) {
    res.status(200).json({ ok: true, sincronizadas: 0 });
    return;
  }

  const { error } = await admin.from('vagas').upsert(linhas, { onConflict: 'fonte_api,fonte_id' });

  if (error) {
    res.status(500).json({ error: error.message });
    return;
  }

  res.status(200).json({ ok: true, sincronizadas: linhas.length });
}
