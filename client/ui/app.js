// Vanilla JavaScript client; no frontend build step is required here.
// Invoke the Rust shell through window.__TAURI__.core.invoke; guide locked sessions through account setup.

const { invoke } = window.__TAURI__.core;

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const shortId = (s) => String(s || "").slice(0, 8);

let unlocked = false;
let mode = "recent"; // recent | search | tree
let lastResults = []; // Cache search and recent results for the detail view.

// Infrastructure.

function toast(msg, cls = "") {
  const el = document.createElement("div");
  el.className = `toast ${cls}`;
  el.textContent = msg;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 3200);
}

async function api(cmd, args = {}) {
  try {
    return await invoke(cmd, args);
  } catch (e) {
    const msg = typeof e === "string" ? e : (e?.message ?? JSON.stringify(e));
    toast(msg, "err");
    throw new Error(msg);
  }
}

// Navigation.

document.querySelectorAll("nav button[data-p]").forEach((b) => {
  b.onclick = () => {
    document.querySelectorAll("nav button").forEach((x) => x.classList.remove("on"));
    b.classList.add("on");
    document.querySelectorAll(".pane").forEach((p) => p.classList.remove("on"));
    $("p-" + b.dataset.p).classList.add("on");
    if (b.dataset.p === "tools") renderAcct();
    if (b.dataset.p === "inject") renderInject();
    if (b.dataset.p === "book") renderBook();
  };
});

// Startup.

async function boot() {
  const st = await api("lock_state");
  applySession(st.session);
  if (st.unlocked) {
    unlocked = true;
    await refreshStatus();
    loadRecent();
  } else {
    // Try unlocking the existing session; otherwise show account setup.
    try {
      const r = await api("unlock");
      unlocked = true;
      applySession(r.session);
      await refreshStatus();
      loadRecent();
    } catch {
      renderAcct(); // The account page also provides initial setup.
      document.querySelector('button[data-p="tools"]').click();
    }
  }
}

function applySession(si) {
  $("navUser").textContent = si.has_session ? (si.user || "本地模式") : "未注册";
}

async function refreshStatus() {
  const st = await api("status");
  $("navStat").innerHTML = `记忆 <b>${st.local_alive}</b> 条<br>${st.remote_configured ? "云端已配" : "仅本地"}`;
  return st;
}

// Memory browser.

$("q").addEventListener("keydown", (e) => { if (e.key === "Enter") doSearch(); });

async function loadRecent() {
  mode = "recent";
  const items = await api("list", { limit: 30 });
  lastResults = items.map((e) => ({ score: null, entry: e }));
  renderList();
}

async function doSearch() {
  const q = $("q").value.trim();
  const kind = $("kindFilter").value || null;
  if (!q && !kind) return loadRecent();
  mode = "search";
  const items = await api("search", { q: q || "全部", limit: 30, kind });
  lastResults = items;
  renderList();
}

function renderList() {
  const el = $("viewList");
  $("viewDetail").innerHTML = "";
  if (!lastResults.length) {
    el.innerHTML = `<div class="card c" style="color:var(--dim)">无记忆——右下「记一条」开笔</div>`;
    return;
  }
  el.innerHTML = lastResults.map((it, i) => {
    const m = it.entry;
    return `<div class="card" onclick="openDetail(${i})" style="cursor:pointer">
      <div class="t">${esc(m.title || "(无标题)")} <span class="chip k-${m.kind}">${m.kind}</span>
        ${it.score != null ? `<span class="score">${(it.score * 100).toFixed(0)}%</span>` : ""}</div>
      <div class="m"><span>#${shortId(m.id)}</span><span>${esc((m.tags || []).join(" · "))}</span><span>${esc((m.created_at || "").slice(0, 10))}</span>${m.parent_id ? "<span>有因</span>" : ""}</div>
      <div class="c">${esc(truncate(m.content, 160))}</div>
    </div>`;
  }).join("");
}

const truncate = (s, n) => (s || "").length > n ? s.slice(0, n) + "…" : (s || "");

// Tree view.

