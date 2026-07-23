// ============================================================
// RHONEYINC — CONFIGURAÇÃO SUPABASE
// ============================================================
// 1. Crie um projeto em https://supabase.com
// 2. Rode o arquivo schema.sql no SQL Editor do seu projeto
// 3. Pegue suas chaves em: Project Settings → API
// 4. Cole abaixo no lugar de SUA_URL_AQUI e SUA_CHAVE_AQUI
//
// IMPORTANTE: a "anon public key" é segura para expor no front-end.
// NUNCA coloque a "service_role key" aqui — essa é secreta.
// ============================================================

const SUPABASE_URL = "https://crkryabvsmlraizaurnk.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_zz-Zr9hKOSfpyt0ZFsWAGw_UgNxsTwQ"; // anon/publishable public key

let supabaseClient = null;
const SUPABASE_CONFIGURADO = SUPABASE_URL !== "SUA_URL_AQUI" && SUPABASE_ANON_KEY !== "SUA_CHAVE_AQUI";

if(typeof window.supabase === "undefined"){
  console.error("RhoneyInc: SDK do Supabase não carregou (CDN bloqueado ou offline). Login, cadastro e parceiros ficarão indisponíveis.");
} else if(!SUPABASE_CONFIGURADO){
  console.warn("RhoneyInc: configure SUPABASE_URL e SUPABASE_ANON_KEY em supabase-client.js antes de usar login/cadastro.");
} else {
  supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
}
