// ============================================================
// RHONEYINC — ADMIN.JS
// Painel para administradores gerenciarem propostas e parceiros.
// Protegido por RLS no banco — mesmo que alguém veja este JS,
// as queries só retornam dados se o usuário logado for admin.
// ============================================================

async function carregarPainelAdmin(){
  if(typeof clienteDisponivel === 'function' && !clienteDisponivel()) return;
  await carregarMetricas();
  await carregarMetricasMeuPet();
  await carregarAnalytics();
  await carregarUsuarios();
  await carregarPropostas();
  await carregarParceirosAdmin();
  await carregarCursosAdmin();
}

// ---------- MÉTRICAS ----------
async function carregarMetricas(){
  const container = document.getElementById('adminMetricas');
  if(!container) return;

  const [
    { count: totalUsuarios },
    { count: totalPendentes },
    { count: totalAprovadas },
    { count: totalRejeitadas },
    { count: parceirosAtivos },
    { count: softwaresAtivos }
  ] = await Promise.all([
    supabaseClient.from('profiles').select('*', { count: 'exact', head: true }),
    supabaseClient.from('partner_proposals').select('*', { count: 'exact', head: true }).eq('status', 'pendente'),
    supabaseClient.from('partner_proposals').select('*', { count: 'exact', head: true }).eq('status', 'aprovado'),
    supabaseClient.from('partner_proposals').select('*', { count: 'exact', head: true }).eq('status', 'rejeitado'),
    supabaseClient.from('partners').select('*', { count: 'exact', head: true }).eq('ativo', true),
    supabaseClient.from('softwares').select('*', { count: 'exact', head: true }).eq('ativo', true)
  ]);

  container.innerHTML = `
    <div class="admin-stat accent-blue"><span class="num">${totalUsuarios ?? 0}</span><span class="lbl">CONTAS CADASTRADAS</span></div>
    <div class="admin-stat"><span class="num">${totalPendentes ?? 0}</span><span class="lbl">PROPOSTAS PENDENTES</span></div>
    <div class="admin-stat"><span class="num">${totalAprovadas ?? 0}</span><span class="lbl">PROPOSTAS APROVADAS</span></div>
    <div class="admin-stat"><span class="num">${totalRejeitadas ?? 0}</span><span class="lbl">PROPOSTAS REJEITADAS</span></div>
    <div class="admin-stat accent-blue"><span class="num">${parceirosAtivos ?? 0}</span><span class="lbl">PARCEIROS ATIVOS</span></div>
    <div class="admin-stat accent-blue"><span class="num">${softwaresAtivos ?? 0}</span><span class="lbl">SOFTWARES NO AR</span></div>
  `;
}

// ---------- MÉTRICAS DO MEUPET (via função serverless, sem chave no navegador) ----------
async function carregarMetricasMeuPet(){
  const container = document.getElementById('adminMetricasMeuPet');
  if(!container) return;

  const { data: { session } } = await supabaseClient.auth.getSession();
  if(!session){
    container.innerHTML = `<p class="admin-empty">Sessão inválida.</p>`;
    return;
  }

  try{
    const resp = await fetch('/api/metrics-meupet', {
      headers: { Authorization: `Bearer ${session.access_token}` }
    });
    const dados = await resp.json();

    if(!resp.ok){
      container.innerHTML = `<p class="admin-empty">Integração com o MeuPet ainda não configurada (${escapeHtml(dados.error || 'erro desconhecido')}).</p>`;
      return;
    }

    container.innerHTML = `
      <div class="admin-stat accent-blue"><span class="num">${dados.tutores}</span><span class="lbl">TUTORES CADASTRADOS</span></div>
      <div class="admin-stat"><span class="num">${dados.pets}</span><span class="lbl">PETS CADASTRADOS</span></div>
      <div class="admin-stat"><span class="num">${dados.posts}</span><span class="lbl">POSTS NO FEED</span></div>
      <div class="admin-stat accent-blue"><span class="num">${dados.adocoes_ativas}</span><span class="lbl">ANÚNCIOS DE ADOÇÃO ATIVOS</span></div>
      <div class="admin-stat"><span class="num">${dados.petshops}</span><span class="lbl">PETSHOPS CADASTRADOS</span></div>
      <div class="admin-stat accent-blue"><span class="num">${dados.assinaturas_pagas}</span><span class="lbl">ASSINATURAS PAGAS</span></div>
    `;
  } catch(err){
    container.innerHTML = `<p class="admin-empty">Não foi possível carregar as métricas do MeuPet agora.</p>`;
  }
}

