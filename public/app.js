/* Stand Tall CRM - single-file front end (no build step) */
const CFG = window.CONFIG;
const sb = window.supabase.createClient(CFG.SUPABASE_URL, CFG.SUPABASE_ANON_KEY);
const H = window.Helpers;

const $ = (s, el = document) => el.querySelector(s);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const STATUS = {
  new: 'New', interested: 'Interested', call_back: 'Call back', site_visit: 'Site visit', negotiation: 'Negotiation', booked: 'Booked',
  no_answer: 'No answer', not_interested: 'Not interested', wrong_number: 'Wrong number',
};
const OUTCOMES = [
  { k: 'interested', l: 'Interested', t: 'warm', fu: true },
  { k: 'call_back', l: 'Call back later', t: null, fu: true },
  { k: 'site_visit', l: 'Site visit booked', t: 'hot', fu: true },
  { k: 'negotiation', l: 'Negotiation', t: 'hot', fu: true },
  { k: 'booked', l: 'Booked / Closed', t: 'hot', fu: false },
  { k: 'no_answer', l: 'No answer / busy', t: null, fu: true },
  { k: 'not_interested', l: 'Not interested', t: 'cold', fu: false },
  { k: 'wrong_number', l: 'Wrong number', t: null, fu: false },
];
const TARGET_CONN = 100;
const REASONS = {
  not_interested: ['Already purchased', 'Not looking to buy now', 'Budget too low', 'Different location / area', 'Already dealing with another agent', 'Only wants ready-to-move', 'Rude / asked not to call again', 'Other'],
  wrong_number: ['Number does not exist', 'Wrong person / not the owner', 'Switched off / not reachable', 'Other'],
};
const BRAND = { name: 'Stand Tall Realty', slogan: 'Where Your Dreams Stand Tall', site: 'standtallrealty.com', phone: '9920079048', addr: 'Unity Splendour, Salunke Vihar Rd, Borade Nagar, Wanowrie, Pune 411040' };
const logoSvg = (px) => `<img src="mark.png" width="${px}" height="${px}" alt="" style="border-radius:10px;display:block">`;
const footerHtml = () => `<div class="brandfoot"><b>${BRAND.name}</b><div>${BRAND.slogan}</div><div><a href="https://${BRAND.site}" target="_blank" rel="noopener">${BRAND.site}</a> · <a href="tel:+91${BRAND.phone}">${BRAND.phone}</a></div></div>`;
const PAGE = 40;
const VAPID_PUBLIC = 'BGb-jtCT80H63eaN-hVGASKii464_ibb-olUv_lq1LgUwvCife_dE6p4mCl9mvfJBtMxlnY7wZJgePVeKnjqKmA';

const S = { profile: null, tab: null, agents: [], dueCount: 0, projects: [] };

// ---------- helpers ----------
function toast(msg) {
  const t = $('#toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toast._t);
  toast._t = setTimeout(() => t.classList.remove('show'), 2500);
}
const fmt = (d) => (d ? new Date(d).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '');
const isAdmin = () => S.profile && S.profile.role === 'admin';
const startOfToday = () => { const d = new Date(); d.setHours(0, 0, 0, 0); return d; };
const endOfToday = () => { const d = new Date(); d.setHours(23, 59, 59, 999); return d; };
function localInput(d) {
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}
function tomorrow11() { const d = new Date(); d.setDate(d.getDate() + 1); d.setHours(11, 0, 0, 0); return d; }
const isAgent = (a) => a.role === 'agent' && a.active;
const agentName = (id) => { const a = S.agents.find((x) => x.id === id); return a ? a.full_name || a.email : 'Unassigned'; };

function closeSheet() { $('#sheet-root').innerHTML = ''; }
function openSheet(html) {
  $('#sheet-root').innerHTML = `<div class="back"><div class="sheet">${html}</div></div>`;
  $('#sheet-root .back').addEventListener('click', (e) => { if (e.target.classList.contains('back')) closeSheet(); });
}

// ---------- auth ----------
async function boot() {
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
  const { data } = await sb.auth.getSession();
  if (!data.session) return showLogin();
  await afterLogin();
}

function showLogin(err) {
  $('#app').innerHTML = `
  <div class="login">
    <div class="lg"><img src="logo.jpg" alt="Stand Tall Realty - Where Your Dreams Stand Tall"></div>
    <div class="card lcard"><p>Sign in with your email and password</p>
    <label>Email</label><input id="em" type="email" autocomplete="username" autocapitalize="none">
    <label>Password</label><input id="pw" type="password" autocomplete="current-password">
    <p class="over" id="lerr">${esc(err || '')}</p>
    <button class="btn block gold" id="go">Sign in</button></div>
    ${footerHtml()}
  </div>`;
  const submit = async () => {
    const email = $('#em').value.trim(), password = $('#pw').value;
    $('#go').disabled = true;
    const { error } = await sb.auth.signInWithPassword({ email, password });
    if (error) { $('#go').disabled = false; $('#lerr').textContent = error.message; return; }
    afterLogin();
  };
  $('#go').onclick = submit;
  $('#pw').onkeydown = (e) => { if (e.key === 'Enter') submit(); };
}

async function afterLogin() {
  const { data: u } = await sb.auth.getUser();
  const { data: prof, error } = await sb.from('profiles').select('*').eq('id', u.user.id).single();
  if (error || !prof) { await sb.auth.signOut(); return showLogin('Profile not found. Ask admin to set up your account.'); }
  if (!prof.active) { await sb.auth.signOut(); return showLogin('Your account is not active. Ask the admin.'); }
  S.profile = prof;
  const { data: ags } = await sb.from('profiles').select('*').order('full_name');
  S.agents = ags || [];
  await loadProjects();
  S.tab = isAdmin() ? 'dash' : 'today';
  renderShell();
  if (pushSupported() && Notification.permission === 'granted') subscribePush().catch(() => {});
  setTimeout(checkOnlineLeads, 800);
  // if the page was reloaded after dialing, ask what happened on that call
  const p = pending();
  if (p) openDisposition(p.lead);
}

async function logout() {
  await sb.auth.signOut();
  sessionStorage.clear();
  location.reload();
}

// ---------- shell ----------
function renderShell() {
  const tabs = isAdmin()
    ? [['dash', '📊', 'Dashboard'], ['import', '⬆️', 'Import'], ['dist', '🔀', 'Distribute'], ['leads', '👥', 'All leads'], ['disp', '🗂️', 'Disposed'], ['team', '🧑‍💼', 'Team'], ['proj', '🏢', 'Projects']]
    : [['today', '📞', 'Today'], ['leads', '👥', 'My leads'], ['stats', '📊', 'Stats']];
  $('#app').innerHTML = `
  <header class="top"><div class="hb">${logoSvg(40)}<div><b>STAND TALL <em>REALTY</em></b><small>${isAdmin() ? 'Admin' : esc(S.profile.full_name || S.profile.email) + (S.profile.agent_code ? ' · ' + esc(S.profile.agent_code) : '')}</small></div></div>
  <div style="display:flex;gap:8px"><button id="bell" title="Reminders">🔔</button><button id="pw" title="Change password">🔑</button><button id="lo">Logout</button></div></header>
  <div id="clock" style="text-align:center;font-size:13px;font-weight:600;padding:4px 0;color:#555"></div>
  <div id="pushbar"></div>
  <main id="view"></main>
  ${footerHtml()}
  <nav class="bottom">${tabs.map(([k, ic, l]) => `<button data-t="${k}" class="${S.tab === k ? 'on' : ''}"><span>${ic}</span>${l}${k === 'today' && S.dueCount ? `<i class="badge">${S.dueCount}</i>` : ''}</button>`).join('')}</nav>`;
  const tick = () => { const c = $('#clock'); if (c) c.textContent = '🕒 ' + new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', weekday: 'short', day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: true }) + ' IST'; };
  tick(); clearInterval(window._clk); window._clk = setInterval(tick, 15000);
  $('#lo').onclick = logout;
  $('#bell').onclick = onBell;
  $('#pw').onclick = openChangePassword;
  renderPushBar();
  document.querySelectorAll('nav.bottom button').forEach((b) => (b.onclick = () => { S.tab = b.dataset.t; renderShell(); }));
  const v = { today: viewToday, leads: viewLeads, stats: viewDash, dash: viewDash, import: viewImport, dist: viewDist, team: viewTeam, disp: viewDisposed, proj: viewProjects }[S.tab];
  v($('#view'));
}
const refresh = () => renderShell();

// ---------- follow-up reminders (push notifications) ----------
const pushSupported = () => 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
const b64ToU8 = (b) => { const p = '='.repeat((4 - (b.length % 4)) % 4); const r = atob((b + p).replace(/-/g, '+').replace(/_/g, '/')); return Uint8Array.from([...r].map((c) => c.charCodeAt(0))); };

async function subscribePush() {
  const reg = await navigator.serviceWorker.ready;
  let sub = await reg.pushManager.getSubscription();
  if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64ToU8(VAPID_PUBLIC) });
  const j = sub.toJSON();
  const { error } = await sb.rpc('save_push_subscription', { p_endpoint: j.endpoint, p_p256dh: j.keys.p256dh, p_auth: j.keys.auth });
  if (error) throw error;
}