async function showTree() {
  mode = "tree";
  $("viewDetail").innerHTML = "";
  const cure = await api("tree_cure", { top: 40 });
  const big = cure.roots.filter((r) => r.descendants > 0).length;
  window._cures = cure.suggests;
  const cureHtml = cure.suggests.length ? `
    <div class="card" style="border-color:var(--warn)">
      <div class="t">🩺 树形整理 · ${cure.lone_roots} 条散记可归纲
        <button class="btn pri" style="padding:4px 14px" onclick="cureAll()">⚡ 全部归纲（${cure.suggests.length} 条）</button>
        <button class="btn" style="padding:4px 14px" onclick="deepenAll()">🌳 构建子纲（大树加深）</button>
      </div>
      <div style="margin-top:8px">${cure.suggests.slice(0, 8).map((s) => `
        <div class="cand" style="display:flex;align-items:center;gap:8px">
          <span style="flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(s.orphan.title)}</span>
          <span style="color:var(--dim);font-size:12px">→ ${esc(s.target_tree.title || s.target.title)}</span>
          <button class="btn" style="padding:2px 10px" onclick="cureAttach('${s.orphan.id}','${s.target.id}')">归纲</button>
        </div>`).join("")}
        ${cure.suggests.length > 8 ? `<div class="m" style="margin-top:6px;color:var(--dim)">…另 ${cure.suggests.length - 8} 条，点「全部归纲」一并处理</div>` : ""}
      </div>
    </div>` : "";
  $("viewList").innerHTML = `${cureHtml}
    <div class="card"><div class="m" style="margin-bottom:8px">因果树 · 成树 ${big} 棵（按规模排序，徽章=子树条数）· 散记 ${cure.lone_roots} 条</div>
    <div id="bigTrees" class="tree">${cure.roots.filter((r) => r.descendants > 0).slice(0, 30).map((r) => rootShell(r)).join("")}</div>
    ${cure.lone_roots ? `<div class="m" style="margin-top:10px"><a href="#" onclick="toggleLone();return false" style="color:var(--dim)">▾ 另有 ${cure.lone_roots} 条散记（不成树）</a></div><div id="loneRoots" class="tree hidden">${cure.roots.filter((r) => r.descendants === 0).slice(0, 60).map((r) => loneLine(r)).join("")}</div>` : ""}
  </div>`;
}

function rootShell(r) {
  return `<div data-root="${esc(r.id)}" data-loaded="0">
    <div class="node d0" data-id="${esc(r.id)}" title="${esc(r.title)}" onclick="rootClick(this,'${esc(r.id)}')">
      <span class="twisty">▸</span><span class="nt">${esc(r.title)}</span><span class="bdg">${r.descendants}</span>
    </div>
    <div class="kids hidden"></div>
  </div>`;
}

function loneLine(r) {
  return `<div class="node d3" data-id="${esc(r.id)}" title="${esc(r.title)}" onclick="nodeClick(this,'${esc(r.id)}')">
    <span class="leafdot">·</span><span class="nt">${esc(r.title)}</span>
  </div>`;
}

function toggleLone() {
  $("loneRoots").classList.toggle("hidden");
}

async function rootClick(el, id) {
  document.querySelectorAll(".node.sel").forEach((x) => x.classList.remove("sel"));
  el.classList.add("sel");
  const shell = el.parentElement;
  const kidsBox = shell.querySelector(".kids");
  const tw = el.querySelector(".twisty");
  if (!shell.dataset.loaded || shell.dataset.loaded === "0") {
    try {
      const nodes = await api("tree", { from: id, depth: 3 });
      const node = nodes[0];
      kidsBox.innerHTML = node && node.children.length
        ? node.children.map((c) => renderNode(c, 1)).join("")
        : `<div class="node d2" style="color:var(--dim)">（无子条）</div>`;
      shell.dataset.loaded = "1";
    } catch { kidsBox.innerHTML = `<div class="node d2" style="color:var(--dim)">（展开失败）</div>`; }
  }
  kidsBox.classList.toggle("hidden");
  if (tw) tw.textContent = kidsBox.classList.contains("hidden") ? "▸" : "▾";
  openDetailById(id);
}

async function cureAttach(orphan, target) {
  await api("attach", { id: orphan, parent: target });
  toast("已归纲", "ok");
  showTree();
}