// ---------- ANALYTICS DE ACESSO (via função serverless, sem chave no navegador) ----------

// Paleta categórica validada (dataviz skill) para modo escuro, checada contra
// a superfície --verde-rio dos cards do admin. Ordem fixa — nunca reordenar
// por ranking, só por identidade (mesma cor sempre = mesma categoria).
const RHONEYINC_CHART_CATEGORICAL = ['#3987e5', '#008300', '#d55181', '#c98500', '#199e70', '#d95926', '#9085e9', '#e66767'];
const RHONEYINC_CHART_SEQUENCIAL = '#3987e5'; // azul único — usado quando a cor é só magnitude (ranking), não identidade

function renderBarRank(items, { categorico = false } = {}){
  if(!items || items.length === 0) return `<p class="chart-empty">Sem dados ainda.</p>`;
  const max = items[0].total;
  return `<div class="bar-rank">${items.map((i, idx) => {
    const cor = categorico ? RHONEYINC_CHART_CATEGORICAL[idx % RHONEYINC_CHART_CATEGORICAL.length] : RHONEYINC_CHART_SEQUENCIAL;
    const pct = Math.max(3, Math.round(i.total / max * 100));
    return `
      <div class="bar-rank-row">
        <div class="bar-rank-label" title="${escapeHtml(i.label)}">
          ${categorico ? `<span class="bar-rank-swatch" style="background:${cor};"></span>` : ''}
          ${escapeHtml(i.label)}
        </div>
        <div class="bar-rank-track"><div class="bar-rank-fill" style="width:${pct}%; background:${cor};"></div></div>
        <div class="bar-rank-value">${i.total}</div>
      </div>
    `;
  }).join('')}</div>`;
}

// Gráfico de pizza (donut, SVG) com legenda e tooltip por fatia — usado para
// composição categórica de poucos grupos (Dispositivos, Navegadores), onde a
// pergunta é "que fatia do total" e não "ranking de muitos itens" (isso continua
// sendo o job do renderBarRank, ex: Países/Cidades).
function polarToCartesian(cx, cy, r, angleDeg){
  const a = (angleDeg - 90) * Math.PI / 180;
  return { x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) };
}

function donutSlicePath(cx, cy, rOuter, rInner, startAngle, endAngle){
  // Um arco de exatos 360° degenera (ponto inicial == ponto final, SVG não
  // desenha nada) — uma categoria sozinha com 100% cai nesse caso. Desenha
  // em duas metades de 180° pra sempre fechar o anel.
  if(endAngle - startAngle >= 359.99){
    const meio = startAngle + (endAngle - startAngle) / 2;
    return donutSlicePath(cx, cy, rOuter, rInner, startAngle, meio)
      + ' ' + donutSlicePath(cx, cy, rOuter, rInner, meio, endAngle);
  }
  const largeArc = endAngle - startAngle > 180 ? 1 : 0;
  const p1 = polarToCartesian(cx, cy, rOuter, startAngle);
  const p2 = polarToCartesian(cx, cy, rOuter, endAngle);
  const p3 = polarToCartesian(cx, cy, rInner, endAngle);
  const p4 = polarToCartesian(cx, cy, rInner, startAngle);
  return `M ${p1.x} ${p1.y} A ${rOuter} ${rOuter} 0 ${largeArc} 1 ${p2.x} ${p2.y} L ${p3.x} ${p3.y} A ${rInner} ${rInner} 0 ${largeArc} 0 ${p4.x} ${p4.y} Z`;
}

