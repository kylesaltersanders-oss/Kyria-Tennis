// Stand-in for the dashboard runtime: read-only, fed from data.json.
(async () => {
  const showError = () => { document.querySelector('.tb-take').textContent = 'Could not load the latest data. Try refreshing.'; };
  let D;
  try { D = await (await fetch('data.json?t=' + Date.now(), { cache: 'no-store' })).json(); } catch (e) { showError(); return; }
  const sets = { bookings: D.bookings, sessions: D.sessions, weather: D.weather };
  const calcs = {}; let params = {}; let render = () => {};
  const dark = matchMedia('(prefers-color-scheme: dark)').matches;
  window.dash = {
    colors: dark ? ['#7fa8e8', '#e58fb0', '#6fc2a8', '#d9b45b', '#b39ddb', '#e8976b', '#8fc2d9', '#a8b86b'] : ['#2f62b5', '#b83d73', '#1f8a6b', '#a87f14', '#6b4fa8', '#c2602a', '#2b83a6', '#6b7f22'],
    calc(id, c) { calcs[id] = c; },
    data(id) {
      const get = (k) => k in sets ? sets[k] : (sets[k] = calcs[k].fn(...calcs[k].inputs.map(get)));
      return { status: 'ok', data: get(id) };
    },
    onData(fn) { render = fn; fn(); },
    params: () => params,
    setParams(p) { params = { ...params, ...p }; render(); },
  };
  const snap = (rows) => ({ docs: rows.map(([id, v]) => ({ id, data: () => v })) });
  const coll = { matches: D.matches.map((m) => [m.id, m]),
    yields: D.yields.map((y) => [y.date, y]),
    partners: Object.entries(D.partners).map(([k, p]) => [k, { partner: p }]),
    ash_confirmations: Object.entries(D.confirmations).map(([k, c]) => [k, { sent_at: c.sent, confirmed_at: c.confirmed }]) };
  window.claude = { use: async (n) => n === 'db'
    ? { collection: (c) => ({ onSnapshot: (cb) => cb(snap(coll[c] || [])) }) }
    : { canEdit: async () => false } };
  const s = document.createElement('script'); s.src = 'app.js?t=' + Date.now();
  s.onload = () => {
    const u = document.getElementById('site-updated');
    if (u) u.textContent = 'Read-only copy. Last updated ' + new Date(D.updated).toLocaleString('en-AU', { timeZone: 'Australia/Sydney', weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' }) + ' Sydney time.';
    let t; addEventListener('resize', () => { clearTimeout(t); t = setTimeout(() => render(), 150); });
  };
  s.onerror = showError; document.body.append(s);
})();