async function deepenAll() {
  if (!confirm("把平铺大根的子条按语义聚成主题子纲（根→子纲→条目三层）？子纲题暂用簇内长题，可后改。")) return;
  const r = await api("tree_deepen", { min: 0.55 });
  if (!r.roots.length) { toast("没有平铺大根可深化", ""); return; }
  const brief = r.roots.map((x) => `${x.root}：建 ${x.built} 迁 ${x.moved}`).join("；");
  toast(`深化完成——${brief}`, "ok");
  showTree();
}

async function cureAll() {
  const list = window._cures || [];
  if (!list.length) return;
  let ok = 0, fail = 0;
  for (const s of list) {
    try {
      await api("attach", { id: s.orphan.id, parent: s.target.id });
      ok++;
    } catch {
      fail++;
    }
  }
  toast(`全部归纲完成：成功 ${ok}${fail ? `，失败 ${fail}` : ""}`, fail ? "err" : "ok");
  showTree();
}

function renderNode(n, depth = 0) {
  const twisty = n.children.length ? `<span class="twisty">▾</span>` : n.descendants > 0 ? `<span class="twisty" title="更深层已折叠">▸</span>` : `<span class="leafdot">·</span>`;
  const short = n.title.length > 26 ? n.title.slice(0, 26) + "…" : n.title;
  const badge = n.descendants > 0 ? `<span class="bdg" title="子树共 ${n.descendants} 条">${n.descendants}</span>` : "";
  return `<div>
    <div class="node d${Math.min(depth, 3)}" data-id="${esc(n.id)}" title="${esc(n.title)}" onclick="nodeClick(this,'${esc(n.id)}')">
      ${twisty}<span class="nt">${esc(short)}</span><span class="chip k-${n.kind}">${n.kind}</span>${badge}
    </div>
    ${n.children.length ? `<div class="kids ${depth >= 1 ? "hidden" : ""}">${n.children.map((c) => renderNode(c, depth + 1)).join("")}</div>` : ""}
  </div>`;
}

function nodeClick(el, id) {
  const kids = el.nextElementSibling;
  if (kids) {
    kids.classList.toggle("hidden");
    const tw = el.querySelector(".twisty");
    if (tw) tw.textContent = kids.classList.contains("hidden") ? "▸" : "▾";
  }
  document.querySelectorAll(".node.sel").forEach((x) => x.classList.remove("sel"));
  el.classList.add("sel");
  openDetailById(id);
}

// Details.

async function openDetail(i) {
  const it = lastResults[i];
  await renderDetail(it.entry.id);
}

async function openDetailById(id) {
  await renderDetail(id);
}

let detailId = null;
async function renderDetail(id) {
  const d = await api("show", { id });
  detailId = d.entry.id;
  const anc = d.ancestors.length ? `<div class="detail-anc">🔺因链：${d.ancestors.map((a) => esc(a.title)).join(" ← ")}</div>` : "";
  const kids = d.children.length ? `<div class="detail-anc">🔻果 ${d.children.length}：${d.children.map((c) => esc(c.title)).join("、")}</div>` : "";
  $("viewDetail").innerHTML = `<div class="card">
    ${anc}${kids}
    <div class="t">${esc(d.entry.title || "(无标题)")} <span class="chip k-${d.entry.kind}">${d.entry.kind}</span></div>
    <div class="m"><span>#${shortId(d.entry.id)}</span><span>${esc((d.entry.tags || []).join(" · "))}</span>
      <span>${esc((d.entry.created_at || "").slice(0, 16).replace("T", " "))}</span>
      ${d.entry.project ? `<span>📁${esc(d.entry.project)}</span>` : ""}</div>
    <div class="c">${esc(d.entry.content)}</div>
    <div class="row" style="margin:10px 0 0">
      <button class="btn" onclick="dlgView.close();openEdit('${esc(d.entry.id)}')">编辑</button>
      <button class="btn danger" onclick="del('${esc(d.entry.id)}')">删除</button>
      <button class="btn" onclick="editParent('${esc(d.entry.id)}')">挂为果（选因）</button>
      ${d.entry.parent_id ? `<button class="btn" onclick="promote('${esc(d.entry.id)}')">上浮一级</button>` : ""}
    </div>
  </div>`;
  $("viewList").querySelectorAll(".card").forEach((c) => (c.style.outline = ""));
}