function renderPieChart(container, items, centerLabel = 'TOTAL'){
  if(!container) return;
  if(!items || items.length === 0){
    container.innerHTML = `<p class="chart-empty">Sem dados ainda.</p>`;
    return;
  }

  const total = items.reduce((s, i) => s + i.total, 0);
  const cx = 65, cy = 65, rOuter = 60, rInner = 34;
  const gapDeg = items.length > 1 ? 2.2 : 0; // respiro de superfície entre fatias

  let angle = 0;
  const slices = items.map((i, idx) => {
    const cor = RHONEYINC_CHART_CATEGORICAL[idx % RHONEYINC_CHART_CATEGORICAL.length];
    const fatia = total > 0 ? (i.total / total) * 360 : 0;
    const start = angle + gapDeg / 2;
    const end = angle + fatia - gapDeg / 2;
    angle += fatia;
    const path = end > start ? donutSlicePath(cx, cy, rOuter, rInner, start, end) : '';
    return { ...i, cor, path, pct: total > 0 ? Math.round(i.total / total * 100) : 0 };
  });

  container.innerHTML = `
    <div class="pie-wrap">
      <div class="pie-svg-wrap">
        <svg class="chart-svg" viewBox="0 0 130 130" role="img" aria-label="Composição por ${escapeHtml(centerLabel)}">
          ${slices.map((s, idx) => s.path ? `<path class="pie-slice" data-idx="${idx}" d="${s.path}" fill="${s.cor}"/>` : '').join('')}
        </svg>
        <div class="pie-center-label"><span class="pcl-n">${total}</span><span class="pcl-l">${escapeHtml(centerLabel)}</span></div>
      </div>
      <div class="pie-legend">
        ${slices.map((s, idx) => `
          <div class="pie-legend-item" data-idx="${idx}">
            <span class="pie-legend-swatch" style="background:${s.cor};"></span>
            <span class="pli-label" title="${escapeHtml(s.label)}">${escapeHtml(s.label)}</span>
            <span class="pli-value">${s.total}</span>
            <span class="pli-pct">${s.pct}%</span>
          </div>
        `).join('')}
      </div>
    </div>
    <div class="chart-tooltip"></div>
  `;

  const tooltip = container.querySelector('.chart-tooltip');

  const destacar = (idx, ativo) => {
    container.querySelectorAll('.pie-slice').forEach(el => {
      if(Number(el.dataset.idx) === idx) el.classList.toggle('is-active', ativo);
    });
  };

  container.querySelectorAll('[data-idx]').forEach((el) => {
    const idx = Number(el.dataset.idx);
    const s = slices[idx];
    el.addEventListener('mouseenter', (e) => {
      destacar(idx, true);
      const rect = container.getBoundingClientRect();
      tooltip.innerHTML = `${escapeHtml(s.label)}<span class="tt-value">${s.total} · ${s.pct}%</span>`;
      tooltip.style.opacity = '1';
      tooltip.style.left = `${(e.clientX - rect.left) + 12}px`;
      tooltip.style.top = `${(e.clientY - rect.top) - 10}px`;
    });
    el.addEventListener('mousemove', (e) => {
      const rect = container.getBoundingClientRect();
      tooltip.style.left = `${(e.clientX - rect.left) + 12}px`;
      tooltip.style.top = `${(e.clientY - rect.top) - 10}px`;
    });
    el.addEventListener('mouseleave', () => {
      destacar(idx, false);
      tooltip.style.opacity = '0';
    });
  });
}

