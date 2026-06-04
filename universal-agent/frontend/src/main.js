// ── State ─────────────────────────────────────────────────────────────────────
const state = {
  page: 'home',
  agents: [],
  activeAgentId: null,
  chatHistory: {},   // agentId → [{role, text, time}]
  sending: false,
};

const API = '';  // proxied by Vite → localhost:8001

// ── Toast ─────────────────────────────────────────────────────────────────────
let toastContainer;
function toast(msg, type = '') {
  const t = document.createElement('div');
  t.className = 'toast';
  t.textContent = msg;
  toastContainer.appendChild(t);
  requestAnimationFrame(() => {
    t.classList.add('show', ...( type ? [type] : [] ));
  });
  setTimeout(() => {
    t.classList.remove('show');
    setTimeout(() => t.remove(), 300);
  }, 3000);
}

// ── API calls ─────────────────────────────────────────────────────────────────
async function fetchAgents() {
  const r = await fetch(`${API}/agents`);
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.json();
}

async function toggleAgent(agentId, action) {
  const r = await fetch(`${API}/agents/${agentId}/${action}`, { method: 'POST' });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.json();
}

async function globalToggle(action) {
  const r = await fetch(`${API}/agents/${action}`, { method: 'POST' });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.json();
}

async function sendChat(agentId, message, port) {
  const r = await fetch(`http://localhost:${port}/agent/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message, session_id: `ua-ui-${agentId}` }),
  });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.json();
}

// ── Load agents ───────────────────────────────────────────────────────────────
async function loadAgents() {
  try {
    const data = await fetchAgents();
    state.agents = data.agents;
    return data;
  } catch (e) {
    toast(`Failed to load agents: ${e.message}`, 'error');
    return null;
  }
}

// ── Routing ───────────────────────────────────────────────────────────────────
function navigate(page) {
  state.page = page;
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.getElementById(`page-${page}`)?.classList.add('active');
  document.querySelectorAll('.nav-tab').forEach(t => {
    t.classList.toggle('active', t.dataset.page === page);
  });
  if (page === 'home')      renderHome();
  if (page === 'dashboard') renderDashboard();
  if (page === 'chat')      renderChat();
}

// ── HOME PAGE ─────────────────────────────────────────────────────────────────
function renderHome() {
  loadAgents().then(data => {
    if (!data) return;
    const online  = data.online;
    const locked  = data.locked;
    const sessions = data.agents.reduce((s, a) => s + (a.active_sessions || 0), 0);

    document.getElementById('h-total').textContent   = data.total;
    document.getElementById('h-online').textContent  = online;
    document.getElementById('h-locked').textContent  = locked;
    document.getElementById('h-sessions').textContent = sessions;

    document.getElementById('home-agents-grid').innerHTML =
      data.agents.map(homeAgentCard).join('');
  });
}

function agentIconBg(color) {
  return `background:${color}22;border:1.5px solid ${color}44`;
}

function statusPill(a) {
  if (!a.online) return `<span class="status-pill pill-offline"><span class="dot"></span>Offline</span>`;
  if (a.locked)  return `<span class="status-pill pill-locked"><span class="dot"></span>Locked</span>`;
  return               `<span class="status-pill pill-active"><span class="dot"></span>Active</span>`;
}

function lockBtn(a) {
  if (!a.online) return `<button class="agent-lock-btn lock-btn-offline" disabled>⚠ Offline</button>`;
  if (a.locked)  return `<button class="agent-lock-btn lock-btn-unlock" onclick="onToggle('${a.id}','unlock')">🔓 Unlock ${a.name}</button>`;
  return               `<button class="agent-lock-btn lock-btn-lock"   onclick="onToggle('${a.id}','lock')">🔒 Lock ${a.name}</button>`;
}

function homeAgentCard(a) {
  const cardCls = `agent-card${a.locked ? ' locked' : ''}${!a.online ? ' offline' : ''}`;
  return `
  <div class="${cardCls}" id="hc-${a.id}">
    <div class="agent-card-top">
      <div class="agent-card-left">
        <div class="agent-icon" style="${agentIconBg(a.color)}">${a.icon ?? '🤖'}</div>
        <div>
          <div class="agent-name">${a.name}</div>
          <div class="agent-app">${a.app}</div>
        </div>
      </div>
      ${statusPill(a)}
    </div>
    <div class="agent-meta">
      <span class="meta-tag model">${a.model || '—'}</span>
      <span class="meta-tag port">:${a.port}</span>
    </div>
    <div class="agent-sessions">
      Sessions: <strong>${a.online ? a.active_sessions : '—'}</strong>
      &nbsp;·&nbsp; Tools: <strong>${a.online ? (a.tools?.length ?? 0) : '—'}</strong>
    </div>
    ${lockBtn(a)}
  </div>`;
}

// ── DASHBOARD PAGE ────────────────────────────────────────────────────────────
function renderDashboard() {
  loadAgents().then(data => {
    if (!data) return;
    const sessions = data.agents.reduce((s, a) => s + (a.active_sessions || 0), 0);
    document.getElementById('d-total').textContent    = data.total;
    document.getElementById('d-online').textContent   = data.online;
    document.getElementById('d-locked').textContent   = data.locked;
    document.getElementById('d-sessions').textContent = sessions;
    document.getElementById('d-total-txt').textContent = data.total;
    document.getElementById('dash-grid').innerHTML = data.agents.map(dashCard).join('');
    document.getElementById('d-refreshed').textContent =
      `Last refreshed: ${new Date().toLocaleTimeString()}`;
  });
}

function dashCard(a) {
  const cardCls = `dash-card${a.locked ? ' locked' : ''}${!a.online ? ' offline' : ''}`;
  const tools = (a.tools || []).map(t => `<span class="dash-pill">${t}</span>`).join('');
  const ragPill = a.rag ? `<span class="dash-pill rag">RAG ✓</span>` : '';
  let footerBtn;
  if (!a.online)  footerBtn = `<button class="btn btn-ghost btn-full btn-sm" disabled>⚠ Offline</button>`;
  else if (a.locked) footerBtn = `<button class="btn btn-success btn-full btn-sm" onclick="onToggle('${a.id}','unlock')">🔓 Unlock ${a.name}</button>`;
  else            footerBtn = `<button class="btn btn-danger btn-full btn-sm"  onclick="onToggle('${a.id}','lock')">🔒 Lock ${a.name}</button>`;
  return `
  <div class="${cardCls}" id="dc-${a.id}">
    <div class="dash-card-header">
      <div class="dash-card-left">
        <div class="dash-icon" style="${agentIconBg(a.color)}">${a.icon ?? '🤖'}</div>
        <div>
          <div class="dash-name">${a.name}</div>
          <div class="dash-app">${a.app}</div>
        </div>
      </div>
      ${statusPill(a)}
    </div>
    <div class="dash-card-body">
      <div class="dash-desc">${a.description}</div>
      <div class="dash-mini-stats">
        <div class="dash-mini"><div class="v">${a.online ? a.active_sessions : '—'}</div><div class="k">Sessions</div></div>
        <div class="dash-mini"><div class="v">${a.online ? (a.tools?.length ?? 0) : '—'}</div><div class="k">Tools</div></div>
        <div class="dash-mini"><div class="v">${a.online ? (a.rag ? 'Yes' : 'No') : '—'}</div><div class="k">RAG</div></div>
      </div>
      <div class="dash-pills">
        <span class="dash-pill model">${a.model || '—'}</span>
        <span class="dash-pill port">:${a.port}</span>
        ${ragPill}${tools}
      </div>
    </div>
    <div class="dash-card-footer">${footerBtn}</div>
  </div>`;
}

// ── CHAT PAGE ─────────────────────────────────────────────────────────────────
function renderChat() {
  loadAgents().then(data => {
    if (!data) return;
    renderAgentSidebar(data.agents);
    if (!state.activeAgentId && data.agents.length > 0) {
      const first = data.agents.find(a => a.online) ?? data.agents[0];
      selectAgent(first.id);
    } else if (state.activeAgentId) {
      renderChatMessages();
      updateChatTopbar();
    }
  });
}

function renderAgentSidebar(agents) {
  document.getElementById('agent-list').innerHTML = agents.map(a => {
    const badgeCls = !a.online ? 'offline' : a.locked ? 'locked' : 'online';
    const itemCls  = `agent-list-item${a.id === state.activeAgentId ? ' active' : ''}`;
    return `
    <div class="${itemCls}" onclick="selectAgent('${a.id}')">
      <div class="agent-list-icon" style="${agentIconBg(a.color)}">${a.icon ?? '🤖'}</div>
      <div>
        <div class="agent-list-name">${a.name}</div>
        <div class="agent-list-app">${a.app}</div>
      </div>
      <div class="agent-list-badge ${badgeCls}"></div>
    </div>`;
  }).join('');
}

function selectAgent(agentId) {
  state.activeAgentId = agentId;
  if (!state.chatHistory[agentId]) state.chatHistory[agentId] = [];
  renderAgentSidebar(state.agents);
  updateChatTopbar();
  renderChatMessages();
}

function updateChatTopbar() {
  const a = state.agents.find(x => x.id === state.activeAgentId);
  if (!a) return;
  document.getElementById('chat-agent-icon').textContent = a.icon ?? '🤖';
  document.getElementById('chat-agent-name').textContent = a.name;
  document.getElementById('chat-agent-sub').textContent  = `${a.app} · Port :${a.port}`;
  document.getElementById('chat-status-pill').outerHTML =
    `<span id="chat-status-pill">${statusPill(a)}</span>`;
  document.getElementById('chat-topbar-lock').innerHTML  =
    a.locked
      ? `<button class="btn btn-success btn-sm" onclick="onToggle('${a.id}','unlock')">🔓 Unlock</button>`
      : `<button class="btn btn-danger  btn-sm" onclick="onToggle('${a.id}','lock')">🔒 Lock</button>`;

  const lockedBar = document.getElementById('chat-locked-bar');
  lockedBar.classList.toggle('visible', !!a.locked);

  const sendBtn = document.getElementById('chatSend');
  const inp     = document.getElementById('chatInput');
  sendBtn.disabled = !a.online || a.locked;
  inp.disabled     = !a.online || a.locked;
  inp.placeholder  = !a.online ? 'Agent is offline'
                   : a.locked  ? 'Agent is locked — unlock to chat'
                   : `Message ${a.name}…`;
}

function renderChatMessages() {
  const msgs = state.chatHistory[state.activeAgentId] || [];
  const container = document.getElementById('chat-messages');

  if (msgs.length === 0) {
    const a = state.agents.find(x => x.id === state.activeAgentId);
    container.innerHTML = `
    <div class="empty-state">
      <div class="big-icon">${a?.icon ?? '🤖'}</div>
      <h3>Chat with ${a?.name ?? 'Agent'}</h3>
      <p>${a?.description ?? 'Ask anything about this application.'}</p>
    </div>`;
    return;
  }

  container.innerHTML = msgs.map(m => {
    const a = state.agents.find(x => x.id === state.activeAgentId);
    const isUser = m.role === 'user';
    return `
    <div class="msg ${isUser ? 'user' : 'agent'}">
      ${!isUser ? `<div class="msg-avatar">${a?.icon ?? '🤖'}</div>` : ''}
      <div>
        <div class="msg-bubble">${m.text}</div>
        <div class="msg-time">${m.time}</div>
      </div>
      ${isUser ? `<div class="msg-avatar">👤</div>` : ''}
    </div>`;
  }).join('');

  container.scrollTop = container.scrollHeight;
}

function addTyping() {
  const container = document.getElementById('chat-messages');
  const el = document.createElement('div');
  el.className = 'msg agent typing-indicator';
  el.id = 'typing';
  const a = state.agents.find(x => x.id === state.activeAgentId);
  el.innerHTML = `
  <div class="msg-avatar">${a?.icon ?? '🤖'}</div>
  <div class="msg-bubble">
    <div class="typing-dot"></div>
    <div class="typing-dot"></div>
    <div class="typing-dot"></div>
  </div>`;
  container.appendChild(el);
  container.scrollTop = container.scrollHeight;
}

function removeTyping() {
  document.getElementById('typing')?.remove();
}

function timeNow() {
  return new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

async function handleSend() {
  if (state.sending) return;
  const inp = document.getElementById('chatInput');
  const text = inp.value.trim();
  if (!text) return;

  const a = state.agents.find(x => x.id === state.activeAgentId);
  if (!a || !a.online || a.locked) return;

  state.sending = true;
  inp.value = '';
  inp.style.height = 'auto';
  document.getElementById('chatSend').disabled = true;

  if (!state.chatHistory[state.activeAgentId]) state.chatHistory[state.activeAgentId] = [];
  state.chatHistory[state.activeAgentId].push({ role: 'user', text, time: timeNow() });
  renderChatMessages();
  addTyping();

  try {
    const res = await sendChat(a.id, text, a.port);
    removeTyping();
    state.chatHistory[state.activeAgentId].push({
      role: 'agent', text: res.message, time: timeNow(),
    });
    renderChatMessages();
  } catch (e) {
    removeTyping();
    toast(`Error: ${e.message}`, 'error');
    state.chatHistory[state.activeAgentId].push({
      role: 'agent', text: `⚠️ Error: ${e.message}`, time: timeNow(),
    });
    renderChatMessages();
  } finally {
    state.sending = false;
    document.getElementById('chatSend').disabled = false;
    inp.disabled = false;
  }
}

// ── Lock / Unlock ─────────────────────────────────────────────────────────────
globalThis.onToggle = async (agentId, action) => {
  const btns = document.querySelectorAll(`[onclick*="'${agentId}'"]`);
  btns.forEach(b => { b.disabled = true; });
  try {
    const d = await toggleAgent(agentId, action);
    const label = action === 'lock' ? 'locked 🔒' : 'unlocked 🔓';
    toast(d.error ? `Error: ${d.error}` : `${d.agent ?? agentId} ${label}`,
          d.error ? 'error' : 'success');
    await reloadAndRefresh();
  } catch (e) {
    toast(`Error: ${e.message}`, 'error');
  } finally {
    btns.forEach(b => { b.disabled = false; });
  }
};

globalThis.onGlobal = async (action) => {
  document.querySelectorAll('.global-lock-btn').forEach(b => { b.disabled = true; });
  try {
    const d = await globalToggle(action);
    const ok  = d.results?.filter(x => !x.error).length ?? 0;
    const err = d.results?.filter(x =>  x.error).length ?? 0;
    const suffix = err > 0 ? `, ${err} unreachable` : '';
    const msg = action === 'lock-all'
      ? `All agents locked 🔒 (${ok} ok${suffix})`
      : `All agents unlocked 🔓 (${ok} ok${suffix})`;
    toast(msg, err > 0 ? 'error' : 'success');
    await reloadAndRefresh();
  } catch (e) {
    toast(`Error: ${e.message}`, 'error');
  } finally {
    document.querySelectorAll('.global-lock-btn').forEach(b => { b.disabled = false; });
  }
};

async function reloadAndRefresh() {
  const data = await loadAgents();
  if (!data) return;
  if (state.page === 'home')      renderHome();
  if (state.page === 'dashboard') renderDashboard();
  if (state.page === 'chat') {
    renderAgentSidebar(data.agents);
    updateChatTopbar();
  }
}

globalThis.selectAgent = selectAgent;

// ── Build initial HTML structure ───────────────────────────────────────────────
function buildApp() {
  document.getElementById('app').innerHTML = `
  <!-- Toast container -->
  <div class="toast-container" id="toasts"></div>

  <!-- Nav -->
  <nav class="nav">
    <div class="nav-brand">
      <div class="nav-brand-icon">🤖</div>
      <span class="nav-brand-name">Universal Agent</span>
    </div>
    <div class="nav-tabs">
      <button class="nav-tab active" data-page="home"      onclick="navigate('home')">Home</button>
      <button class="nav-tab"        data-page="chat"      onclick="navigate('chat')">Chat</button>
      <button class="nav-tab"        data-page="dashboard" onclick="navigate('dashboard')">Dashboard</button>
    </div>
    <div class="nav-actions">
      <div class="nav-status" id="nav-status">
        <div class="nav-status-dot" id="nav-dot"></div>
        <span id="nav-status-text">Loading…</span>
      </div>
    </div>
  </nav>

  <!-- HOME PAGE -->
  <div class="page active" id="page-home">
    <div class="home-hero">
      <div class="home-hero-badge">🚀 Enterprise AI Platform</div>
      <h1>Universal <span>AI Agent</span></h1>
      <p>One agent. Any domain. Any application.<br/>Configure once, plug in anywhere.</p>
      <div class="hero-actions">
        <button class="btn btn-primary" onclick="navigate('chat')">💬 Start Chatting</button>
        <button class="btn btn-secondary" onclick="navigate('dashboard')">📊 View Dashboard</button>
      </div>
    </div>

    <div class="stats-row">
      <div class="stat-card purple"><div class="num" id="h-total">—</div><div class="lbl">Registered Agents</div></div>
      <div class="stat-card green"> <div class="num" id="h-online">—</div><div class="lbl">Online</div></div>
      <div class="stat-card red">   <div class="num" id="h-locked">—</div><div class="lbl">Locked</div></div>
      <div class="stat-card blue">  <div class="num" id="h-sessions">—</div><div class="lbl">Active Sessions</div></div>
    </div>

    <div class="section-header">
      <div>
        <div class="section-title">Agent Control Panel</div>
        <div class="section-sub">Lock or unlock each agent independently to protect API tokens</div>
      </div>
      <div style="display:flex;gap:8px">
        <button class="btn btn-secondary btn-sm global-lock-btn" onclick="onGlobal('unlock-all')">🔓 Unlock All</button>
        <button class="btn btn-danger btn-sm global-lock-btn"    onclick="onGlobal('lock-all')">🔒 Lock All</button>
      </div>
    </div>

    <div class="agents-grid" id="home-agents-grid">
      <div style="color:var(--text3);font-size:13px;padding:20px">
        <div class="spinner"></div>
      </div>
    </div>
  </div>

  <!-- CHAT PAGE -->
  <div class="page" id="page-chat">
    <div class="chat-wrap">
      <div class="chat-sidebar">
        <div class="chat-sidebar-header">
          <div class="chat-sidebar-title">Agents</div>
        </div>
        <div class="agent-list" id="agent-list">
          <div style="padding:16px;color:var(--text3);font-size:13px"><div class="spinner"></div></div>
        </div>
      </div>
      <div class="chat-main">
        <div class="chat-topbar">
          <div class="chat-agent-info">
            <div class="chat-agent-icon" id="chat-agent-icon">🤖</div>
            <div>
              <div class="chat-agent-name" id="chat-agent-name">Select an agent</div>
              <div class="chat-agent-sub"  id="chat-agent-sub">—</div>
            </div>
            <span id="chat-status-pill"></span>
          </div>
          <div class="chat-topbar-actions">
            <div id="chat-topbar-lock"></div>
          </div>
        </div>
        <div id="chat-locked-bar" class="chat-locked-bar">
          🔒 This agent is locked — no LLM calls are being made. Unlock it to resume chatting.
        </div>
        <div class="chat-messages" id="chat-messages">
          <div class="empty-state">
            <div class="big-icon">💬</div>
            <h3>Pick an agent to start</h3>
            <p>Select an agent from the sidebar to begin a conversation.</p>
          </div>
        </div>
        <div class="chat-input-area">
          <div class="chat-input-row">
            <textarea id="chatInput" rows="1" placeholder="Select an agent first…"></textarea>
            <button class="chat-send-btn" id="chatSend" disabled onclick="handleSend()">↑</button>
          </div>
        </div>
      </div>
    </div>
  </div>

  <!-- DASHBOARD PAGE -->
  <div class="page" id="page-dashboard">
    <div class="dashboard-wrap">
      <div class="dashboard-title">Agent Dashboard</div>
      <div class="dashboard-sub">Monitor all registered agents, lock individually, or control all at once.</div>

      <div class="dash-stats">
        <div class="dash-stat total">   <div class="num" id="d-total">—</div>   <div class="lbl">Registered</div></div>
        <div class="dash-stat online">  <div class="num" id="d-online">—</div>  <div class="lbl">Online</div></div>
        <div class="dash-stat locked">  <div class="num" id="d-locked">—</div>  <div class="lbl">Locked</div></div>
        <div class="dash-stat sessions"><div class="num" id="d-sessions">—</div><div class="lbl">Sessions</div></div>
      </div>

      <div class="dash-toolbar">
        <div class="dash-toolbar-left">
          Managing <strong id="d-total-txt">—</strong> agents.
          <span id="d-refreshed" style="margin-left:10px;color:var(--text3)"></span>
        </div>
        <div class="dash-toolbar-right">
          <button class="btn btn-ghost btn-sm global-lock-btn" onclick="renderDashboard()">⟳ Refresh</button>
          <button class="btn btn-secondary btn-sm global-lock-btn" onclick="onGlobal('unlock-all')">🔓 Unlock All</button>
          <button class="btn btn-danger   btn-sm global-lock-btn" onclick="onGlobal('lock-all')">🔒 Lock All</button>
        </div>
      </div>

      <div class="dash-grid" id="dash-grid">
        <div style="color:var(--text3);font-size:13px;padding:20px"><div class="spinner"></div></div>
      </div>
    </div>
  </div>
  `;

  toastContainer = document.getElementById('toasts');
}

// ── Nav status updater ────────────────────────────────────────────────────────
async function updateNavStatus() {
  try {
    const data = await fetchAgents();
    state.agents = data.agents;
    const dot  = document.getElementById('nav-dot');
    const txt  = document.getElementById('nav-status-text');
    const online = data.online;
    const locked = data.locked;
    dot.className = `nav-status-dot${online > 0 ? ' online' : ''}`;
    txt.textContent = `${online}/${data.total} online${locked > 0 ? ` · ${locked} locked` : ''}`;
  } catch (_) { /* silently ignore nav status errors */ }
}

// ── Chat input auto-resize ────────────────────────────────────────────────────
function setupChatInput() {
  const inp = document.getElementById('chatInput');
  if (!inp) return;
  inp.addEventListener('input', () => {
    inp.style.height = 'auto';
    inp.style.height = `${Math.min(inp.scrollHeight, 120)}px`;
  });
  inp.addEventListener('keydown', e => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  });
}

// Expose navigate/handleSend globally for inline onclick
globalThis.navigate       = navigate;
globalThis.handleSend     = handleSend;
globalThis.renderDashboard = renderDashboard;

// ── Init ───────────────────────────────────────────────────────────────────────
buildApp();
setupChatInput();
navigate('home');
updateNavStatus();
setInterval(updateNavStatus, 15000);