async function del(id) {
  if (!confirm("删除该条？（tombstone 软删，随同步传播）")) return;
  await api("delete", { id });
  toast("已删", "ok");
  $("viewDetail").innerHTML = "";
  mode === "tree" ? showTree() : doSearch();
}

async function promote(id) {
  await api("promote", { id });
  toast("已上浮一级", "ok");
  renderDetail(id);
}

// Create and edit.

let editId = null;
function openCreate() {
  editId = null;
  $("dlgTitle").textContent = "记一条";
  $("fTitle").value = ""; $("fTags").value = ""; $("fProject").value = "";
  $("fContent").value = ""; $("fKind").value = "context";
  $("candArea").style.display = "none";
  $("dlgSave").textContent = "存入";
  $("dlg").showModal();
}

async function openEdit(id) {
  const d = await api("show", { id });
  const m = d.entry;
  editId = id;
  $("dlgTitle").textContent = `编辑 #${shortId(id)}`;
  $("fTitle").value = m.title; $("fTags").value = (m.tags || []).join(",");
  $("fProject").value = m.project || ""; $("fContent").value = m.content;
  $("fKind").value = m.kind;
  $("candArea").style.display = "none";
  $("dlgSave").textContent = "保存";
  $("dlg").showModal();
}

// Debounce candidate checks by 300 ms once new content is long enough.
let candTimer = null;
$("fContent").addEventListener("input", () => {
  if (editId) return;
  clearTimeout(candTimer);
  candTimer = setTimeout(checkCandidates, 300);
});

async function checkCandidates() {
  const content = $("fContent").value.trim();
  if (content.length < 8) { $("candArea").style.display = "none"; return; }
  try {
    const r = await api("candidates", { content });
    const area = $("candArea");
    if (!r.merge.length && !r.parent.length) {
      area.style.display = "none";
      $("dlgSave").dataset.mode = "force";
      $("dlgSave").textContent = "存入（新条）";
      return;
    }
    area.style.display = "block";
    let html = "";
    if (r.merge.length) {
      html += `<div style="color:var(--warn);margin-bottom:4px">⚠️ 发现 ${r.merge.length} 条高相似——建议合并为一条：</div>`;
      r.merge.forEach((c, i) => {
        html += `<div class="cand"><b>${(c.score * 100).toFixed(0)}%</b> ${esc(c.entry.title || "(无标题)")}
          <span style="color:var(--dim)">#${shortId(c.entry.id)}</span>
          <button class="btn" style="padding:2px 10px;margin-left:6px" onclick="chooseMerge(${i})">并入此条链</button></div>`;
      });
    }
    if (r.parent.length) {
      html += `<div style="color:var(--dim);margin-top:6px">可选因节点（下挂为果）：</div>`;
      r.parent.forEach((c, i) => {
        html += `<div class="cand">${esc(c.entry.title || "(无标题)")} <span style="color:var(--dim)">#${shortId(c.entry.id)} · ${(c.score * 100).toFixed(0)}%</span>
          <button class="btn" style="padding:2px 10px;margin-left:6px" onclick="chooseParent(${i})">挂其下</button></div>`;
      });
    }
    html += `<div style="margin-top:6px;color:var(--dim)">或确为新条，直接存。</div>`;
    $("dlgSave").dataset.mode = "force";
    $("dlgSave").textContent = "仍作新条存入";
    area.innerHTML = html;
    window._cands = r;
  } catch { /* Keep candidate lookup quiet while the session is locked. */ }
}

function chooseMerge(i) {
  const c = window._cands.merge[i];
  invokeSave({ mergeIds: [c.entry.id] });
}

function chooseParent(i) {
  const c = window._cands.parent[i];
  invokeSave({ parent: c.entry.id });
}

$("dlgSave").onclick = () => invokeSave({});