async function enablePush() {
  if (!pushSupported()) return toast('Install the app to the Home Screen first to get reminders');
  const perm = await Notification.requestPermission();
  if (perm !== 'granted') { renderPushBar(); return toast('Notifications are blocked in your phone settings'); }
  try { await subscribePush(); toast('Reminders are ON'); } catch (e) { toast('Could not turn on reminders: ' + (e.message || e)); }
  renderPushBar();
}

async function onBell() {
  if (!pushSupported() || Notification.permission !== 'granted') return enablePush();
  toast('Sending a test notification…');
  try { await subscribePush(); } catch (_) {}
  const { data, error } = await sb.functions.invoke('send-reminders', { body: { test: true } });
  if (error) return toast('Test failed: ' + error.message);
  toast(data && data.sent ? 'Test sent. Check your notifications.' : 'No device registered yet. Try again.');
}

function renderPushBar() {
  const el = $('#pushbar'); if (!el) return;
  let msg = '', btn = '';
  if (!pushSupported()) msg = 'On iPhone: add this app to your Home Screen (Share → Add to Home Screen), open it from there, then tap 🔔 to get reminders.';
  else if (Notification.permission === 'default') { msg = 'Turn on follow-up reminders so you never miss a call.'; btn = '<button class="btn gold sm" id="pb">Turn on</button>'; }
  else if (Notification.permission === 'denied') msg = 'Reminders are blocked. Allow notifications for this app in your phone settings.';
  el.innerHTML = msg ? `<div class="card" style="margin:10px 12px 0;display:flex;gap:10px;align-items:center"><div style="flex:1;font-size:13px">${msg}</div>${btn}</div>` : '';
  const b = $('#pb'); if (b) b.onclick = enablePush;
}

// ---------- account: change own password ----------
function openChangePassword() {
  openSheet(`<h3>Change my password</h3>
    <label>New password (min 8 characters)</label><input id="np1" type="password" autocomplete="new-password">
    <label>Repeat new password</label><input id="np2" type="password" autocomplete="new-password">
    <div class="row" style="margin-top:14px"><button class="btn ghost" id="npc">Cancel</button><button class="btn gold" id="nps">Change password</button></div>`);
  $('#npc').onclick = closeSheet;
  $('#nps').onclick = async () => {
    const a = $('#np1').value, b = $('#np2').value;
    if (a.length < 8) return toast('Use at least 8 characters');
    if (a !== b) return toast('The two passwords do not match');
    $('#nps').disabled = true;
    const { error } = await sb.auth.updateUser({ password: a });
    if (error) { $('#nps').disabled = false; return toast(error.message); }
    sb.functions.invoke('notify-admins', { body: { event: 'password_changed' } }).catch(() => {});
    closeSheet(); toast('Password changed');
  };
}
const goBooked = () => { S.preset = 'booked'; S.tab = 'leads'; renderShell(); };

// ---------- WhatsApp templates ----------
async function loadTemplates() {
  const { data } = await sb.from('wa_templates').select('*').order('sort').order('id');
  S.tpls = data || [];
  return S.tpls;
}
function fillTpl(t, l) {
  const first = ((l.name || '').trim().split(/\s+/)[0]) || 'Sir/Madam';
  return t.replace(/\{name\}/g, first).replace(/\{agent\}/g, (isAdmin() ? '' : (S.profile.full_name || '')) || 'Stand Tall Realty')
    .replace(/\{project\}/g, l.project || 'our projects in Pune').replace(/\{phone\}/g, l.phone || '');
}
function sendWhatsApp(l, text) {
  const num = (CFG.COUNTRY_CODE + l.phone_norm).replace('+', '');
  window.open(`https://wa.me/${num}${text ? '?text=' + encodeURIComponent(text) : ''}`, '_blank');
}
async function openWhatsApp(l, onDone) {
  if (!l) return;
  openSheet('<div class="empty">Loading…</div>');
  const tpls = (await loadTemplates()).filter((t) => t.active);
  openSheet(`<h3>💬 WhatsApp ${esc(l.name || l.phone)}</h3><div class="note">Choose a message. WhatsApp opens with it ready; just tap Send.</div>
    ${tpls.map((t) => `<button class="card tpl" data-id="${t.id}" style="width:100%;text-align:left;border:1px solid var(--line)"><b>${esc(t.title)}</b><div class="sub" style="white-space:pre-line">${esc(fillTpl(t.body, l)).slice(0, 140)}${t.body.length > 140 ? '…' : ''}</div></button>`).join('') || '<div class="empty">No templates yet.</div>'}
    <button class="btn ghost block sm" id="wb">Open chat without a message</button>
    <button class="btn ghost block" style="margin-top:8px" id="wc">${onDone ? 'Skip' : 'Close'}</button>`);
  const done = () => { closeSheet(); if (onDone) onDone(); };
  document.querySelectorAll('.tpl').forEach((b) => (b.onclick = () => { sendWhatsApp(l, fillTpl(tpls.find((t) => String(t.id) === b.dataset.id).body, l)); done(); }));
  $('#wb').onclick = () => { sendWhatsApp(l, ''); done(); };
  $('#wc').onclick = done;
}
function manageTemplates() {
  const draw = async () => {
    const tpls = await loadTemplates();
    openSheet(`<h3>💬 WhatsApp message templates</h3>
      <div class="note">Use {name} for the customer's first name, {agent} for the employee's name and {project} for the project.</div>
      <button class="btn gold block sm" id="tn">＋ New template</button>
      ${tpls.map((t) => `<div class="card lead" data-id="${t.id}"><div><div class="nm">${esc(t.title)}</div><div class="sub">${t.active ? 'Active' : '<span class="over">Hidden</span>'}</div></div><span style="color:var(--muted)">Edit ›</span></div>`).join('')}
      <button class="btn ghost block" style="margin-top:8px" id="tc">Close</button>`);
    $('#tc').onclick = closeSheet;
    $('#tn').onclick = () => edit(null);
    document.querySelectorAll('.lead[data-id]').forEach((c) => (c.onclick = () => edit(S.tpls.find((t) => String(t.id) === c.dataset.id))));
  };
  const edit = (t) => {
    openSheet(`<h3>${t ? 'Edit' : 'New'} template</h3><label>Title</label><input id="tt" type="text" value="${esc(t ? t.title : '')}">
      <label>Message</label><textarea id="tb" style="min-height:160px">${esc(t ? t.body : '')}</textarea>
      <label><input type="checkbox" id="ta" ${!t || t.active ? 'checked' : ''}> Show to employees</label>
      <div class="row" style="margin-top:12px"><button class="btn ghost" id="tx">Back</button><button class="btn gold" id="ts">Save</button></div>
      ${t ? '<button class="btn red block sm" style="margin-top:8px" id="td">Delete template</button>' : ''}`);
    $('#tx').onclick = draw;
    $('#ts').onclick = async () => {
      const row = { title: $('#tt').value.trim(), body: $('#tb').value.trim(), active: $('#ta').checked };
      if (!row.title || !row.body) return toast('Enter a title and a message');
      const { error } = t ? await sb.from('wa_templates').update(row).eq('id', t.id) : await sb.from('wa_templates').insert(row);
      if (error) return toast(error.message); draw();
    };
    if (t) $('#td').onclick = async () => { if (!window.confirm('Delete this template?')) return; await sb.from('wa_templates').delete().eq('id', t.id); draw(); };
  };
  draw();
}

// ---------- lead card ----------
function leadCard(l) {
  const when = l.next_followup ? `<span class="${new Date(l.next_followup) < new Date() ? 'over' : ''}">⏰ ${fmt(l.next_followup)}</span>` : '';
  return `<div class="card lead" data-id="${l.id}">
    <div><div class="nm">${esc(l.name || 'No name')}${l.batch === 'auto' ? ` <span class="pill online">📣 ${esc(l.source === 'Meta Ads' ? 'Meta lead' : (l.source || 'Online lead'))}</span>` : ''}</div><div class="ph">${esc(l.phone)}${l.project ? ' · ' + esc(l.project) : ''}</div>
    ${l.place ? `<div class="ph" style="color:#14213a;font-weight:600">📍 ${esc(l.place)}</div>` : ''}
    <div class="sub">${l.call_count ? l.call_count + ' calls · ' : ''}${when} ${isAdmin() && l.agent ? '· ' + esc(l.agent.full_name || '') : isAdmin() ? '· Unassigned' : ''}</div></div>
    <div style="text-align:right"><span class="pill ${l.status}">${STATUS[l.status]}</span><br><span class="pill ${l.temperature}" style="margin-top:4px">${l.temperature}</span><br><button class="wa-btn" data-id="${l.id}" title="WhatsApp">💬 WhatsApp</button></div></div>`;
}
function bindLeadCards(root, leads) {
  root.querySelectorAll('.lead').forEach((el) => (el.onclick = () => openLead(leads.find((x) => String(x.id) === el.dataset.id))));
  root.querySelectorAll('.wa-btn').forEach((b) => (b.onclick = (e) => { e.stopPropagation(); openWhatsApp(leads.find((x) => String(x.id) === b.dataset.id)); }));
}
const LEAD_SELECT = '*, agent:profiles!assigned_to(full_name,agent_code)';