// Gráfico de barras (SVG) com tooltip por barra — usado pro total de acessos
// por dia. Trocado de linha pra barras de propósito: com poucos dias de
// rastreamento (site novo), uma linha entre 1-2 pontos sugere uma "tendência"
// contínua que não existe — contagem discreta por dia é o job de um gráfico
// de barras, não de linha. Série única: sem legenda (o título já identifica).
function renderTrendChart(container, porDia){
  if(!container) return;
  if(!porDia || porDia.length === 0){
    container.innerHTML = `<p class="chart-empty">Sem dados ainda.</p>`;
    return;
  }

  const W = 720, H = 220, padL = 34, padR = 12, padT = 16, padB = 26;
  const plotW = W - padL - padR, plotH = H - padT - padB;
  const maxVal = Math.max(1, ...porDia.map(d => d.total));
  const yTicks = 4;

  const gap = 6; // respiro fixo entre barras (spec: 2px+ de gap de superfície)
  const slot = plotW / porDia.length;
  const barW = Math.max(4, Math.min(48, slot - gap));

  const xCenterAt = i => padL + slot * i + slot / 2;
  const yAt = v => padT + plotH - (v / maxVal) * plotH;
  const barRadius = Math.min(4, barW / 2);

  const gridLines = Array.from({ length: yTicks + 1 }, (_, i) => {
    const v = Math.round(maxVal * i / yTicks);
    const y = yAt(v);
    return `<line class="chart-grid-line" x1="${padL}" y1="${y}" x2="${W - padR}" y2="${y}"/><text class="chart-axis-label" x="${padL - 8}" y="${y + 3}" text-anchor="end">${v}</text>`;
  }).join('');

  // Mostra só ~6 rótulos de data no eixo X, pra não poluir com muitas barras.
  const labelEvery = Math.max(1, Math.ceil(porDia.length / 6));
  const xLabels = porDia.map((d, i) => {
    if(i % labelEvery !== 0 && i !== porDia.length - 1) return '';
    const [, mes, dia] = d.dia.split('-');
    return `<text class="chart-axis-label" x="${xCenterAt(i)}" y="${H - 6}" text-anchor="middle">${dia}/${mes}</text>`;
  }).join('');

  const bars = porDia.map((d, i) => {
    const x = xCenterAt(i) - barW / 2;
    const y = yAt(d.total);
    const h = Math.max(1.5, padT + plotH - y);
    return `<rect class="chart-bar" data-idx="${i}" x="${x}" y="${y}" width="${barW}" height="${h}" rx="${barRadius}" fill="${RHONEYINC_CHART_SEQUENCIAL}"/>`;
  }).join('');

  // Barra invisível de largura total do slot, mais fácil de acertar no hover/toque
  // do que a barra visual estreita.
  const hitAreas = porDia.map((d, i) => `<rect class="chart-bar-hit" data-idx="${i}" x="${padL + slot * i}" y="${padT}" width="${slot}" height="${plotH}" fill="transparent"/>`).join('');

  container.innerHTML = `
    <svg class="chart-svg" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" role="img" aria-label="Acessos por dia">
      ${gridLines}
      ${bars}
      ${xLabels}
      ${hitAreas}
    </svg>
    <div class="chart-tooltip"></div>
  `;

  const svg = container.querySelector('svg');
  const tooltip = container.querySelector('.chart-tooltip');
  const barEls = container.querySelectorAll('.chart-bar');

  container.querySelectorAll('.chart-bar-hit').forEach((hit) => {
    const idx = Number(hit.dataset.idx);
    const d = porDia[idx];
    const barEl = barEls[idx];

    hit.addEventListener('mouseenter', (e) => {
      barEl.classList.add('is-active');
      const rect = svg.getBoundingClientRect();
      const [, mes, dia] = d.dia.split('-');
      tooltip.innerHTML = `${dia}/${mes}<span class="tt-value">${d.total} acesso${d.total === 1 ? '' : 's'}</span>`;
      tooltip.style.opacity = '1';
      tooltip.style.left = `${(e.clientX - rect.left) + 12}px`;
      tooltip.style.top = `${(e.clientY - rect.top) - 10}px`;
    });
    hit.addEventListener('mousemove', (e) => {
      const rect = svg.getBoundingClientRect();
      tooltip.style.left = `${(e.clientX - rect.left) + 12}px`;
      tooltip.style.top = `${(e.clientY - rect.top) - 10}px`;
    });
    hit.addEventListener('mouseleave', () => {
      barEl.classList.remove('is-active');
      tooltip.style.opacity = '0';
    });
  });
}