async function invokeSave(extra) {
  const content = $("fContent").value.trim();
  if (!content) return toast("内容为空", "err");
  const base = {
    title: $("fTitle").value.trim() || null,
    kind: $("fKind").value,
    tags: $("fTags").value.trim() || null,
    project: $("fProject").value.trim() || null,
  };
  if (editId) {
    await api("update", { id: editId, ...base });
    toast("已保存", "ok");
    $("dlg").close();
    renderDetail(editId);
  } else {
    const entry = await api("create", {
      content, ...base,
      parent: extra.parent ?? null,
      mergeIds: extra.mergeIds ?? null,
      force: true, // The candidate panel already records the user's decision; persist the selected operation directly.
    });
    toast(`已存 #${shortId(entry.id)}`, "ok");
    $("dlg").close();
    loadRecent();
  }
}

async function editParent(id) {
  const p = prompt("挂为谁的果？输入父条 id 前缀（8 位）");
  if (!p) return;
  await api("attach", { id, parent: p.trim() });
  toast("已挂链", "ok");
  renderDetail(id);
}

// Account and synchronization.

async function renderAcct() {
  const st = await api("lock_state");
  applySession(st.session);
  const si = st.session;
  let cfgAddr = "";
  try {
    cfgAddr = (await api("server_addr_get")).addr || "";
  } catch (e) {
    console.warn("server_addr_get 不可用", e);
  }
  const addrVal = esc(cfgAddr);
  const conn = si.has_token
    ? `<span style="color:var(--ok)">已连接</span> —— 记忆自动加密备份，服务器只存密文`
    : `<span style="color:var(--warn)">未连接</span> —— 记忆只存在本机，可点「立即同步」或重新登录`;
  const tail = (si.secret_masked || "").split("…").pop();
  $("acctCard").innerHTML = si.has_session ? `
    <div class="kv">
      <div><b>云同步</b> ${conn}<br><span class="sub">账号 <b>${esc(si.user)}</b> · 服务器 ${esc(si.addr || "—")}</span></div>
      <div><b>记忆恢复密钥</b> 已保存在本机（尾号 ${esc(tail || "****")}）
        <button class="btn" style="padding:2px 10px" onclick="revealSecret()">查看并备份</button>
        <br><span class="sub">换电脑、重装系统时，靠它找回全部记忆。建议抄在纸上收好——弄丢了谁也帮不了你找回。</span></div>
      <div><b>换新电脑</b>
        <button class="btn" style="padding:2px 10px" onclick="showFive()">复制迁移授权码</button>
        <br><span class="sub">点这里复制一段授权文本，在新电脑的 respire 客户端里粘贴，记忆就跟着过去了。</span></div>
      <div><b>服务器地址</b> <input type="text" id="cfgAddr" value="${addrVal}" style="width:240px;vertical-align:middle">
        <button class="btn" style="padding:2px 10px" onclick="saveAddr()">保存</button>
        <br><span class="sub">注册/登录时默认填这个地址。用官方服务器就不用管；自己搭了服务器才需要改。</span></div>
    </div>` : `
    <div class="c" style="color:var(--dim);margin-bottom:10px">第一次用？注册一个账号，你的记忆就能加密备份到云端、跨设备同步。已有账号直接登录。</div>
    <div class="frm" style="max-width:560px">
      <label>服务器</label><input type="text" id="aAddr" value="${addrVal}" placeholder="留空使用 CLI 配置；默认 API https://api.rsrs.rs">
      <label>用户名</label><input type="text" id="aUser">
      <label>密码</label><input type="password" id="aPass">
    </div>
    <div class="row" style="margin-top:12px">
      <button class="btn pri" onclick="doRegister()">注册</button>
      <button class="btn" onclick="doLogin()">登录</button>
      <button class="btn" onclick="doKeygen()">不用服务器，只存本机</button>
    </div>`;
  // Synchronization card.
  let syncHtml = "";
  try {
    const s = await api("status");
    let autoOn = true;
    try { autoOn = (await api("server_addr_get")).autosync; } catch (e) { console.warn("server_addr_get 不可用", e); }
    syncHtml = `<div class="kv">
      <div><b>本地记忆</b> ${s.local_alive} 条</div>
      <div><b>云端备份</b> ${s.remote_configured ? "已连接，与本地双向同步" : "未连接（记忆只存本机）"}</div>
      <div><b>最近一次写入</b> ${esc((s.max_updated_at || "—").replace("T", " ").slice(0, 19))}</div>
    </div>`;
    let cureOn = true;
    try { cureOn = (await api("cure_config_get")).cure_auto; } catch (e) { console.warn("cure_config_get 不可用", e); }
    syncHtml += `
    <div class="row" style="margin-top:8px">
      <label style="font-size:13px"><input type="checkbox" id="autoSync" ${autoOn ? "checked" : ""} onchange="toggleAutosync(this.checked)"> 存完自动备份</label>
      <button class="btn pri" onclick="doSync()" ${s.remote_configured ? "" : "disabled"}>立即同步</button>
      <span style="color:var(--dim);font-size:12px">勾上=存一条同步一条；不勾=点「立即同步」才备份。</span>
    </div>
    <div class="row" style="margin-top:6px">
      <label style="font-size:13px"><input type="checkbox" id="cureAuto" ${cureOn ? "checked" : ""} onchange="toggleCureAuto(this.checked)"> 定期自动归纲</label>
      <span style="color:var(--dim);font-size:12px">每 10 分钟把散记挂到 ≥50% 相似的主题树下（后台静默，可关）。</span>
    </div>`;
  } catch (e) {
    syncHtml = `<div class="c" style="color:var(--dim)">记忆库未解锁——完成账号步骤后自动就绪。</div>`;
  }
  $("syncCard").innerHTML = syncHtml;
}

