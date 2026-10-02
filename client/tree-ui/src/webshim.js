// Implement Tauri-style invokes for rsrs web.
// Install window.__TAURI__.core.invoke only in the browser environment.
// Forward invokes to POST /api/invoke on the CLI's embedded HTTP server.
// The server uses the same command mapping as the native shell; native Tauri is unchanged.
//
// Non-local web bindings require an access token.
// Save the initial token URL parameter and attach X-respire-Token to subsequent requests.
// Sending the header is harmless for local bindings that do not require it.
const ACCESS_TOKEN = (() => {
  try {
    const m = new URLSearchParams(location.search).get('token');
    if (m) { sessionStorage.setItem('respire-web-token', m); return m; }
    return sessionStorage.getItem('respire-web-token') || '';
  } catch { return ''; }
})();

if (!window.__TAURI__?.core?.invoke) {
  window.__TAURI__ = {
    core: {
      invoke: async (cmd, args = {}) => {
        let resp;
        try {
          const headers = { 'Content-Type': 'application/json' };
          if (ACCESS_TOKEN) headers['X-respire-Token'] = ACCESS_TOKEN;
          resp = await fetch('/api/invoke', {
            method: 'POST',
            headers,
            body: JSON.stringify({ cmd, args }),
          });
        } catch (e) {
          throw new Error(`无法连接本地 respire 服务（请确认 rsrs web 正在运行）：${e}`);
        }
        const text = await resp.text();
        let data = null;
        try { data = text ? JSON.parse(text) : null; } catch { /* The response is not JSON. */ }
        if (!resp.ok) {
          const msg = data && typeof data.error === 'string' ? data.error : `HTTP ${resp.status}`;
          throw new Error(msg);
        }
        return data;
      },
    },
  };
}
