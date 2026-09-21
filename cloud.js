/* Personal Deadline cloud access. The only key in this public file is publishable. */
const PD_URL = 'https://czydcsdgoiwivwpnggiq.supabase.co';
const PD_KEY = 'sb_publishable_YYkORrCLJzGuWOaAqLX0uQ_VimButZj';
const PD_SESSION_KEY = 'pd_cloud_session_v1';
const PD_PENDING_KEY = 'pd_cloud_pending_v1';
const PD_OWNER_KEY = 'pd_cloud_owner_v1';
const gate = document.getElementById('authGate');
const message = document.getElementById('authMessage');
const statusEl = document.getElementById('cloudStatus');
let pdSession = null, pdUser = null, pdRevision = 0, pdReady = false;
let pdTimer = null, pdSaving = false, pdQueued = false, pdMode = 'login';
const pdHeaders = (token = pdSession?.access_token) => ({ apikey: PD_KEY, 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) });
function pdStatus(text) { statusEl.textContent = text; }
function pdMessage(text, ok = false) { message.textContent = text; message.classList.toggle('ok', ok); }
function pdSetSession(session) {
  pdSession = session;
  if (session) localStorage.setItem(PD_SESSION_KEY, JSON.stringify(session));
  else localStorage.removeItem(PD_SESSION_KEY);
}
async function pdRequest(path, options = {}) {
  const response = await fetch(PD_URL + path, { ...options, headers: { ...pdHeaders(), ...(options.headers || {}) } });
  let data;
  try { data = await response.json(); } catch { data = null; }
  if (!response.ok) throw new Error(data?.msg || data?.error_description || data?.message || data?.error || `云端请求失败 (${response.status})`);
  return data;
}
async function pdRefreshSession() {
  if (!pdSession?.refresh_token) throw new Error('请重新登录');
  const result = await pdRequest('/auth/v1/token?grant_type=refresh_token', { method: 'POST', body: JSON.stringify({ refresh_token: pdSession.refresh_token }) });
  pdSetSession(result);
}
async function pdEnsureSession() {
  if (!pdSession?.access_token) throw new Error('请重新登录');
  if (pdSession.expires_at && Date.now() > pdSession.expires_at * 1000 - 90000) await pdRefreshSession();
}
async function pdAuthRequest(path, options = {}) {
  await pdEnsureSession();
  try { return await pdRequest(path, options); }
  catch (error) {
    if (String(error.message).includes('JWT') || String(error.message).includes('401')) {
      await pdRefreshSession();
      return await pdRequest(path, options);
    }
    throw error;
  }
}
function pdSetMode(mode) {
  pdMode = mode;
  document.querySelectorAll('[data-auth-tab]').forEach(b => b.classList.toggle('active', b.dataset.authTab === mode));
  document.getElementById('authConfirmField').classList.toggle('hidden', mode !== 'register');
  document.getElementById('authInviteField').classList.toggle('hidden', mode !== 'register');
  document.getElementById('authConfirm').required = mode === 'register';
  document.getElementById('authInvite').required = mode === 'register';
  document.getElementById('authPassword').autocomplete = mode === 'register' ? 'new-password' : 'current-password';
  document.getElementById('authSubmit').textContent = mode === 'register' ? '使用邀请码注册' : '登录';
  pdMessage('');
}
document.querySelectorAll('[data-auth-tab]').forEach(b => b.onclick = () => pdSetMode(b.dataset.authTab));
function pdInternalEmail(username) {
  const hex = [...new TextEncoder().encode(username.trim().toLowerCase())]
    .map(byte => byte.toString(16).padStart(2, '0')).join('');
  return `u${hex}@accounts.example.com`;
}
async function pdRegister(username, password, invite) {
  const response = await fetch(PD_URL + '/functions/v1/personal-deadline-register', {
    method: 'POST', headers: pdHeaders(null), body: JSON.stringify({ action: 'register', password, invite, username }),
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || '注册失败');
}
async function pdSignIn(username, password) {
  pdSetSession(await pdRequest('/auth/v1/token?grant_type=password', {
    method: 'POST', body: JSON.stringify({ email: pdInternalEmail(username), password }),
  }));
  await pdOpenCalendar();
}
document.getElementById('authForm').onsubmit = async e => {
  e.preventDefault();
  const button = document.getElementById('authSubmit');
  const username = document.getElementById('authUsername').value.trim();
  const password = document.getElementById('authPassword').value;
  button.disabled = true;
  pdMessage(pdMode === 'register' ? '正在注册…' : '正在登录…', true);
  try {
    if (pdMode === 'register') {
      if (password !== document.getElementById('authConfirm').value) throw new Error('两次密码不一致');
      await pdRegister(username, password, document.getElementById('authInvite').value.trim());
    }
    await pdSignIn(username, password);
  } catch (error) { pdMessage(error.message || '操作失败'); }
  finally { button.disabled = false; }
};
async function pdMemberCheck() {
  const list = await pdAuthRequest(`/rest/v1/personal_deadline_members?user_id=eq.${encodeURIComponent(pdUser.id)}&select=user_id,username,is_admin`);
  return list[0] || null;
}
async function pdBackgroundData() {
  const blob = await assetGet(BG_ASSET_KEY).catch(() => null);
  return blob instanceof Blob ? await blobToDataUrl(blob) : null;
}
async function pdSnapshot() {
  return { ...ccCalendarPayload(), profile, appearance, backgroundData: await pdBackgroundData() };
}
async function pdApplySnapshot(data) {
  pdReady = false;
  ccApplyCalendarData(data);
  profile = data.profile && typeof data.profile === 'object' ? data.profile : { nickname: '我的昵称', intro: '', avatarData: '' };
  appearance = data.appearance && typeof data.appearance === 'object' ? data.appearance : { imageOpacity: 22, cellOpacity: 90, themeColor: '#285b96' };
  if (typeof data.backgroundData === 'string' && data.backgroundData.startsWith('data:image/')) {
    await assetPut(BG_ASSET_KEY, await (await fetch(data.backgroundData)).blob());
  } else await assetDelete(BG_ASSET_KEY).catch(() => {});
  localStorage.setItem(PROFILE_KEY, JSON.stringify(profile));
  localStorage.setItem(APPEARANCE_KEY, JSON.stringify(appearance));
  await loadBackgroundAsset();
  renderAll();
}
async function pdFetchCalendar() {
  const rows = await pdAuthRequest(`/rest/v1/personal_deadline_calendars?user_id=eq.${encodeURIComponent(pdUser.id)}&select=data,revision`);
  return rows[0] || null;
}
async function pdPush() {
  if (!pdReady) return;
  if (pdSaving) { pdQueued = true; return; }
  pdSaving = true;
  clearTimeout(pdTimer);
  pdStatus('正在同步…');
  try {
    const snapshot = await pdSnapshot();
    const result = await pdAuthRequest('/rest/v1/rpc/save_personal_deadline', {
      method: 'POST', body: JSON.stringify({ p_revision: pdRevision, p_data: snapshot }),
    });
    if (result.ok) {
      pdRevision = Number(result.revision);
      localStorage.removeItem(PD_PENDING_KEY);
      pdStatus('已同步 · ' + new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' }));
    } else {
      // Every conflict requires a conscious choice. Neither side is discarded silently.
      pdReady = false;
      const keepLocal = confirm('另一台设备已更新日历。\n\n确定：以当前设备的内容覆盖云端。\n取消：读取云端内容，放弃当前设备未同步的更改。');
      pdRevision = Number(result.revision);
      if (keepLocal) {
        pdReady = true;
        pdQueued = true;
      } else {
        const remote = await pdFetchCalendar();
        if (remote) { pdRevision = Number(remote.revision); await pdApplySnapshot(remote.data); }
        localStorage.removeItem(PD_PENDING_KEY);
        pdReady = true;
        pdStatus('已读取云端');
      }
    }
  } catch (error) {
    pdStatus('同步失败 · ' + error.message + '（本机更改尚未上传）');
    localStorage.setItem(PD_PENDING_KEY, '1');
  } finally {
    pdSaving = false;
    if (pdQueued && pdReady) { pdQueued = false; setTimeout(pdPush, 0); }
  }
}
function pdSchedule() {
  if (!pdReady) return;
  localStorage.setItem(PD_PENDING_KEY, '1');
  pdStatus('等待同步…');
  clearTimeout(pdTimer);
  pdTimer = setTimeout(pdPush, 700);
}
window.addEventListener('online', () => {
  if (pdReady && localStorage.getItem(PD_PENDING_KEY) === '1') pdPush();
});
// Keep the existing local save and import behavior, then sync changes.
const pdLocalSave = save;
save = function () { pdLocalSave(); pdSchedule(); };
const pdAppearanceSave = saveAppearance;
saveAppearance = function () { pdAppearanceSave(); pdSchedule(); };
const pdWorkspaceSave = workspaceSaveBtnEl.onclick;
workspaceSaveBtnEl.onclick = () => { pdWorkspaceSave(); pdSchedule(); };
async function pdLoadOnLogin() {
  const previousOwner = localStorage.getItem(PD_OWNER_KEY);
  const localHadData = !previousOwner && (items.length > 0 || projects.length > 0 || profile.avatarData || profile.nickname !== '我的昵称');
  const unsynced = previousOwner === pdUser.id && localStorage.getItem(PD_PENDING_KEY) === '1';
  const remote = await pdFetchCalendar();
  if (remote) {
    pdRevision = Number(remote.revision);
    if ((unsynced || localHadData) && confirm('本机有尚未上传的个人日历数据。\n\n确定：用本机数据覆盖云端。\n取消：读取云端版本。')) {
      localStorage.setItem(PD_OWNER_KEY, pdUser.id);
      pdReady = true;
      pdSchedule();
      return;
    }
    await pdApplySnapshot(remote.data);
    localStorage.removeItem(PD_PENDING_KEY);
  } else {
    pdRevision = 0;
    if ((localHadData || unsynced) && confirm('检测到本机个人日历数据。是否导入到此账号的云端日历？')) {
      // Preserve the existing local data, including custom background.
      pdStatus('正在导入旧版数据…');
    } else {
      await pdApplySnapshot({ items: [], projects: [], categories: DEFAULT_CATEGORIES, colors: DEFAULT_COLORS, trash: { tasks: [], projects: [] }, profile: { nickname: '我的昵称', intro: '', avatarData: '' }, appearance: { imageOpacity: 22, cellOpacity: 90, themeColor: '#285b96' } });
    }
    localStorage.setItem(PD_PENDING_KEY, '1');
  }
  localStorage.setItem(PD_OWNER_KEY, pdUser.id);
  pdReady = true;
  if (!remote) await pdPush();
  else pdStatus('已连接云端');
}
async function pdOpenCalendar() {
  await pdEnsureSession();
  pdUser = await pdAuthRequest('/auth/v1/user');
  const membership = await pdMemberCheck();
  if (!membership) throw new Error('该账号没有日历权限，请使用邀请码注册');
  await pdLoadOnLogin();
  document.getElementById('adminOpen').classList.toggle('hidden', !membership.is_admin);
  document.body.classList.add('cloud-ready');
  gate.classList.add('hidden');
}
document.getElementById('cloudRefreshBtn').onclick = async () => {
  if (localStorage.getItem(PD_PENDING_KEY) === '1' && !confirm('本机有尚未上传的更改。确定读取云端并放弃这些更改？')) return;
  try {
    pdReady = false;
    const remote = await pdFetchCalendar();
    if (remote) { pdRevision = Number(remote.revision); await pdApplySnapshot(remote.data); }
    localStorage.removeItem(PD_PENDING_KEY);
    pdStatus('已读取云端');
  } catch (error) { pdStatus('读取失败 · ' + error.message); }
  finally { pdReady = true; }
};
document.getElementById('cloudLogoutBtn').onclick = async () => {
  if (localStorage.getItem(PD_PENDING_KEY) === '1' && !confirm('有尚未同步的更改。确定退出登录？')) return;
  pdReady = false;
  document.body.classList.remove('cloud-ready');
  gate.classList.remove('hidden');
  const token = pdSession?.access_token;
  pdSetSession(null);
  pdUser = null;
  localStorage.removeItem(PD_OWNER_KEY);
  localStorage.removeItem(PD_PENDING_KEY);
  Object.keys(localStorage).filter(k => k.startsWith('personal_ddl_')).forEach(k => localStorage.removeItem(k));
  await assetDelete(BG_ASSET_KEY).catch(() => {});
  if (token) fetch(PD_URL + '/auth/v1/logout', { method: 'POST', headers: pdHeaders(token) }).catch(() => {});
  location.reload();
};
const pdAdminGate = document.getElementById('adminGate');
const pdAdminMessage = document.getElementById('adminMessage');
async function pdAdmin(action, fields = {}) {
  return await pdAuthRequest('/functions/v1/personal-deadline-admin', {
    method: 'POST', body: JSON.stringify({ action, ...fields }),
  });
}
async function pdAdminList() {
  const list = document.getElementById('adminList');
  const choices = document.getElementById('adminPasswordUser');
  list.textContent = '正在读取账号…';
  try {
    const data = await pdAdmin('list');
    list.replaceChildren();
    choices.replaceChildren();
    for (const member of data.members) {
      const option = document.createElement('option');
      option.value = member.user_id;
      option.textContent = member.username + (member.is_admin ? '（管理员）' : '');
      choices.append(option);
      const row = document.createElement('div');
      row.className = 'admin-person';
      const info = document.createElement('div');
      const title = document.createElement('strong');
      title.textContent = member.username || '未设置用户名';
      const detail = document.createElement('small');
      detail.textContent = (member.is_admin ? '管理员' : '成员') + ' · ' + new Date(member.joined_at).toLocaleDateString('zh-CN');
      info.append(title, detail);
      row.append(info);
      if (!member.is_admin) {
        const remove = document.createElement('button');
        remove.type = 'button';
        remove.className = 'ghost-btn';
        remove.textContent = '移除账号';
        remove.onclick = async () => {
          if (!confirm(`移除“${member.username}”在日子中的账号和日历数据？此操作不能撤销。`)) return;
          remove.disabled = true;
          try { await pdAdmin('remove_member', { userId: member.user_id }); pdAdminMessage.textContent = '账号已移除'; await pdAdminList(); }
          catch (error) { pdAdminMessage.textContent = error.message; remove.disabled = false; }
        };
        row.append(remove);
      }
      list.append(row);
    }
  } catch (error) { list.textContent = '读取失败：' + error.message; }
}
document.getElementById('adminOpen').onclick = () => {
  pdAdminGate.classList.remove('hidden');
  document.getElementById('adminCodeArea').classList.add('hidden');
  pdAdminMessage.textContent = '';
  pdAdminList();
};
document.getElementById('adminClose').onclick = () => {
  pdAdminGate.classList.add('hidden');
  document.getElementById('adminCode').value = '';
  document.getElementById('adminPasswordForm').reset();
};
document.getElementById('adminPasswordForm').onsubmit = async event => {
  event.preventDefault();
  const form = event.currentTarget;
  const button = document.getElementById('adminPasswordSubmit');
  const userId = document.getElementById('adminPasswordUser').value;
  const password = document.getElementById('adminNewPassword').value;
  if (password !== document.getElementById('adminConfirmPassword').value) {
    pdAdminMessage.textContent = '两次输入的密码不一致';
    return;
  }
  const username = document.getElementById('adminPasswordUser').selectedOptions[0]?.textContent;
  if (!userId || !confirm(`确定修改“${username}”的登录密码？`)) return;
  button.disabled = true;
  try {
    await pdAdmin('change_password', { userId, password });
    pdAdminMessage.textContent = '密码修改成功，请使用新密码登录';
    form.reset();
  } catch (error) { pdAdminMessage.textContent = error.message; }
  finally { button.disabled = false; }
};
document.getElementById('adminCreateInvite').onclick = async () => {
  const button = document.getElementById('adminCreateInvite');
  button.disabled = true;
  try {
    const data = await pdAdmin('create_invite');
    document.getElementById('adminCode').value = data.code;
    document.getElementById('adminCodeArea').classList.remove('hidden');
    pdAdminMessage.textContent = '一次性邀请码已生成';
  } catch (error) { pdAdminMessage.textContent = error.message; }
  finally { button.disabled = false; }
};
document.getElementById('adminCopyCode').onclick = async () => {
  const code = document.getElementById('adminCode');
  try { await navigator.clipboard.writeText(code.value); pdAdminMessage.textContent = '邀请码已复制'; }
  catch { code.select(); document.execCommand('copy'); pdAdminMessage.textContent = '邀请码已复制'; }
};
(async () => {
  try {
    const stored = localStorage.getItem(PD_SESSION_KEY);
    if (!stored) { pdMessage('请登录；第一次使用请切换至注册。', true); return; }
    pdSetSession(JSON.parse(stored));
    await pdOpenCalendar();
  } catch (error) {
    pdSetSession(null);
    pdMessage('自动登录失败：' + error.message);
  }
})();
