// PetCare Hub · Edge Function convidar-membro (AC-02)
//
// Chamada pelo painel (aba Configuração → Acessos), só por super admin Harpia.
// 1. Confere quem chamou (JWT do usuário) e se é super admin (harpia_equipe).
// 2. auth.admin.inviteUserByEmail: cria o usuário e envia o e-mail do template
//    "Invite user" (supabase/templates/invite-user.html) pelo SMTP do Resend.
// 3. public.admin_vincular_membro: cria o vínculo em petshop_membros.
//    Se o vínculo falhar, apaga o usuário recém-convidado (compensação: Auth e
//    banco não ficam numa transação só).
// Se o e-mail já tem login, não reenvia convite: só vincula (rede/franquia).
//
// Segredos: a Secret key só existe aqui, no servidor. SUPABASE_URL e
// SUPABASE_SERVICE_ROLE_KEY são injetadas pelo Supabase. Se o projeto tiver as
// chaves legadas desligadas, crie o segredo PETCARE_SECRET_KEY com a Secret key
// (sb_secret_...): supabase secrets set PETCARE_SECRET_KEY=...
//
// Deploy com verificação de JWT do gateway DESLIGADA (verify_jwt = false em
// supabase/config.toml): a função valida o token ela mesma com auth.getUser,
// o que funciona com as chaves novas e com as legadas.
import { createClient } from 'npm:@supabase/supabase-js@2';

const ORIGENS = new Set([
  'https://app.petcarehub.com.br',
  'https://petcare-hub-painel.pages.dev',
  'http://localhost:5173',
]);
const PAPEIS = new Set(['dono', 'gerente', 'recepcao', 'profissional']);
const SITE = Deno.env.get('PETCARE_SITE_URL') ?? 'https://app.petcarehub.com.br';

function cors(origem: string | null): Record<string, string> {
  const permitida = origem && (ORIGENS.has(origem) || origem.endsWith('.petcare-hub-painel.pages.dev'));
  return {
    'Access-Control-Allow-Origin': permitida ? origem! : 'https://app.petcarehub.com.br',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    Vary: 'Origin',
  };
}

Deno.serve(async (req) => {
  const h = cors(req.headers.get('Origin'));
  const responder = (status: number, corpo: unknown) =>
    new Response(JSON.stringify(corpo), { status, headers: { ...h, 'Content-Type': 'application/json' } });

  if (req.method === 'OPTIONS') return new Response('ok', { headers: h });
  if (req.method !== 'POST') return responder(405, { erro: 'Use POST.' });

  const url = Deno.env.get('SUPABASE_URL');
  const chave = Deno.env.get('PETCARE_SECRET_KEY') ?? Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !chave) return responder(500, { erro: 'Função sem SUPABASE_URL ou Secret key configurada.' });
  const admin = createClient(url, chave, { auth: { persistSession: false, autoRefreshToken: false } });

  // 1. Quem chamou
  const jwt = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '');
  if (!jwt) return responder(401, { erro: 'Entre no painel para convidar.' });
  const { data: quem, error: errQuem } = await admin.auth.getUser(jwt);
  if (errQuem || !quem?.user) return responder(401, { erro: 'Sessão inválida. Entre de novo.' });
  const { data: harpia } = await admin
    .from('harpia_equipe').select('papel').eq('user_id', quem.user.id).eq('ativo', true).maybeSingle();
  if (harpia?.papel !== 'super_admin') return responder(403, { erro: 'Só a equipe PetCare Hub (super admin) envia convites.' });

  // 2. Dados do convite
  let corpo: { email?: string; nome?: string | null; papel?: string; petshop_id?: string };
  try { corpo = await req.json(); } catch { return responder(400, { erro: 'Corpo inválido.' }); }
  const email = (corpo.email ?? '').trim().toLowerCase();
  const papel = corpo.papel ?? 'dono';
  const petshop = corpo.petshop_id ?? '';
  const nome = (corpo.nome ?? '').trim() || null;
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return responder(400, { erro: 'E-mail inválido.' });
  if (!PAPEIS.has(papel)) return responder(400, { erro: 'Papel inválido.' });
  const { data: ps } = await admin.from('petshops').select('id, nome').eq('id', petshop).maybeSingle();
  if (!ps) return responder(404, { erro: 'Pet shop não encontrado.' });

  // 3. Convite (cria o usuário). precisa_definir_senha força a tela de senha no painel.
  const convite = await admin.auth.admin.inviteUserByEmail(email, {
    data: { precisa_definir_senha: true, nome },
    redirectTo: `${SITE}/auth/confirmar`,
  });
  let novoId: string | null = null;
  if (convite.error) {
    const jaExiste = convite.error.code === 'email_exists' || /already been registered|already registered/i.test(convite.error.message);
    if (!jaExiste) return responder(502, { erro: `O convite não saiu: ${convite.error.message}` });
  } else {
    novoId = convite.data.user?.id ?? null;
  }

  // 4. Vínculo
  const { data: userId, error: errVinc } = await admin.rpc('admin_vincular_membro', {
    p_email: email, p_petshop: petshop, p_papel: papel, p_nome: nome,
  });
  if (errVinc) {
    if (novoId) await admin.auth.admin.deleteUser(novoId); // desfaz o convite
    return responder(500, { erro: `Convite desfeito: o vínculo falhou (${errVinc.message}).` });
  }

  return responder(200, novoId
    ? { status: 'convidado', user_id: userId, mensagem: `Convite enviado para ${email}. O acesso é só ao ${ps.nome}.` }
    : { status: 'vinculado', user_id: userId, mensagem: `${email} já tinha login: vinculado ao ${ps.nome} sem novo e-mail. Ele entra com a senha atual (ou "Esqueci minha senha").` });
});