// ---------- Today (agent) ----------
async function viewToday(el) {
  el.innerHTML = '<div class="empty">Loading…</div>';
  const me = S.profile.id;
  const [due, fresh, today, online, files, ds] = await Promise.all([
    sb.from('leads').select(LEAD_SELECT).eq('assigned_to', me).lte('next_followup', endOfToday().toISOString()).order('next_followup').limit(200),
    sb.from('leads').select('id', { count: 'exact', head: true }).eq('assigned_to', me).eq('status', 'new'),
    sb.from('calls').select('id', { count: 'exact', head: true }).eq('agent_id', me).gte('called_at', startOfToday().toISOString()),
    sb.from('leads').select(LEAD_SELECT).eq('assigned_to', me).eq('batch', 'auto').eq('status', 'new').eq('call_count', 0).order('assigned_at', { ascending: false }).limit(50),
    sb.rpc('my_files'),
    sb.rpc('day_stats', { p_since: startOfToday().toISOString() }),
  ]);
  const mine = (ds.data || []).find((x) => x.agent_id === me) || {};
  const dialed = Number(mine.dialed || 0), conn = Number(mine.connected || 0);
  const onl = online.data || [];
  const fl = (files.data || []).filter((x) => Number(x.total) > 0).slice(0, 4);
  const leads = due.data || [];
  S.dueCount = leads.length;
  const badge = $('nav.bottom button[data-t="today"]');
  if (badge && !badge.querySelector('.badge') && leads.length) badge.insertAdjacentHTML('beforeend', `<i class="badge">${leads.length}</i>`);
  el.innerHTML = `
  <div class="card" style="text-align:center"><div class="note">Today's target: ${TARGET_CONN} connected calls</div>
    <div style="font-size:44px;font-weight:800;line-height:1.1">${Math.max(0, TARGET_CONN - conn)}</div><div class="note">${conn >= TARGET_CONN ? '🎉 Target done! Keep going' : 'connected calls left'}</div>
    <div style="height:8px;background:#e8edf3;border-radius:6px;margin:8px 0;overflow:hidden"><div style="height:8px;width:${Math.min(100, conn)}%;background:#2e9e63"></div></div>
    <div class="note">Connected ${conn} of ${TARGET_CONN}</div></div>
  <div class="grid"><div class="stat"><b>${dialed}</b><small>Calls dialed today</small></div><div class="stat"><b>${fresh.count || 0}</b><small>New leads left</small></div></div>
  ${fl.length ? `<h2>📁 My calling files</h2>${fl.map((x) => { const t = Number(x.total), c = Number(x.called), pct = t ? Math.round((c / t) * 100) : 0; return `<div class="card"><b>${esc(x.batch)}</b><div class="note">${c} called · ${t - c} left of ${t}</div><div style="height:8px;background:#e8edf3;border-radius:6px;margin-top:6px;overflow:hidden"><div style="height:8px;width:${pct}%;background:var(--green,#2e9e63)"></div></div></div>`; }).join('')}` : ''}
  ${onl.length ? `<h2>📣 New online leads (${onl.length}) · call these first</h2>${onl.map(leadCard).join('')}` : ''}
  <button class="btn gold block" id="next">▶ Call next new lead</button>
  <h2>Follow-ups due (${leads.length})</h2>
  ${leads.length ? leads.map(leadCard).join('') : '<div class="empty">No follow-ups due. Good job! 🎉</div>'}`;
  bindLeadCards(el, leads.concat(onl));
  $('#next').onclick = callNext;
}

async function callNext() {
  const { data } = await sb.from('leads').select('*').eq('assigned_to', S.profile.id).eq('status', 'new')
    .order('assigned_at').order('id').limit(1);
  if (!data || !data.length) return toast('No new leads left');
  startCall(data[0]);
}

// ---------- Leads list ----------
async function viewLeads(el) {
  const f = { q: '', status: S.preset || '', temp: '', agent: '', batch: '' };
  S.preset = null;
  el.innerHTML = `
  <button class="btn gold block sm" id="addl" style="margin-bottom:8px">＋ Add lead</button>
  <input id="q" type="text" placeholder="Search name, phone or society">
  <div class="chips" id="qc" style="margin-top:8px">${[['', isAdmin() ? 'All' : 'Active'], ['interested', 'Interested'], ['site_visit', 'Site visit'], ['negotiation', 'Negotiation'], ['booked', '✅ Booked'], ['call_back', 'Call back']].map(([k, v]) => `<button class="chip" data-k="${k}">${v}</button>`).join('')}</div>
  <div class="row" style="margin-top:8px">
    <select id="fs"><option value="">${isAdmin() ? 'All status' : 'Active leads'}</option>${Object.entries(STATUS).map(([k, v]) => `<option value="${k}">${v}</option>`).join('')}</select>
    <select id="ft"><option value="">All temp</option><option>hot</option><option>warm</option><option>cold</option></select>
  </div>
  ${isAdmin() ? `<select id="fa" style="margin-top:8px"><option value="">All agents</option><option value="none">Unassigned</option>${S.agents.filter(isAgent).map((a) => `<option value="${a.id}">${esc(a.full_name || a.email)}</option>`).join('')}</select>
  <select id="fb" style="margin-top:8px"><option value="">All upload batches</option></select>
  <div class="row" style="margin-top:8px"><button class="btn ghost sm" id="exp">⬇ Export to Excel</button><button class="btn red sm" id="delall">🗑 Delete listed leads</button></div>` : ''}
  <div id="list" style="margin-top:10px"></div><button class="btn ghost block" id="more" style="display:none">Load more</button>`;
  let page = 0, all = [];
  const filt = (q) => {
    if (f.batch) q = q.eq('batch', f.batch);
    if (f.q) { const t = f.q.replace(/[,()]/g, ' '); q = q.or(`name.ilike.%${t}%,place.ilike.%${t}%,phone_norm.ilike.%${t.replace(/\D/g, '') || t}%`); }
    if (f.status) q = q.eq('status', f.status);
    else if (!isAdmin()) q = q.in('status', ['interested', 'call_back', 'site_visit', 'negotiation', 'booked', 'no_answer']);
    if (f.temp) q = q.eq('temperature', f.temp);
    if (f.agent === 'none') q = q.is('assigned_to', null);
    else if (f.agent) q = q.eq('assigned_to', f.agent);
    return q;
  };
  const query = (from, to) => filt(sb.from('leads').select(LEAD_SELECT).order('id').range(from, to));
  const load = async (reset) => {
    if (reset) { page = 0; all = []; $('#list').innerHTML = '<div class="empty">Loading…</div>'; }
    const { data, error } = await query(page * PAGE, page * PAGE + PAGE - 1);
    if (error) return toast(error.message);
    all = all.concat(data);
    $('#list').innerHTML = all.length ? all.map(leadCard).join('') : '<div class="empty">No leads found</div>';
    bindLeadCards($('#list'), all);
    $('#more').style.display = data.length === PAGE ? 'block' : 'none';
    page++;
  };
  $('#more').onclick = () => load(false);
  let t;
  $('#q').oninput = (e) => { clearTimeout(t); t = setTimeout(() => { f.q = e.target.value.trim(); load(true); }, 350); };
  const syncChips = () => { $('#fs').value = f.status; document.querySelectorAll('#qc .chip').forEach((c) => c.classList.toggle('on', c.dataset.k === f.status)); };
  $('#fs').onchange = (e) => { f.status = e.target.value; syncChips(); load(true); };
  document.querySelectorAll('#qc .chip').forEach((c) => (c.onclick = () => { f.status = c.dataset.k; syncChips(); load(true); }));
  syncChips();
  $('#ft').onchange = (e) => { f.temp = e.target.value; load(true); };
  if (isAdmin()) {
    $('#fa').onchange = (e) => { f.agent = e.target.value; load(true); };
    $('#exp').onclick = exportAll;
    $('#fb').onchange = (e) => { f.batch = e.target.value; load(true); };
    sb.from('leads').select('batch').not('batch', 'is', null).limit(5000).then(({ data }) => {
      const names = [...new Set((data || []).map((x) => x.batch))].sort();
      $('#fb').insertAdjacentHTML('beforeend', names.map((b) => `<option value="${esc(b)}">${esc(b)}</option>`).join(''));
    });
    $('#delall').onclick = async () => {
      const { count, error: ce } = await filt(sb.from('leads').select('id', { count: 'exact', head: true }));
      if (ce) return toast(ce.message);
      if (!count) return toast('No leads to delete');
      const hasFilter = f.q || f.status || f.temp || f.agent || f.batch;
      const word = window.prompt(`This will permanently delete ${count} lead(s)${hasFilter ? ' matching your current filters' : ' (ALL leads in the CRM!)'} together with their call history.\n\nType DELETE to confirm.`);
      if (word !== 'DELETE') return toast('Cancelled');
      const { error } = await filt(sb.from('leads').delete());
      if (error) return toast(error.message);
      toast(count + ' leads deleted');
      load(true);
    };
  }
  $('#addl').onclick = () => openAddLead(() => load(true));
  load(true);
}