async function doRegister() {
  const addr = $("aAddr").value.trim(), user = $("aUser").value.trim(), pass = $("aPass").value;
  if (!user || !pass) return toast("用户名/密码须齐备（服务器留空即用官方）", "err");
  const r = await api("register", { addr: addr || null, user, pass });
  if (addr) await api("server_addr_set", { addr });
  toast("注册成功，云同步已开启", "ok");
  alert(`恢复密钥（Account Secret），务必离线备份：\n\n${r.secret}\n\n此密钥是你全部记忆的解密权柄，服务器不存不见。`);
  await relock();
}

async function doLogin() {
  const addr = $("aAddr").value.trim(), user = $("aUser").value.trim(), pass = $("aPass").value;
  if (!user || !pass) return toast("用户名/密码须齐备（服务器留空即用官方或本机记录）", "err");
  await api("login", { addr: addr || null, user, pass });
  if (addr) await api("server_addr_set", { addr });
  toast("登录成功，记忆已接上", "ok");
  await relock();
}

async function saveAddr() {
  const addr = $("cfgAddr").value.trim();
  await api("server_addr_set", { addr });
  toast("服务器地址已保存", "ok");
  renderAcct();
}

async function toggleAutosync(on) {
  await api("sync_config_set", { autosync: on });
  toast(on ? "已开自动同步（写后即推）" : "已关自动同步（手动模式）", "ok");
}

async function installCli() {
  $("cliOut").textContent = "安装中（npm install -g @rsrsai/cli）…";
  try {
    const r = await api("cli_install");
    $("cliOut").textContent = r.action === "already" ? "✓ CLI 已在 PATH" : "✅ CLI 已安装";
    toast($("cliOut").textContent, "ok");
  } catch (e) {
    $("cliOut").textContent = `✗ ${e.message || e}`;
  }
}

async function doKeygen() {
  const pass = $("aPass")?.value || prompt("设置本机主密码（加密本地记忆）");
  if (!pass) return;
  await api("keygen", { pass });
  toast("好了，记忆只存在这台电脑上", "ok");
  await relock();
}

async function relock() {
  const r = await api("unlock");
  unlocked = true;
  applySession(r.session);
  await refreshStatus();
  renderAcct();
  loadRecent();
}

async function revealSecret() {
  if (!confirm("这是你的记忆恢复密钥——换电脑、重装系统时靠它找回全部记忆。\n\n只在本机显示，任何服务器都看不到它。现在查看？")) return;
  const r = await api("session_secret", { reveal: true });
  alert(`记忆恢复密钥（建议抄在纸上收好）：\n\n${r.secret}\n\n⚠️ 别发给任何人、别存进聊天记录。丢了它，谁也帮不了你找回记忆。`);
}

