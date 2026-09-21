// The invitation is checked server-side. This function never exposes its service key.
const url = Deno.env.get('SUPABASE_URL')!;
const secret = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Content-Type': 'application/json',
};
const reply = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: cors });
const svc = { apikey: secret, Authorization: `Bearer ${secret}`, 'Content-Type': 'application/json' };
async function hash(value: string) {
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return [...new Uint8Array(bytes)].map(x => x.toString(16).padStart(2, '0')).join('');
}
Deno.serve(async req => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: cors });
  if (req.method !== 'POST') return reply({ error: 'Method not allowed' }, 405);
  if (!secret || !url) return reply({ error: 'Server configuration missing' }, 500);
  let body: { action?: string; email?: string; password?: string; invite?: string; username?: string };
  try { body = await req.json(); } catch { return reply({ error: 'Invalid request' }, 400); }
  const invite = String(body.invite || '').trim();
  const username = String(body.username || '').trim();
  if (!/^[A-Za-z0-9_]{3,24}$/.test(username)) return reply({ error: '用户名须为 3–24 位字母、数字或下划线' }, 400);
  if (invite.length < 20 || invite.length > 160) return reply({ error: '邀请码无效' }, 403);
  const codeHash = await hash(invite);
  const check = await fetch(`${url}/rest/v1/personal_deadline_invites?code_hash=eq.${codeHash}&select=uses,max_uses,kind`, { headers: svc });
  if (!check.ok) return reply({ error: '暂时无法验证邀请码' }, 503);
  const rows = await check.json();
  if (!rows.length || rows[0].uses >= rows[0].max_uses) return reply({ error: '邀请码无效或已达到使用上限' }, 403);
  if ((username.toLowerCase() === 'flying_craft') !== (rows[0].kind === 'admin'))
    return reply({ error: '该用户名需要专属邀请码；管理员邀请码仅供 Flying_Craft 使用' }, 403);
  let userId: string;
  let created = false;
  if (body.action === 'register') {
    const email = String(body.email || '').trim().toLowerCase();
    const password = String(body.password || '');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || password.length < 8 || password.length > 72)
      return reply({ error: '请输入有效邮箱和 8–72 位密码' }, 400);
    const response = await fetch(`${url}/auth/v1/admin/users`, {
      method: 'POST', headers: svc,
      body: JSON.stringify({ email, password, email_confirm: true }),
    });
    const result = await response.json();
    if (!response.ok) return reply({ error: result.msg || result.message || '注册失败；邮箱可能已存在' }, 400);
    userId = result.id;
    created = true;
  } else if (body.action === 'join') {
    const token = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '');
    if (!token) return reply({ error: '请先登录' }, 401);
    const response = await fetch(`${url}/auth/v1/user`, { headers: { apikey: secret, Authorization: `Bearer ${token}` } });
    if (!response.ok) return reply({ error: '登录已失效' }, 401);
    userId = (await response.json()).id;
  } else return reply({ error: 'Unsupported action' }, 400);
  const redeem = await fetch(`${url}/rest/v1/rpc/redeem_personal_deadline_invite`, {
    method: 'POST', headers: svc, body: JSON.stringify({ p_hash: codeHash, p_user: userId, p_username: username }),
  });
  const accepted = redeem.ok && await redeem.json();
  if (!accepted && created) {
    await fetch(`${url}/auth/v1/admin/users/${userId}`, { method: 'DELETE', headers: svc });
  }
  if (!accepted) return reply({ error: '邀请码已达到使用上限，请换一个邀请码' }, 403);
  return reply({ ok: true });
});