async function exportAll() {
  toast('Preparing export…');
  let rows = [], from = 0;
  for (;;) {
    const { data, error } = await sb.from('leads').select(LEAD_SELECT).order('id').range(from, from + 999);
    if (error) return toast(error.message);
    rows = rows.concat(data);
    if (data.length < 1000) break;
    from += 1000;
  }
  const out = rows.map((l) => ({
    Name: l.name, Phone: l.phone, Agent: l.agent ? l.agent.full_name : '', Status: STATUS[l.status], Temperature: l.temperature,
    Calls: l.call_count, 'Last called': l.last_called_at || '', 'Next follow-up': l.next_followup || '', 'Last note': l.last_note || '',
    Batch: l.batch || '', Place: l.place || '', ...l.extra,
  }));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(out), 'Leads');
  XLSX.writeFile(wb, `crm-leads-${new Date().toISOString().slice(0, 10)}.xlsx`);
}

// ---------- lead detail ----------
async function openLead(l) {
  if (!l) return;
  openSheet('<div class="empty">Loading…</div>');
  const { data: hist } = await sb.from('calls').select('*, by:profiles!agent_id(full_name)').eq('lead_id', l.id).order('called_at', { ascending: false });
  const extra = Object.entries(l.extra || {});
  const waNum = (CFG.COUNTRY_CODE + l.phone_norm).replace('+', '');
  openSheet(`
    <h3>${esc(l.name || 'No name')}</h3>
    <div><span class="pill ${l.status}">${STATUS[l.status]}</span> <span class="pill ${l.temperature}">${l.temperature}</span></div>
    <div class="kv"><span>Phone</span><span>${esc(l.phone)}</span>
      ${l.place ? `<span>📍 From</span><span><b>${esc(l.place)}</b></span>` : ''}
      ${l.project ? `<span>Project</span><span>${esc(l.project)}</span>` : ''}${l.source ? `<span>Source</span><span>${esc(l.source)}</span>` : ''}${l.budget ? `<span>Budget</span><span>${esc(l.budget)}</span>` : ''}
      ${l.next_followup ? `<span>Follow-up</span><span>${fmt(l.next_followup)}</span>` : ''}
      ${isAdmin() ? `<span>Agent</span><span>${esc(l.agent ? l.agent.full_name : 'Unassigned')}</span>` : ''}
      ${extra.map(([k, v]) => `<span>${esc(k)}</span><span>${esc(v)}</span>`).join('')}</div>
    <div class="row" style="margin:12px 0"><button class="btn green" id="dial">📞 Call</button>
      <button class="btn ghost" id="wa">💬 WhatsApp</button></div>
    <button class="btn ghost block sm" id="logm">Log a call manually</button>
    ${isAdmin() ? `<label>Reassign to</label><select id="reas"><option value="">Unassigned</option>${S.agents.filter(isAgent).map((a) => `<option value="${a.id}" ${a.id === l.assigned_to ? 'selected' : ''}>${esc(a.full_name || a.email)}</option>`).join('')}</select>` : ''}
    <h2>History</h2>
    ${(hist || []).length ? hist.map((c) => `<div class="hist"><b>${STATUS[c.outcome]}</b> ${c.temperature ? `<span class="pill ${c.temperature}">${c.temperature}</span>` : ''}<br>${c.note ? esc(c.note) + '<br>' : ''}<small>${fmt(c.called_at)} · ${esc(c.by ? c.by.full_name : (c.agent_name || 'Former agent'))}${c.followup_at ? ' · follow-up ' + fmt(c.followup_at) : ''}</small></div>`).join('') : '<div class="note">No calls yet</div>'}
    ${isAdmin() ? '<button class="btn red block sm" style="margin-top:12px" id="dl">🗑 Delete this lead</button>' : ''}
    <button class="btn ghost block" style="margin-top:12px" id="cl">Close</button>`);
  $('#cl').onclick = closeSheet;
  if (isAdmin()) $('#dl').onclick = async () => {
    if (!window.confirm(`Delete ${l.name || l.phone} permanently? Their call history will be deleted too.`)) return;
    const { error } = await sb.from('leads').delete().eq('id', l.id);
    if (error) return toast(error.message);
    closeSheet(); toast('Lead deleted'); renderShell();
  };
  $('#dial').onclick = () => { closeSheet(); startCall(l); };
  $('#logm').onclick = () => openDisposition(l);
  $('#wa').onclick = () => openWhatsApp(l);
  if (isAdmin()) $('#reas').onchange = async (e) => {
    const v = e.target.value || null;
    const { error } = await sb.from('leads').update({ assigned_to: v, assigned_at: v ? new Date().toISOString() : null }).eq('id', l.id);
    toast(error ? error.message : 'Reassigned');
  };
}

// ---------- calling + outcome ----------
const pending = () => { try { return JSON.parse(sessionStorage.getItem('pendingCall')); } catch { return null; } };

function startCall(lead) {
  sessionStorage.setItem('pendingCall', JSON.stringify({ lead, at: Date.now() }));
  window.location.href = 'tel:' + CFG.COUNTRY_CODE + lead.phone_norm;
}

// when the agent comes back to the app after the call, ask what happened
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState !== 'visible' || !S.profile) return;
  const p = pending();
  if (p && Date.now() - p.at > 2500 && !$('#sheet-root .sheet')) openDisposition(p.lead);
});

function openDisposition(lead) {
  const st = { outcome: '', temp: lead.temperature || 'cold', tempTouched: false };
  openSheet(`
    <h3>How did the call go?</h3><div class="note">${esc(lead.name || '')} · ${esc(lead.phone)}${lead.place ? ' · 📍 ' + esc(lead.place) : ''}</div>
    <label>Outcome</label><div class="chips" id="oc">${OUTCOMES.map((o) => `<button class="chip" data-k="${o.k}">${o.l}</button>`).join('')}</div>
    <label>Project discussed</label>${projectPicker('dp', lead.project)}
    <label>Lead temperature</label><div class="chips" id="tp">${['cold', 'warm', 'hot'].map((t) => `<button class="chip ${t} ${t === st.temp ? 'on' : ''}" data-k="${t}">${t[0].toUpperCase() + t.slice(1)}</button>`).join('')}</div>
    <div id="rsw" style="display:none"><label>Reason (required)</label><div class="chips" id="rs"></div><input id="rso" type="text" placeholder="Type the reason" style="display:none;margin-top:6px"></div>
    <div id="fuw" style="display:none"><label>Follow-up / reminder</label><input id="fu" type="datetime-local"></div>
    <label>What was discussed (optional)</label><textarea id="nt" placeholder="You can leave this blank"></textarea>
    <div class="row" style="margin-top:12px"><button class="btn" id="sv">Save</button><button class="btn gold" id="sn">Save &amp; call next</button></div>
    <button class="btn ghost block sm" style="margin-top:8px" id="sk">Skip (don't log)</button>`);
  $('#oc').onclick = (e) => {
    const b = e.target.closest('.chip'); if (!b) return;
    st.outcome = b.dataset.k;
    document.querySelectorAll('#oc .chip').forEach((c) => c.classList.toggle('on', c === b));
    const o = OUTCOMES.find((x) => x.k === st.outcome);
    if (!st.tempTouched && o.t) {
      st.temp = o.t;
      document.querySelectorAll('#tp .chip').forEach((c) => c.classList.toggle('on', c.dataset.k === st.temp));
    }
    st.reason = '';
    const rl = REASONS[st.outcome];
    $('#rsw').style.display = rl ? 'block' : 'none';
    $('#rso').style.display = 'none';
    if (rl) $('#rs').innerHTML = rl.map((r) => `<button class="chip" data-k="${esc(r)}">${esc(r)}</button>`).join('');
    $('#fuw').style.display = o.fu ? 'block' : 'none';
    if (o.fu && !$('#fu').value) $('#fu').value = localInput(tomorrow11());
  };
  $('#rs').onclick = (e) => {
    const b = e.target.closest('.chip'); if (!b) return;
    st.reason = b.dataset.k;
    document.querySelectorAll('#rs .chip').forEach((c) => c.classList.toggle('on', c === b));
    $('#rso').style.display = st.reason === 'Other' ? 'block' : 'none';
  };
  $('#tp').onclick = (e) => {
    const b = e.target.closest('.chip'); if (!b) return;
    st.temp = b.dataset.k; st.tempTouched = true;
    document.querySelectorAll('#tp .chip').forEach((c) => c.classList.toggle('on', c === b));
  };
  const save = async (next) => {
    if (!st.outcome) return toast('Please choose an outcome');
    const o = OUTCOMES.find((x) => x.k === st.outcome);
    let reason = null;
    if (REASONS[st.outcome]) {
      reason = st.reason === 'Other' ? $('#rso').value.trim() : st.reason;
      if (!reason) return toast('Please choose a reason');
    }
    const fu = o.fu && $('#fu').value ? new Date($('#fu').value).toISOString() : null;
    const { error } = await sb.from('calls').insert({
      lead_id: lead.id, agent_id: S.profile.id, outcome: st.outcome, temperature: st.temp, reason,
      note: $('#nt').value.trim() || null, followup_at: fu, ...readProject('dp'),
    });
    if (error) return toast(error.message);
    sessionStorage.removeItem('pendingCall');
    closeSheet(); toast('Saved');
    const after = () => (next ? callNext() : refresh());
    if (st.outcome === 'no_answer') return openWhatsApp(lead, after);
    after();
  };
  bindProjectPicker('dp');
  $('#sv').onclick = () => save(false);
  $('#sn').onclick = () => save(true);
  $('#sk').onclick = () => { sessionStorage.removeItem('pendingCall'); closeSheet(); };
}