async function showFive() {
  const k = await api("session_five_keys");
  const txt = Object.entries(k).map(([a, b]) => `${a.toUpperCase()}=${b}`).join("\n");
  await navigator.clipboard.writeText(txt).catch(() => {});
  alert(`迁移授权码已复制到剪贴板！\n\n用法：在新电脑装好 respire 客户端 → 账号页 → 粘贴这段内容。\n\n⚠️ 它等同你的密码，只该经私密渠道传给另一台你自己的电脑。`);
}

async function toggleCureAuto(on) {
  await api("cure_config_set", { on });
  toast(on ? "定期自动归纲已开（每 10 分钟）" : "定期自动归纲已关", "ok");
}

async function doSync() {
  const s = await api("sync");
  toast(s.converged
    ? `同步收敛：拉 ${s.pulled}，推 ${s.pushed}`
    : `对账未收敛（拉 ${s.pulled} 推 ${s.pushed}）——重复同步至一致`, s.converged ? "ok" : "err");
  renderAcct();
}

// Context injection.

async function renderInject() {
  const ts = await api("inject_targets");
  $("injectList").innerHTML = ts.map((t) => {
    const stTxt = { fresh: "已注入·最新", stale: "待更新", none: "未注入", absent: "文件不存在" }[t.state] || t.state;
    const stCls = { fresh: "st-fresh", stale: "st-stale", none: "st-none", absent: "st-absent" }[t.state] || "";
    return `<div class="card">
      <div class="t">${esc(t.name)}
        <span class="chip">${t.mode === "inject" ? "覆盖式" : t.mode === "reference" ? "引用式" : "块嵌式"}</span>
        ${t.likely_installed ? `<span class="chip" style="color:var(--ok)">已检测</span>` : `<span class="chip">未检测到</span>`}
        <span style="flex:1"></span>
        <span class="${stCls}">${stTxt}</span>
      </div>
      <div class="m">📄 ${esc(t.path)}</div>
      <div class="row" style="margin:0">
        <button class="btn pri" style="padding:5px 14px" onclick="doInject('${t.id}')">注入 / 更新</button>
        <button class="btn danger" style="padding:5px 14px" onclick="doInjectRm('${t.id}')">卸载</button>
      </div>
    </div>`;
  }).join("");
}

async function doInject(id) {
  const r = await api("inject", { id });
  toast(r.changed ? "已注入（写入完成）" : "已是最新，无需写入", "ok");
  renderInject();
}

async function doInjectRm(id) {
  if (!confirm("摘除该软件中的 respire 注入块？")) return;
  const r = await api("inject_remove", { id });
  toast(r.changed ? "已摘除" : "本无注入", "ok");
  renderInject();
}

// Book and profile views.

let lastMaterial = null;

async function renderBook() {
  const cure = await api("tree_cure", { top: 20 });
  const bigs = cure.roots.filter((r) => r.descendants >= 4).slice(0, 15);
  $("bookOut").innerHTML = "";
  if (bigs.length) {
    $("bookOut").innerHTML = `<div class="card"><div class="m" style="margin-bottom:6px">可选主题树（点选填入）：</div>
      ${bigs.map((r) => `<div class="cand" style="display:flex;align-items:center;gap:8px;cursor:pointer" onclick="pickRoot('${esc(r.id)}')">
        <span style="flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(r.title)}</span>
        <span class="bdg">${r.descendants}</span><span style="color:var(--dim);font-size:11px">${esc(r.id.slice(0,8))}</span>
      </div>`).join("")}</div>`;
  }
}

function pickRoot(id) {
  $("bookRoot").value = id.slice(0, 8);
  makeBook();
}

async function makeBook() {
  const root = $("bookRoot").value.trim();
  if (!root) return toast("先填主题树根 id", "err");
  const m = await api("book_material", { root });
  lastMaterial = { data: m, name: `成书材料-${m.root.title}` };
  $("bookOut").innerHTML = `<div class="card">
    <div class="t">📖 ${esc(m.root.title)} <span class="chip">${m.total_entries} 条</span><span class="chip">${m.total_chars} 字</span></div>
    <div class="m">${m.chapters.map((c) => `${esc(c.title)}(${c.entries.length})`).join(" · ")}</div>
    <textarea readonly style="width:100%;min-height:300px;font-size:12px;margin-top:8px" id="matBox">${esc(JSON.stringify(m, null, 1))}</textarea>
    <div class="m" style="margin-top:6px;color:var(--dim)">把材料交给 AI：拟章法、叙事、取舍皆 AI 决策，成稿后可贴回平台存档。</div>
  </div>`;
}