async function carregarAnalytics(){
  const resumo = document.getElementById('adminAnalyticsResumo');
  if(!resumo) return;

  const { data: { session } } = await supabaseClient.auth.getSession();
  if(!session){
    resumo.innerHTML = `<p class="admin-empty">Sessão inválida.</p>`;
    return;
  }

  try{
    const resp = await fetch('/api/analytics-summary', {
      headers: { Authorization: `Bearer ${session.access_token}` }
    });
    const dados = await resp.json();

    if(!resp.ok){
      resumo.innerHTML = `<p class="admin-empty">Analytics ainda não configurado (${escapeHtml(dados.error || 'erro desconhecido')}).</p>`;
      ['adminAnalyticsTendencia','adminAnalyticsDispositivos','adminAnalyticsNavegadores','adminAnalyticsPaises','adminAnalyticsCidades'].forEach(id => {
        const el = document.getElementById(id);
        if(el) el.innerHTML = '';
      });
      return;
    }

    resumo.innerHTML = `
      <div class="admin-stat accent-blue"><span class="num">${dados.total_geral}</span><span class="lbl">ACESSOS NO TOTAL</span></div>
      <div class="admin-stat"><span class="num">${dados.total_7d}</span><span class="lbl">ÚLTIMOS 7 DIAS</span></div>
      <div class="admin-stat"><span class="num">${dados.total_30d}</span><span class="lbl">ÚLTIMOS 30 DIAS</span></div>
    `;

    renderTrendChart(document.getElementById('adminAnalyticsTendencia'), dados.por_dia);

    renderPieChart(document.getElementById('adminAnalyticsDispositivos'), dados.dispositivos, 'ACESSOS');
    renderPieChart(document.getElementById('adminAnalyticsNavegadores'), dados.navegadores, 'ACESSOS');
    document.getElementById('adminAnalyticsPaises').innerHTML = renderBarRank(dados.paises);
    document.getElementById('adminAnalyticsCidades').innerHTML = renderBarRank(dados.cidades);
  } catch(err){
    resumo.innerHTML = `<p class="admin-empty">Não foi possível carregar o analytics agora.</p>`;
  }
}

// ---------- USUÁRIOS ----------
async function carregarUsuarios(){
  const container = document.getElementById('adminUsuarios');
  if(!container) return;

  const { data: { session } } = await supabaseClient.auth.getSession();
  const meuId = session?.user?.id;

  const { data, error } = await supabaseClient
    .from('profiles')
    .select('*')
    .order('created_at', { ascending: false });

  if(error){
    container.innerHTML = `<p class="admin-empty">Erro ao carregar usuários. Confirme se você está logado como admin.</p>`;
    return;
  }

  if(!data || data.length === 0){
    container.innerHTML = `<p class="admin-empty">Nenhum usuário cadastrado ainda.</p>`;
    return;
  }

  container.innerHTML = data.map(u => `
    <div class="admin-row" data-id="${u.id}">
      <div class="admin-row-main">
        <div class="admin-row-top">
          <strong>${escapeHtml(u.nome)}</strong>
          <span class="status-badge ${u.role === 'admin' ? 'status-aprovado' : 'status-pendente'}">${u.role}</span>
        </div>
        <div class="admin-row-meta">${escapeHtml(u.email)} · desde ${new Date(u.created_at).toLocaleDateString('pt-BR')}</div>
      </div>
      <div class="admin-row-actions">
        ${u.id === meuId
          ? '<span class="admin-row-meta">essa é sua conta</span>'
          : `<button class="btn-mini ${u.role === 'admin' ? 'btn-mini-no' : 'btn-mini-ok'}" onclick="alterarRoleUsuario('${u.id}', '${u.role === 'admin' ? 'user' : 'admin'}')">${u.role === 'admin' ? 'Remover admin' : 'Tornar admin'}</button>`
        }
      </div>
    </div>
  `).join('');
}

async function alterarRoleUsuario(id, novoRole){
  const acao = novoRole === 'admin' ? 'promover este usuário a admin' : 'remover o acesso admin deste usuário';
  if(!confirm(`Confirma ${acao}?`)) return;
  const { error } = await supabaseClient.from('profiles').update({ role: novoRole }).eq('id', id);
  if(error){ alert('Erro ao atualizar usuário.'); return; }
  carregarUsuarios();
  carregarMetricas();
}