// ---------- Dashboard / stats ----------
async function viewDash(el) {
  el.innerHTML = '<div class="empty">Loading…</div>';
  const [ls, cs, dsr] = await Promise.all([sb.rpc('lead_stats'), sb.rpc('call_stats', { p_since: startOfToday().toISOString() }), sb.rpc('day_stats', { p_since: startOfToday().toISOString() })]);
  const dsx = dsr.data || [];
  if (ls.error) return (el.innerHTML = `<div class="empty">${esc(ls.error.message)}</div>`);
  const rows = ls.data || [], calls = cs.data || [];
  const agg = (id) => {
    const r = rows.filter((x) => x.assigned_to === id);
    const by = (f) => r.filter(f).reduce((s, x) => s + Number(x.n), 0);
    return {
      total: by(() => true), new: by((x) => x.status === 'new'), interested: by((x) => x.status === 'interested'),
      call_back: by((x) => x.status === 'call_back'), site_visit: by((x) => x.status === 'site_visit'), booked: by((x) => x.status === 'booked'),
      not_interested: by((x) => x.status === 'not_interested'),
      hot: by((x) => x.temperature === 'hot' && x.status !== 'new'), warm: by((x) => x.temperature === 'warm' && x.status !== 'new'),
      today: calls.filter((c) => c.agent_id === id).reduce((s, c) => s + Number(c.n), 0),
    };
  };
  if (!isAdmin()) {
    const a = agg(S.profile.id);
    el.innerHTML = `<div class="grid">
      <div class="stat"><b>${a.total}</b><small>My leads</small></div><div class="stat"><b>${a.today}</b><small>Calls today</small></div>
      <div class="stat"><b>${a.new}</b><small>Not called yet</small></div><div class="stat"><b>${a.interested}</b><small>Interested</small></div>
      <div class="stat" id="bk" style="cursor:pointer;border:1px solid #e0bb73"><b>${a.booked}</b><small>✅ Booked clients</small></div><div class="stat"><b>${a.hot}</b><small>Hot</small></div><div class="stat"><b>${a.warm}</b><small>Warm</small></div>
      <div class="stat"><b>${a.call_back}</b><small>Call back</small></div><div class="stat"><b>${a.site_visit}</b><small>Site visits</small></div></div>`;
    $('#bk').onclick = goBooked;
    return;
  }
  const unassigned = agg(null).total, total = rows.reduce((s, x) => s + Number(x.n), 0);
  const ag = S.agents.filter(isAgent);
  el.innerHTML = `<div class="grid"><div class="stat"><b>${total}</b><small>Total leads</small></div><div class="stat"><b>${unassigned}</b><small>Unassigned</small></div>
  <div class="stat" id="bk" style="cursor:pointer;border:1px solid #e0bb73;grid-column:span 2"><b>${rows.filter((x) => x.status === 'booked').reduce((t, x) => t + Number(x.n), 0)}</b><small>✅ Booked clients (tap to see the list)</small></div></div>
  <div class="tablewrap"><table><tr><th>Agent</th><th>Leads</th><th>New</th><th>Connected (of ${TARGET_CONN})</th><th>Interested</th><th>Call back</th><th>Site visit</th><th>Booked</th><th>Not int.</th><th>Hot</th><th>Warm</th></tr>
  ${ag.map((a) => { const x = agg(a.id); return `<tr><td>${esc(a.full_name || a.email)}</td><td>${x.total}</td><td>${x.new}</td><td><b>${((dsx.find((d) => d.agent_id === a.id) || {}).connected) || 0}</b></td><td>${x.interested}</td><td>${x.call_back}</td><td>${x.site_visit}</td><td>${x.booked}</td><td>${x.not_interested}</td><td>${x.hot}</td><td>${x.warm}</td></tr>`; }).join('')}</table></div>`;
  $('#bk').onclick = goBooked;
}

// ---------- Import (admin) ----------
function viewImport(el) {
  el.innerHTML = `<div class="card"><b>Upload Excel / CSV</b>
    <div class="note">Needs a name column and a phone column. Duplicate phone numbers (inside the file or already in the CRM) are skipped automatically.</div>
    <input type="file" id="file" accept=".xlsx,.xls,.csv" style="margin-top:8px"></div><div id="map"></div>`;
  $('#file').onchange = async (e) => {
    const f = e.target.files[0]; if (!f) return;
    const wb = XLSX.read(await f.arrayBuffer(), { type: 'array' });
    const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { defval: '', raw: false });
    if (!rows.length) return toast('File is empty');
    const headers = Object.keys(rows[0]);
    const g = H.guessCols(headers);
    const opts = (sel) => `<option value="">— none —</option>${headers.map((h) => `<option ${h === sel ? 'selected' : ''}>${esc(h)}</option>`).join('')}`;
    $('#map').innerHTML = `<div class="card"><b>${rows.length} rows found</b>
      <label>Name column</label><select id="cn">${opts(g.name)}</select>
      <label>Phone column</label><select id="cp">${opts(g.phone)}</select>
      <label>Project column (optional)</label><select id="cj">${opts(g.project)}</select>
      <label>Source column (optional)</label><select id="cs">${opts(g.source)}</select>
      <label>Budget column (optional)</label><select id="cb">${opts(g.budget)}</select>
      <label>Society / building name column (where the data is from)</label><select id="cso">${opts(g.society)}</select>
      <label>Area / location column (optional)</label><select id="car">${opts(g.area)}</select>
      <label>Batch name</label><input id="bn" type="text" value="${esc(f.name.replace(/\.[^.]+$/, '') + ' ' + new Date().toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }))}">
      <div id="sum" class="note"></div><button class="btn gold block" id="imp" style="margin-top:10px">Import</button><div id="prog" class="note"></div></div>`;
    const calc = () => { const r = H.buildLeads(rows, $('#cn').value, $('#cp').value, { project: $('#cj').value, source: $('#cs').value, budget: $('#cb').value, society: $('#cso').value, area: $('#car').value }); $('#sum').innerHTML = `Valid unique numbers: <b>${r.leads.length}</b> · Invalid/blank: ${r.invalid} · Duplicates in file: ${r.dupInFile}`; return r; };
    ['#cn', '#cp', '#cj', '#cs', '#cb', '#cso', '#car'].forEach((i) => ($(i).onchange = calc)); calc();
    $('#imp').onclick = async () => {
      if (!$('#cp').value) return toast('Choose the phone column');
      const r = calc(); $('#imp').disabled = true;
      let added = 0;
      for (let i = 0; i < r.leads.length; i += 500) {
        $('#prog').textContent = `Importing… ${Math.min(i + 500, r.leads.length)} / ${r.leads.length}`;
        const { data, error } = await sb.rpc('import_leads', { p_rows: r.leads.slice(i, i + 500), p_batch: $('#bn').value.trim() || null });
        if (error) { $('#imp').disabled = false; return toast(error.message); }
        added += data;
      }
      S.distBatch = $('#bn').value.trim();
      $('#prog').innerHTML = `✅ <b>${added}</b> new leads added · <b>${r.leads.length - added}</b> already in CRM (skipped) · ${r.dupInFile} duplicates in file · ${r.invalid} invalid.<br><br><button class="btn gold block" id="gd">Next: give leads to your team ›</button>`;
      $('#gd').onclick = () => { S.tab = 'dist'; renderShell(); };
    };
  };
}

