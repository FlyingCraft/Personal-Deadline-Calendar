// Only a verified personal calendar admin can access these service-role operations.
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
async function sha256(value: string) {
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return [...new Uint8Array(bytes)].map(x => x.toString(16).padStart(2, '0')).join('');
}
Deno.serve(async req => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: cors });
  if (req.method !== 'POST') return reply({ error: 'Method not allowed' }, 405);
  if (!url || !secret) return reply({ error: 'Server configuration missing' }, 500);
  const token = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '');
  if (!token) return reply({ error: '请登录' }, 401);
  const userResponse = await fetch(`${url}/auth/v1/user`, { headers: { apikey: secret, Authorization: `Bearer ${token}` } });
  if (!userResponse.ok) return reply({ error: '登录已失效' }, 401);
  const user = await userResponse.json();
  const memberResponse = await fetch(`${url}/rest/v1/personal_deadline_members?user_id=eq.${user.id}&is_admin=eq.true&select=user_id`, { headers: svc });
  if (!memberResponse.ok || !(await memberResponse.json()).length) return reply({ error: '没有管理员权限' }, 403);
  let body: { action?: string; userId?: string };
  try { body = await req.json(); } catch { return reply({ error: '无效请求' }, 400); }
  if (body.action === 'list') {
    const membersResponse = await fetch(`${url}/rest/v1/personal_deadline_members?select=user_id,username,is_admin,joined_at&order=joined_at.asc`, { headers: svc });
    if (!membersResponse.ok) return reply({ error: '无法读取账号列表' }, 503);
    return reply({ members: await membersResponse.json() });
  }
  if (body.action === 'create_invite') {
    const random = crypto.getRandomValues(new Uint8Array(32));
    const code = btoa(String.fromCharCode(...random)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    const codeHash = await sha256(code);
    const response = await fetch(`${url}/rest/v1/personal_deadline_invites`, {
      method: 'POST', headers: svc,
      body: JSON.stringify({ code_hash: codeHash, max_uses: 1, kind: 'member' }),
    });
    if (!response.ok) return reply({ error: '邀请码生成失败' }, 503);
    return reply({ code });
  }
  if (body.action === 'remove_member') {
    const id = String(body.userId || '');
    if (!/^[0-9a-f]{8}-[0-9a-f-]{27,}$/i.test(id)) return reply({ error: '账号 ID 无效' }, 400);
    if (id === user.id) return reply({ error: '无法移除自己的管理员账号' }, 403);
    const targetResponse = await fetch(`${url}/rest/v1/personal_deadline_members?user_id=eq.${id}&select=is_admin`, { headers: svc });
    if (!targetResponse.ok) return reply({ error: '无法核实目标账号' }, 503);
    const target = await targetResponse.json();
    if (!target.length || target[0].is_admin) return reply({ error: '该账号不存在或为管理员' }, 403);
    const response = await fetch(`${url}/rest/v1/personal_deadline_members?user_id=eq.${id}`, { method: 'DELETE', headers: svc });
    if (!response.ok) return reply({ error: '移除账号失败' }, 503);
    return reply({ ok: true });
  }
  return reply({ error: 'Unsupported action' }, 400);
});