async function makePortrait() {
  const m = await api("portrait_material", { limit: 40 });
  lastMaterial = { data: m, name: "画像材料" };
  const themes = (m.top_themes || []).map((t) => `${esc(t[0])}(${t[1]})`).join(" · ");
  $("portraitOut").innerHTML = `<div class="card">
    <div class="t">👤 画像材料 <span class="chip">${m.total_entries} 条全库</span></div>
    <div class="m">主题榜：${themes}</div>
    <textarea readonly style="width:100%;min-height:300px;font-size:12px;margin-top:8px" id="matBox">${esc(JSON.stringify(m, null, 1))}</textarea>
    <div class="m" style="margin-top:6px;color:var(--dim)">偏好/决策/情绪/技能俱在——交给 AI 拟人物画像（底色、习惯、关注、近期动态）。</div>
  </div>`;
}

async function copyOut() {
  if (!lastMaterial) return toast("先生成材料", "err");
  const text = JSON.stringify(lastMaterial.data, null, 1);
  await navigator.clipboard.writeText(text).catch(() => {});
  toast(`已复制「${lastMaterial.name}」到剪贴板`, "ok");
}

// Utilities.

async function exportJson() {
  const path = await pickSave("respire-export.json");
  if (!path) return;
  const r = await api("export_memories", { path });
  toast(`已导出 ${r.exported} 条 → ${r.path}`, "ok");
}

async function importJson() {
  const path = await pickOpen();
  if (!path) return;
  const r = await api("import_memories", { path });
  toast(`导入 ${r.imported} 条，回挂因果 ${r.reattached} 条`, "ok");
  await refreshStatus();
}

async function backupDb() {
  const path = await pickSave("onememory-backup.db");
  if (!path) return;
  const r = await api("backup_db", { path });
  toast(`已备份 → ${r.path}`, "ok");
}

async function runDefrag() {
  const r = await api("defrag", { min: 0.6, top: 15 });
  const rows = r.clusters.map((c, i) =>
    `<tr><td>${i + 1}</td><td>${c.members.map((m) => `${esc(m.title)}<span style="color:var(--dim)"> #${shortId(m.id)}</span>`).join("<br>")}</td>
     </tr>`).join("");
  $("toolOut").innerHTML = `
    <div>活跃 ${r.total} 条 ｜ 根 ${r.roots} ｜ 最大深 ${r.max_depth} ｜ 孤叶 ${r.orphans} ｜ 相似簇 ${r.clusters.length}（已归置 ${r.settled}）</div>
    ${rows ? `<table><tr><th>#</th><th>簇成员（同日同题→合并；早因晚果→下挂）</th></tr>${rows}</table>` : "✓ 阈值内无相似簇"}`;
}

async function runReembed() {
  const r = await api("reembed");
  toast(`已重算 ${r.reembedded} 条向量`, "ok");
}

// File dialogs use tauri-plugin-dialog, with manual paths as a fallback.

async function pickSave(def) {
  try {
    const p = await window.__TAURI__.core.invoke("pick_save_file", { defaultName: def });
    return p || null;
  } catch (e) {
    console.warn("文件选择框不可用", e);
    const p = prompt(`保存到（绝对路径）:`, `/home/$USER/Downloads/${def}`);
    return p?.trim() || null;
  }
}
async function pickOpen() {
  try {
    const p = await window.__TAURI__.core.invoke("pick_open_file");
    return p || null;
  } catch (e) {
    console.warn("文件选择框不可用", e);
    const p = prompt(`导入文件绝对路径:`);
    return p?.trim() || null;
  }
}

// Show a toast when background tree maintenance completes.
try {
  const { listen } = window.__TAURI__.event;
  listen("cure-done", (e) => {
    const n = e?.payload?.attached ?? 0;
    if (n > 0) {
      toast(`🩺 后台自动归纲 ${n} 条散记已入树`, "ok");
      if (mode === "tree") showTree();
    }
  });
} catch (e) { console.warn("事件监听不可用", e); }

boot();