// ---------- Distribute (admin) ----------
async function viewDist(el) {
  el.innerHTML = '<div class="empty">Loading…</div>';
  const [bs, st] = await Promise.all([sb.rpc('unassigned_batches'), sb.rpc('lead_stats')]);
  if (bs.error) return (el.innerHTML = `<div class="empty">${esc(bs.error.message)}</div>`);
  const batches = bs.data || [], data = st.data || [];
  const ag = S.agents.filter(isAgent);
  const sum = (f) => data.filter(f).reduce((s, x) => s + Number(x.n), 0);
  const allUn = batches.reduce((s, b) => s + Number(b.n), 0);
  const opts = [['ALL', `All unassigned leads (${allUn})`], ...batches.map((b) => [b.batch || '', `${b.batch || 'Added manually'} (${b.n})`])];
  let sel = S.distBatch && opts.find((o) => o[0] === S.distBatch) ? S.distBatch : opts[1] ? opts[1][0] : 'ALL';
  const total = () => (sel === 'ALL' ? allUn : Number((batches.find((b) => (b.batch || '') === sel) || {}).n || 0));

  el.innerHTML = `
  ${allUn ? `<div class="card"><b>Give leads by number</b>
    <div class="note">Leads are numbered 1, 2, 3… in the order they were uploaded. Example: Agent A gets 1 to 50, Agent B gets 51 to 100.</div>
    <label>Which upload?</label><select id="bsel">${opts.map(([v, l]) => `<option value="${esc(v)}" ${v === sel ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select>
    <div id="tot" class="note"></div>
    ${ag.map((a) => `<div class="row" style="margin-top:8px;align-items:end"><div style="flex:1.4"><b>${esc(a.full_name || a.email)}</b></div>
      <input type="number" min="1" class="rf" data-id="${a.id}" placeholder="From"><input type="number" min="1" class="rt" data-id="${a.id}" placeholder="To"></div>`).join('')}
    <div class="row" style="margin-top:12px"><button class="btn ghost" id="eq">Split equally</button><button class="btn gold" id="go">Distribute</button></div></div>`
  : '<div class="card empty">No unassigned leads. Upload a new Excel in the Import tab.</div>'}
  <h2>Current leads with each agent</h2>
  ${ag.map((a) => { const tot = sum((x) => x.assigned_to === a.id), nw = sum((x) => x.assigned_to === a.id && x.status === 'new');
    return `<div class="card"><b>${esc(a.full_name || a.email)}</b> <span class="note">${tot} leads · ${nw} not yet called</span>
    <div class="row" style="margin-top:8px"><input type="number" min="1" class="tb" data-id="${a.id}" placeholder="How many to take back?"><button class="btn ghost sm back-btn" data-id="${a.id}" data-n="${nw}" style="flex:none">Take back untouched</button></div></div>`; }).join('')}`;

  if (allUn) {
    const upd = () => { $('#tot').innerHTML = `This upload has <b>${total()}</b> leads (numbers 1 to ${total()}).`; };
    upd();
    $('#bsel').onchange = (e) => { sel = e.target.value; S.distBatch = sel; upd(); document.querySelectorAll('.rf,.rt').forEach((i) => (i.value = '')); };
    $('#eq').onclick = () => {
      const t = total(), per = Math.ceil(t / ag.length);
      ag.forEach((a, i) => {
        const f = i * per + 1, to = Math.min(t, (i + 1) * per);
        el.querySelector(`.rf[data-id="${a.id}"]`).value = f <= t ? f : '';
        el.querySelector(`.rt[data-id="${a.id}"]`).value = f <= t ? to : '';
      });
    };
    $('#go').onclick = async () => {
      const t = total(), plan = [];
      for (const a of ag) {
        const f = parseInt(el.querySelector(`.rf[data-id="${a.id}"]`).value, 10), to = parseInt(el.querySelector(`.rt[data-id="${a.id}"]`).value, 10);
        if (isNaN(f) && isNaN(to)) continue;
        if (isNaN(f) || isNaN(to) || f < 1 || to < f || to > t) return toast(`Check the numbers for ${a.full_name || a.email} (1 to ${t})`);
        plan.push({ agent: a.id, from: f, to });
      }
      if (!plan.length) return toast('Enter a From and To number for at least one agent');
      const sorted = [...plan].sort((x, y) => x.from - y.from);
      for (let i = 1; i < sorted.length; i++) if (sorted[i].from <= sorted[i - 1].to) return toast('Number ranges overlap. Please fix.');
      $('#go').disabled = true;
      const { data: n, error } = await sb.rpc('distribute_plan', { p_batch: sel === 'ALL' ? null : sel, p_plan: plan });
      if (error) { $('#go').disabled = false; return toast(error.message); }
      toast(`${n} leads given`); viewDist(el);
    };
  }
  el.querySelectorAll('.back-btn').forEach((b) => (b.onclick = async () => {
    const inp = el.querySelector(`.tb[data-id="${b.dataset.id}"]`);
    const n = parseInt(inp.value || '0', 10) || parseInt(b.dataset.n, 10);
    if (!n) return toast('Nothing to take back');
    const { data: back, error: e } = await sb.rpc('return_leads', { p_agent: b.dataset.id, p_count: n });
    toast(e ? e.message : `${back} leads taken back`); if (!e) viewDist(el);
  }));
}

// ---------- projects ----------
const PCATS = [['under_construction', 'Under Construction'], ['ready_to_move', 'Ready to Move'], ['resale', 'Resale'], ['rental', 'Rental'], ['commercial', 'Commercial']];
const pcatName = (k) => (PCATS.find((c) => c[0] === k) || ['', ''])[1];
let projCat = 'all';
async function loadProjects() {
  const { data } = await sb.from('projects').select('*').order('name');
  S.projects = data || [];
}
// dropdown of admin-defined projects + "Other" with a free-text box
function projectPicker(id, current) {
  const act = S.projects.filter((p) => p.active);
  const known = act.find((p) => p.name === current);
  return `<select id="${id}-s"><option value="">— Not discussed —</option>
    ${act.map((p) => `<option value="${p.id}" ${known && known.id === p.id ? 'selected' : ''}>${esc(p.name)}${p.location ? ' · ' + esc(p.location) : ''}${p.category && p.category !== 'under_construction' ? ' (' + esc(pcatName(p.category)) + ')' : ''}</option>`).join('')}
    <option value="other">Other / new project…</option></select>
    <input id="${id}-o" type="text" placeholder="Type the project name" style="display:none;margin-top:6px">`;
}
function bindProjectPicker(id) {
  $('#' + id + '-s').onchange = (e) => {
    const o = $('#' + id + '-o');
    o.style.display = e.target.value === 'other' ? 'block' : 'none';
    if (e.target.value === 'other') o.focus();
  };
}
function readProject(id) {
  const v = $('#' + id + '-s').value;
  if (v === 'other') return { project_other: $('#' + id + '-o').value.trim() || null };
  return v ? { project_id: Number(v) } : {};
}
function projectName(id) {
  const v = $('#' + id + '-s').value;
  if (v === 'other') return $('#' + id + '-o').value.trim() || null;
  const p = S.projects.find((x) => String(x.id) === v);
  return p ? p.name : null;
}

// ---------- Projects (admin) ----------
async function viewProjects(el) {
  await loadProjects();
  const { data: oth } = await sb.from('calls').select('project_other').not('project_other', 'is', null).limit(500);
  const names = new Set(S.projects.map((p) => p.name.toLowerCase()));
  const suggested = [...new Set((oth || []).map((r) => r.project_other.trim()))].filter((n) => n && !names.has(n.toLowerCase()));
  el.innerHTML = `<button class="btn gold block" id="np">＋ Add project</button><button class="btn ghost block" id="mt" style="margin-top:8px">💬 WhatsApp message templates</button>
  ${suggested.length ? `<h2>Mentioned by agents (not in your list)</h2>${suggested.map((n) => `<div class="card lead"><div class="nm">${esc(n)}</div><button class="btn sm" data-add="${esc(n)}" style="flex:none">Add to list</button></div>`).join('')}` : ''}
  <div class="chips" id="pcats" style="margin-top:14px">${[['all', 'All']].concat(PCATS).map(([k, n]) => `<button class="chip ${projCat === k ? 'on' : ''}" data-cat="${k}">${n} (${k === 'all' ? S.projects.length : S.projects.filter((p) => p.category === k).length})</button>`).join('')}</div>
  <h2>${projCat === 'all' ? 'Your projects' : pcatName(projCat)} (${S.projects.filter((p) => projCat === 'all' || p.category === projCat).length})</h2>
  ${S.projects.filter((p) => projCat === 'all' || p.category === projCat).map((p) => `<div class="card lead" data-id="${p.id}"><div><div class="nm">${esc(p.name)}</div>
    <div class="ph">${esc([pcatName(p.category), p.location, p.property_type, p.price_range].filter(Boolean).join(' · '))}</div>
    <div class="sub">${p.active ? 'Active' : '<span class="over">Hidden from agents</span>'}</div></div><span style="color:var(--muted)">Edit ›</span></div>`).join('') || '<div class="empty">No projects in this category yet.</div>'}`;
  el.querySelectorAll('[data-cat]').forEach((b) => (b.onclick = () => { projCat = b.dataset.cat; viewProjects(el); }));
  $('#np').onclick = () => editProject(null, el);
  $('#mt').onclick = manageTemplates;
  el.querySelectorAll('[data-add]').forEach((b) => (b.onclick = () => editProject({ name: b.dataset.add, active: true }, el)));
  el.querySelectorAll('.lead[data-id]').forEach((c) => (c.onclick = () => editProject(S.projects.find((p) => String(p.id) === c.dataset.id), el)));
}
function editProject(p, el) {
  const isNew = !p || !p.id;
  p = p || { active: true };
  openSheet(`<h3>${isNew ? 'Add project' : 'Edit project'}</h3>
    <label>Category</label><select id="pc2">${PCATS.map(([k, n]) => `<option value="${k}" ${(p.category || (projCat !== 'all' ? projCat : 'under_construction')) === k ? 'selected' : ''}>${n}</option>`).join('')}</select>
    <label>Project / listing name</label><input id="pn" type="text" value="${esc(p.name || '')}">
    <label>Location / area</label><input id="pl" type="text" value="${esc(p.location || '')}" placeholder="e.g. Kondhwa, Pune">
    <label>Type</label><input id="pt" type="text" value="${esc(p.property_type || '')}" placeholder="e.g. 1/2/3 BHK flats">
    <label>Price range</label><input id="pr" type="text" value="${esc(p.price_range || '')}" placeholder="e.g. 45L - 85L">
    <label>Details (shown to the team)</label><textarea id="pd" placeholder="Possession date, amenities, RERA no., offers...">${esc(p.details || '')}</textarea>
    <label><input type="checkbox" id="pa" ${p.active ? 'checked' : ''}> Show to agents</label>
    <div class="row" style="margin-top:14px"><button class="btn ghost" id="pc">Cancel</button><button class="btn gold" id="ps">Save</button></div>`);
  $('#pc').onclick = closeSheet;
  $('#ps').onclick = async () => {
    const name = $('#pn').value.trim();
    if (!name) return toast('Enter the project name');
    const row = { name, category: $('#pc2').value, location: $('#pl').value.trim() || null, property_type: $('#pt').value.trim() || null,
      price_range: $('#pr').value.trim() || null, details: $('#pd').value.trim() || null, active: $('#pa').checked };
    const q = isNew ? sb.from('projects').insert(row) : sb.from('projects').update(row).eq('id', p.id);
    const { error } = await q;
    if (error) return toast(error.code === '23505' ? 'A project with this name already exists' : error.message);
    closeSheet(); toast('Saved'); viewProjects(el);
  };
}

// ---------- online lead alarm (Meta / website / portal leads) ----------
let ringCtx = null, ringTimer = null, ringing = false;
const seenKey = () => 'stcrm-ringed-' + (S.profile ? S.profile.id : '');
const ringedIds = () => { try { return JSON.parse(localStorage.getItem(seenKey()) || '[]'); } catch (_) { return []; } };
const markRinged = (id) => { try { localStorage.setItem(seenKey(), JSON.stringify(ringedIds().concat(id).slice(-200))); } catch (_) {} };
// phones only allow sound after a tap, so unlock the audio on the first touch
['click', 'touchstart'].forEach((ev) => document.addEventListener(ev, () => {
  try { if (!ringCtx) ringCtx = new (window.AudioContext || window.webkitAudioContext)(); if (ringCtx.state === 'suspended') ringCtx.resume(); } catch (_) {}
}, { passive: true }));
function beep(freq, t0, dur) {
  const o = ringCtx.createOscillator(), g = ringCtx.createGain();
  o.type = 'triangle'; o.frequency.value = freq; o.connect(g); g.connect(ringCtx.destination);
  g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(0.6, t0 + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  o.start(t0); o.stop(t0 + dur + 0.05);
}
function ringOnce() {
  try { if (navigator.vibrate) navigator.vibrate([400, 150, 400, 150, 400]); } catch (_) {}
  if (!ringCtx || ringCtx.state !== 'running') return;
  const t = ringCtx.currentTime;
  [659, 784, 659, 1047].forEach((f, i) => beep(f, t + i * 0.22, 0.2));
  [659, 784, 659, 1047].forEach((f, i) => beep(f, t + 1 + i * 0.22, 0.2));
}
function stopRing() {
  ringing = false; clearInterval(ringTimer); ringTimer = null;
  try { if (navigator.vibrate) navigator.vibrate(0); } catch (_) {}
  const b = $('#ringbox'); if (b) b.remove();
}
function showRing(l) {
  if (ringing) return;
  ringing = true; markRinged(l.id);
  document.body.insertAdjacentHTML('beforeend', `<div id="ringbox" style="position:fixed;inset:0;z-index:9999;background:#0d1a2e;color:#fff;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:12px;padding:24px;text-align:center">
    <div style="font-size:56px">📣</div><div style="font-size:22px;font-weight:700;color:#e3b95a">New ${esc(l.source === 'Meta Ads' ? 'Meta' : (l.source || 'online'))} lead!</div>
    <div style="font-size:26px;font-weight:700">${esc(l.name || 'New enquiry')}</div><div style="font-size:20px">${esc(l.phone)}</div>
    ${l.project ? `<div style="opacity:.85">${esc(l.project)}</div>` : ''}
    <button class="btn gold block" id="rpick" style="margin-top:18px;font-size:20px;padding:16px">📞 Pick up &amp; call now</button>
    <button class="btn ghost block" id="rlater" style="color:#fff;border-color:#fff">Later</button></div>`);
  ringOnce(); ringTimer = setInterval(ringOnce, 2200);
  $('#rpick').onclick = () => { stopRing(); S.tab = 'today'; renderShell(); startCall(l); };
  $('#rlater').onclick = () => { stopRing(); if (S.tab === 'today') renderShell(); };
}
async function checkOnlineLeads() {
  if (!S.profile || isAdmin() || ringing || document.visibilityState !== 'visible') return;
  const since = new Date(Date.now() - 30 * 60000).toISOString();
  const { data } = await sb.from('leads').select('*').eq('assigned_to', S.profile.id).eq('batch', 'auto').eq('status', 'new').eq('call_count', 0).gte('assigned_at', since).order('assigned_at');
  const seen = ringedIds();
  const l = (data || []).find((x) => !seen.includes(x.id));
  if (l) showRing(l);
}
setInterval(checkOnlineLeads, 12000);
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') checkOnlineLeads(); });
if ('serviceWorker' in navigator) navigator.serviceWorker.addEventListener('message', (e) => { if (e.data && e.data.type === 'newlead') checkOnlineLeads(); });

// ---------- add lead ----------
const SOURCES = ['Cold call', 'Walk-in', 'Referral', 'Facebook', 'OLX', 'Website', 'Other'];
function openAddLead(done) {
  openSheet(`<h3>Add lead</h3>
    <label>Name</label><input id="an" type="text">
    <label>Phone</label><input id="ap" type="text" inputmode="tel">
    <label>Project (optional)</label>${projectPicker('aj')}
    <label>Budget (optional)</label><input id="ab" type="text">
    <label>Source</label><select id="as">${SOURCES.map((x) => `<option>${x}</option>`).join('')}</select>
    ${isAdmin() ? `<label>Assign to</label><select id="aa"><option value="">Unassigned</option>${S.agents.filter(isAgent).map((a) => `<option value="${a.id}">${esc(a.full_name || a.email)}</option>`).join('')}</select>` : ''}
    <div class="row" style="margin-top:14px"><button class="btn ghost" id="ac">Cancel</button><button class="btn gold" id="asv">Save</button></div>`);
  bindProjectPicker('aj');
  $('#ac').onclick = closeSheet;
  $('#asv').onclick = async () => {
    const norm = H.normPhone($('#ap').value);
    if (!norm) return toast('Enter a valid 10-digit phone number');
    const to = isAdmin() ? $('#aa').value || null : S.profile.id;
    const { error } = await sb.from('leads').insert({
      name: $('#an').value.trim(), phone: $('#ap').value.trim(), phone_norm: norm,
      project: projectName('aj'), budget: $('#ab').value.trim() || null, source: $('#as').value,
      assigned_to: to, assigned_at: to ? new Date().toISOString() : null,
    });
    if (error) return toast(error.code === '23505' ? 'This number already exists in the CRM' : error.message);
    closeSheet(); toast('Lead added'); if (done) done();
  };
}

// ---------- Team (admin) ----------
async function viewDisposed(el) {
  const f = { agent: '', range: 'today', outcome: '' };
  const ag = S.agents.filter(isAgent);
  el.innerHTML = `<h2>Disposed leads</h2><div class="note">Leads your agents closed as not interested or wrong number, with their reasons.</div>
  <select id="da" style="margin-top:8px"><option value="">All agents</option>${ag.map((a) => `<option value="${a.id}">${esc(a.full_name || a.email)}</option>`).join('')}</select>
  <div class="chips" id="dr" style="margin-top:8px">${[['today', 'Today'], ['yest', 'Yesterday'], ['week', 'Last 7 days'], ['all', 'All time']].map(([k, v]) => `<button class="chip" data-k="${k}">${v}</button>`).join('')}</div>
  <div class="chips" id="do" style="margin-top:8px">${[['', 'Both'], ['not_interested', 'Not interested'], ['wrong_number', 'Wrong number']].map(([k, v]) => `<button class="chip" data-k="${k}">${v}</button>`).join('')}</div>
  <div id="dsum" class="note" style="margin:8px 0"></div><div id="dl"></div>`;
  const range = () => {
    const t = startOfToday(), d = (n) => new Date(t.getTime() + n * 864e5);
    return { today: [t, d(1)], yest: [d(-1), t], week: [d(-6), d(1)], all: [new Date(2020, 0, 1), d(1)] }[f.range];
  };
  const load = async () => {
    document.querySelectorAll('#dr .chip').forEach((c) => c.classList.toggle('on', c.dataset.k === f.range));
    document.querySelectorAll('#do .chip').forEach((c) => c.classList.toggle('on', c.dataset.k === f.outcome));
    $('#dl').innerHTML = '<div class="empty">Loading…</div>';
    const [a, b] = range();
    const { data, error } = await sb.rpc('disposed_calls', { p_agent: f.agent || null, p_from: a.toISOString(), p_to: b.toISOString() });
    if (error) return ($('#dl').innerHTML = `<div class="empty">${esc(error.message)}</div>`);
    const rows = (data || []).filter((r) => !f.outcome || r.outcome === f.outcome);
    const cnt = {}; rows.forEach((r) => { const k = r.reason || 'No reason'; cnt[k] = (cnt[k] || 0) + 1; });
    $('#dsum').innerHTML = `<b>${rows.length}</b> disposed` + (rows.length ? ' · ' + Object.entries(cnt).sort((x, y) => y[1] - x[1]).map(([k, v]) => `${esc(k)}: ${v}`).join(' · ') : '');
    $('#dl').innerHTML = rows.length ? rows.map((r) => `<div class="card"><b>${esc(r.name || 'No name')}</b> · <a href="tel:${esc(r.phone)}">${esc(r.phone)}</a>${r.place ? `<div class="note">📍 ${esc(r.place)}</div>` : ''}
      <div style="margin-top:4px"><span class="pill cold">${STATUS[r.outcome]}</span> <b>${esc(r.reason || 'No reason given')}</b></div>
      ${r.note ? `<div class="note">${esc(r.note)}</div>` : ''}
      <div class="note">${esc(r.agent_name || '')} · ${fmt(r.called_at)}${r.verified_at ? ' · ✅ Verified' : ''}</div>
      <div class="row" style="margin-top:6px">${r.verified_at ? '' : `<button class="btn ghost sm" data-v="${r.call_id}">✅ Mark verified</button>`}${r.lead_status === 'new' ? '' : `<button class="btn ghost sm" data-r="${r.lead_id}">↩ Re-open lead</button>`}</div></div>`).join('') : '<div class="empty">No disposed leads for this selection</div>';
    el.querySelectorAll('[data-v]').forEach((b) => (b.onclick = async () => { const { error: e } = await sb.rpc('verify_call', { p_id: Number(b.dataset.v) }); if (e) return toast(e.message); toast('Verified'); load(); }));
    el.querySelectorAll('[data-r]').forEach((b) => (b.onclick = async () => { if (!confirm('Put this lead back in the agent’s new queue?')) return; const { error: e } = await sb.rpc('reopen_lead', { p_lead: Number(b.dataset.r) }); if (e) return toast(e.message); toast('Lead re-opened'); load(); }));
  };
  $('#da').onchange = (e) => { f.agent = e.target.value; load(); };
  document.querySelectorAll('#dr .chip').forEach((c) => (c.onclick = () => { f.range = c.dataset.k; load(); }));
  document.querySelectorAll('#do .chip').forEach((c) => (c.onclick = () => { f.outcome = c.dataset.k; load(); }));
  load();
}

async function viewTeam(el) {
  const { data } = await sb.from('profiles').select('*').order('created_at');
  S.agents = data || [];
  el.innerHTML = `<button class="btn gold block" id="nu">＋ Add new user</button><h2>Team (${S.agents.length})</h2>
  ${S.agents.map((u) => `<div class="card lead"><div><div class="nm">${esc(u.full_name || u.email)}</div><div class="ph">${esc(u.email)}${u.phone ? ' · ' + esc(u.phone) : ''}</div>
    <div class="sub">${u.role === 'admin' ? 'Admin' : 'Agent'}${u.agent_code ? ' · ' + esc(u.agent_code) : ''} · ${u.active ? 'Active' : '<span class="over">Inactive</span>'}</div></div>
    <button class="btn ghost sm" data-m="${u.id}" style="flex:none">Manage</button></div>`).join('')}
  <div class="note">Blocked users cannot log in; their leads stay safe and can be taken back in Distribute.</div>`;
  el.querySelectorAll('button[data-m]').forEach((b) => (b.onclick = () => manageUser(S.agents.find((x) => x.id === b.dataset.m), el)));
  $('#nu').onclick = () => {
    openSheet(`<h3>Add new user</h3>
      <label>Full name</label><input id="un" type="text">
      <label>Email (used to log in)</label><input id="ue" type="email" autocapitalize="none">
      <label>Password (min 8 characters)</label><input id="up" type="text" autocapitalize="none">
      <label>Phone (optional)</label><input id="uph" type="text" inputmode="tel">
      <label>Role</label><select id="ur"><option value="agent">Agent</option><option value="admin">Admin</option></select>
      <label>Agent code (optional, e.g. SI)</label><input id="uc" type="text">
      <div class="row" style="margin-top:14px"><button class="btn ghost" id="uc2">Cancel</button><button class="btn gold" id="us">Create user</button></div>`);
    $('#uc2').onclick = closeSheet;
    $('#us').onclick = async () => {
      const email = $('#ue').value.trim(), password = $('#up').value, name = $('#un').value.trim();
      if (!name || !email || password.length < 8) return toast('Enter name, email and an 8+ character password');
      $('#us').disabled = true;
      // separate client so the admin stays logged in
      const { data: r, error } = await sb.functions.invoke('admin-users', { body: {
        action: 'create', email, password, full_name: name, role: $('#ur').value, phone: $('#uph').value.trim() || null, agent_code: $('#uc').value.trim() || null } });
      if (error || !r || r.error) { $('#us').disabled = false; return toast((r && r.error) || (error && error.message) || 'Could not create user'); }
      closeSheet(); toast('User created. Share the email and password with them.'); viewTeam(el);
    };
  };
}

// ---------- admin: manage one team member ----------
async function adminCall(body) {
  const { data, error } = await sb.functions.invoke('admin-users', { body });
  if (error || !data || data.error) { toast((data && data.error) || (error && error.message) || 'Failed'); return false; }
  return true;
}
function manageUser(u, el) {
  if (!u) return;
  const me = u.id === S.profile.id;
  openSheet(`<h3>${esc(u.full_name || u.email)}</h3><div class="ph">${esc(u.email)} · ${u.role === 'admin' ? 'Admin' : 'Agent'} · ${u.active ? 'Active' : 'Blocked'}</div>
    <label>Set a new password for this user (min 8 characters)</label><input id="mp" type="text" autocapitalize="none">
    <button class="btn gold block sm" id="mpb" style="margin-top:8px">Set new password</button>
    ${me ? '<div class="note">This is your own account. Use 🔑 at the top to change your password.</div>' : `
    <button class="btn ${u.active ? 'ghost' : 'green'} block" style="margin-top:14px" id="mb">${u.active ? '⛔ Block this user (cannot log in)' : '✅ Unblock this user'}</button>
    <button class="btn red block" style="margin-top:8px" id="md">🗑 Delete this user permanently</button>
    <div class="note">Their leads become Unassigned and stay safe. Their call history stays too.</div>`}
    <button class="btn ghost block" style="margin-top:12px" id="mc">Close</button>`);
  $('#mc').onclick = closeSheet;
  $('#mpb').onclick = async () => {
    const p = $('#mp').value;
    if (p.length < 8) return toast('Use at least 8 characters');
    if (await adminCall({ action: 'set_password', user_id: u.id, password: p })) { closeSheet(); toast('Password changed. Share it with them privately.'); }
  };
  if (!me) {
    $('#mb').onclick = async () => { if (await adminCall({ action: 'set_active', user_id: u.id, active: !u.active })) { closeSheet(); toast(u.active ? 'User blocked' : 'User unblocked'); viewTeam(el); } };
    $('#md').onclick = async () => {
      if (window.prompt(`Delete ${u.full_name || u.email} permanently?\n\nType DELETE to confirm.`) !== 'DELETE') return toast('Cancelled');
      if (await adminCall({ action: 'delete_user', user_id: u.id })) { closeSheet(); toast('User deleted'); viewTeam(el); }
    };
  }
}

boot();