// ---------- SOFTWARES (formulário de adição — a lista de gestão foi removida a pedido) ----------
function cancelarEdicaoSoftware(){
  document.getElementById('formNovoSoftware')?.reset();
  document.getElementById('sw-id').value = '';
}

// ---------- PROPOSTAS RECEBIDAS ----------
async function carregarPropostas(filtro){
  const container = document.getElementById('adminPropostas');
  if(!container) return;

  let query = supabaseClient.from('partner_proposals').select('*').order('created_at', { ascending: false });
  if(filtro && filtro !== 'todas'){
    query = query.eq('status', filtro);
  }

  const { data, error } = await query;

  if(error){
    container.innerHTML = `<p class="admin-empty">Erro ao carregar propostas. Confirme se você está logado como admin.</p>`;
    return;
  }

  if(!data || data.length === 0){
    container.innerHTML = `<p class="admin-empty">Nenhuma proposta encontrada.</p>`;
    return;
  }

  container.innerHTML = data.map(p => `
    <div class="admin-row" data-id="${p.id}">
      <div class="admin-row-main">
        <div class="admin-row-top">
          <strong>${escapeHtml(p.nome)}</strong> — ${escapeHtml(p.empresa)}
          <span class="status-badge status-${p.status}">${p.status}</span>
        </div>
        <div class="admin-row-meta">${escapeHtml(p.email)} · ${escapeHtml(p.tipo)} · ${new Date(p.created_at).toLocaleDateString('pt-BR')}</div>
        <p class="admin-row-msg">${escapeHtml(p.mensagem)}</p>
      </div>
      <div class="admin-row-actions">
        ${p.status !== 'aprovado' ? `<button class="btn-mini btn-mini-ok" onclick="aprovarProposta('${p.id}', '${escapeHtml(p.nome).replace(/'/g, "\\'")}', '${escapeHtml(p.tipo)}')">Aprovar</button>` : ''}
        ${p.status !== 'rejeitado' ? `<button class="btn-mini btn-mini-no" onclick="alterarStatusProposta('${p.id}', 'rejeitado')">Rejeitar</button>` : ''}
        <button class="btn-mini btn-mini-del" onclick="excluirProposta('${p.id}')">Excluir</button>
      </div>
    </div>
  `).join('');
}

async function alterarStatusProposta(id, status){
  const { error } = await supabaseClient.from('partner_proposals').update({ status }).eq('id', id);
  if(error){ alert('Erro ao atualizar status.'); return; }
  carregarPropostas(document.getElementById('filtroStatus')?.value);
}

async function aprovarProposta(id, nome, tipo){
  await alterarStatusProposta(id, 'aprovado');
  // Pré-preenche o form de novo parceiro pra agilizar
  const nomeInput = document.getElementById('np-nome');
  const tipoInput = document.getElementById('np-tipo');
  if(nomeInput) nomeInput.value = nome;
  if(tipoInput) tipoInput.value = tipo;
  document.getElementById('admin-novo-parceiro')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

async function excluirProposta(id){
  if(!confirm('Excluir esta proposta permanentemente?')) return;
  const { error } = await supabaseClient.from('partner_proposals').delete().eq('id', id);
  if(error){ alert('Erro ao excluir.'); return; }
  carregarPropostas(document.getElementById('filtroStatus')?.value);
}

// ---------- PARCEIROS (gerenciamento) ----------
async function carregarParceirosAdmin(){
  const container = document.getElementById('adminParceiros');
  if(!container) return;

  const { data, error } = await supabaseClient
    .from('partners')
    .select('*')
    .order('ordem', { ascending: true });

  if(error){
    container.innerHTML = `<p class="admin-empty">Erro ao carregar parceiros.</p>`;
    return;
  }

  if(!data || data.length === 0){
    container.innerHTML = `<p class="admin-empty">Nenhum parceiro cadastrado ainda.</p>`;
    return;
  }

  container.innerHTML = data.map(p => `
    <div class="admin-row" data-id="${p.id}">
      <div class="admin-row-main">
        <div class="admin-row-top">
          <strong>${escapeHtml(p.nome)}</strong>
          <span class="status-badge ${p.ativo ? 'status-aprovado' : 'status-rejeitado'}">${p.ativo ? 'ativo' : 'inativo'}</span>
        </div>
        <div class="admin-row-meta">${escapeHtml(p.tipo)} ${p.link_url ? '· ' + escapeHtml(p.link_url) : ''}</div>
      </div>
      <div class="admin-row-actions">
        <button class="btn-mini ${p.ativo ? 'btn-mini-no' : 'btn-mini-ok'}" onclick="togglePartnerAtivo('${p.id}', ${!p.ativo})">${p.ativo ? 'Desativar' : 'Ativar'}</button>
        <button class="btn-mini btn-mini-del" onclick="excluirParceiro('${p.id}')">Excluir</button>
      </div>
    </div>
  `).join('');
}

async function togglePartnerAtivo(id, novoEstado){
  const { error } = await supabaseClient.from('partners').update({ ativo: novoEstado }).eq('id', id);
  if(error){ alert('Erro ao atualizar parceiro.'); return; }
  carregarParceirosAdmin();
  carregarParceirosPublicos();
}

async function excluirParceiro(id){
  if(!confirm('Remover este parceiro definitivamente?')) return;
  const { error } = await supabaseClient.from('partners').delete().eq('id', id);
  if(error){ alert('Erro ao excluir.'); return; }
  carregarParceirosAdmin();
  carregarParceirosPublicos();
}

// ---------- CURSOS (curadoria manual) ----------
const LABEL_PRECO_CURSO = { gratuito: 'Gratuito', pago_variavel: 'Pago (com opções acessíveis)' };
let __cursosAdminCache = [];

async function carregarCursosAdmin(){
  const container = document.getElementById('adminCursos');
  if(!container) return;

  const { data, error } = await supabaseClient
    .from('cursos')
    .select('*')
    .order('ordem', { ascending: true });

  if(error){
    container.innerHTML = `<p class="admin-empty">Erro ao carregar cursos.</p>`;
    return;
  }

  __cursosAdminCache = data || [];

  if(__cursosAdminCache.length === 0){
    container.innerHTML = `<p class="admin-empty">Nenhum curso cadastrado ainda.</p>`;
    return;
  }

  container.innerHTML = __cursosAdminCache.map(c => `
    <div class="admin-row" data-id="${c.id}">
      <div class="admin-row-main">
        <div class="admin-row-top">
          <strong>${escapeHtml(c.titulo)}</strong>
          <span class="status-badge ${c.ativo ? 'status-aprovado' : 'status-rejeitado'}">${c.ativo ? 'ativo' : 'inativo'}</span>
        </div>
        <div class="admin-row-meta">${escapeHtml(c.categoria)} · ${LABEL_PRECO_CURSO[c.preco_tipo] || c.preco_tipo}</div>
      </div>
      <div class="admin-row-actions">
        <button class="btn-mini" onclick="editarCurso('${c.id}')">Editar</button>
        <button class="btn-mini ${c.ativo ? 'btn-mini-no' : 'btn-mini-ok'}" onclick="toggleCursoAtivo('${c.id}', ${!c.ativo})">${c.ativo ? 'Desativar' : 'Ativar'}</button>
        <button class="btn-mini btn-mini-del" onclick="excluirCurso('${c.id}')">Excluir</button>
      </div>
    </div>
  `).join('');
}

function editarCurso(id){
  const c = __cursosAdminCache.find(x => x.id === id);
  if(!c) return;
  document.getElementById('cu-id').value = c.id;
  document.getElementById('cu-titulo').value = c.titulo;
  document.getElementById('cu-categoria').value = c.categoria;
  document.getElementById('cu-preco').value = c.preco_tipo;
  document.getElementById('cu-desc').value = c.descricao || '';
  document.getElementById('cu-url').value = c.url;
  document.getElementById('cu-ordem').value = c.ordem;
  document.getElementById('cu-submit-btn').textContent = 'Salvar alterações';
  document.getElementById('admin-novo-curso')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

function cancelarEdicaoCurso(){
  document.getElementById('formNovoCurso')?.reset();
  document.getElementById('cu-id').value = '';
  document.getElementById('cu-submit-btn').textContent = 'Adicionar curso';
}

async function toggleCursoAtivo(id, novoEstado){
  const { error } = await supabaseClient.from('cursos').update({ ativo: novoEstado }).eq('id', id);
  if(error){ alert('Erro ao atualizar curso.'); return; }
  carregarCursosAdmin();
  carregarCursos();
}

async function excluirCurso(id){
  if(!confirm('Remover este curso definitivamente?')) return;
  const { error } = await supabaseClient.from('cursos').delete().eq('id', id);
  if(error){ alert('Erro ao excluir.'); return; }
  carregarCursosAdmin();
  carregarCursos();
}

// ---------- NOVO PARCEIRO (form manual no admin) ----------
document.addEventListener('DOMContentLoaded', function(){
  const novoParceiroForm = document.getElementById('formNovoParceiro');
  if(novoParceiroForm){
    novoParceiroForm.addEventListener('submit', async function(e){
      e.preventDefault();
      const payload = {
        nome: document.getElementById('np-nome').value.trim(),
        tipo: document.getElementById('np-tipo').value,
        descricao: document.getElementById('np-desc').value.trim(),
        link_url: document.getElementById('np-link').value.trim() || null,
        logo_url: document.getElementById('np-logo').value.trim() || null
      };
      const { error } = await supabaseClient.from('partners').insert(payload);
      if(error){ alert('Erro ao salvar parceiro: ' + error.message); return; }
      novoParceiroForm.reset();
      carregarParceirosAdmin();
      carregarParceirosPublicos();
    });
  }

  const filtroStatus = document.getElementById('filtroStatus');
  if(filtroStatus){
    filtroStatus.addEventListener('change', function(){
      carregarPropostas(this.value);
    });
  }

  const novoCursoForm = document.getElementById('formNovoCurso');
  if(novoCursoForm){
    novoCursoForm.addEventListener('submit', async function(e){
      e.preventDefault();
      const id = document.getElementById('cu-id').value;
      const payload = {
        titulo: document.getElementById('cu-titulo').value.trim(),
        categoria: document.getElementById('cu-categoria').value.trim(),
        preco_tipo: document.getElementById('cu-preco').value,
        descricao: document.getElementById('cu-desc').value.trim() || null,
        url: document.getElementById('cu-url').value.trim(),
        ordem: parseInt(document.getElementById('cu-ordem').value, 10) || 0
      };

      const { error } = id
        ? await supabaseClient.from('cursos').update(payload).eq('id', id)
        : await supabaseClient.from('cursos').insert(payload);

      if(error){ alert('Erro ao salvar curso: ' + error.message); return; }
      cancelarEdicaoCurso();
      carregarCursosAdmin();
      carregarCursos();
    });
  }

  const novoSoftwareForm = document.getElementById('formNovoSoftware');
  if(novoSoftwareForm){
    novoSoftwareForm.addEventListener('submit', async function(e){
      e.preventDefault();
      const id = document.getElementById('sw-id').value;
      const payload = {
        nome: document.getElementById('sw-nome').value.trim(),
        descricao: document.getElementById('sw-desc').value.trim(),
        status: document.getElementById('sw-status').value,
        plataforma: document.getElementById('sw-plataforma').value.trim() || 'WEB',
        link_url: document.getElementById('sw-link').value.trim() || null,
        ordem: parseInt(document.getElementById('sw-ordem').value, 10) || 0,
        logo_url: document.getElementById('sw-logo').value.trim() || null,
        cor_acento: document.getElementById('sw-cor').value || null,
        link_play_store: document.getElementById('sw-playstore').value.trim() || null,
        link_app_store: document.getElementById('sw-appstore').value.trim() || null
      };

      const { error } = id
        ? await supabaseClient.from('softwares').update(payload).eq('id', id)
        : await supabaseClient.from('softwares').insert(payload);

      if(error){ alert('Erro ao salvar software: ' + error.message); return; }
      cancelarEdicaoSoftware();
      carregarMetricas();
      if(typeof carregarSoftwaresPublicos === 'function') carregarSoftwaresPublicos();
    });
  }
});
