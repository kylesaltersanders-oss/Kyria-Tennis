
(() => {
  const WHO = ['Kyle', 'Giga', 'Ash'];
  const sydToday = () => {
    try { return new Intl.DateTimeFormat('en-CA', { timeZone: 'Australia/Sydney', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date()); }
    catch (e) { return d3.utcFormat('%Y-%m-%d')(new Date(Date.now() + 11 * 3600 * 1000)); }
  };

  dash.calc('all_bookings', {
    inputs: ['bookings', 'sessions'],
    title: 'All bookings',
    description: 'Kyle and Giga\'s Arc bookings together with Ash\'s sessions.',
    fn: (bookings, sessions) => bookings.concat(sessions),
  });

  dash.calc('monthly', {
    inputs: ['all_bookings'],
    title: 'Monthly totals per person',
    description: 'Confirmed bookings and hours per person per month; unconfirmed counted separately.',
    fn: (bookings) => {
      const m = (t) => { const [h, mm] = String(t).split(':').map(Number); return h * 60 + mm; };
      const out = new Map();
      const months = new Set(bookings.map((b) => String(b.date).slice(0, 7)));
      for (const month of months) for (const who of ['Kyle', 'Giga', 'Ash']) out.set(month + '|' + who, { month, who, bookings: 0, hours: 0, tentative: 0 });
      for (const b of bookings) {
        const r = out.get(String(b.date).slice(0, 7) + '|' + b.who);
        if (!r) continue;
        if (b.status === 'Confirmed') { r.bookings += 1; r.hours += (m(b.end) - m(b.start)) / 60; }
        else if (b.status === 'Tentative') r.tentative += 1;
      }
      return [...out.values()].map((r) => ({ ...r, hours: Math.round(r.hours * 10) / 10 }));
    },
  });

  dash.calc('by_venue', {
    inputs: ['all_bookings'],
    title: 'Hours by venue',
    description: 'Confirmed hours per person per venue per month.',
    fn: (bookings) => {
      const m = (t) => { const [h, mm] = String(t).split(':').map(Number); return h * 60 + mm; };
      const out = new Map();
      for (const b of bookings) {
        if (b.status !== 'Confirmed') continue;
        const month = String(b.date).slice(0, 7);
        const k = month + '|' + b.venue + '|' + b.who;
        const r = out.get(k) || { month, venue: b.venue, who: b.who, hours: 0 };
        r.hours += (m(b.end) - m(b.start)) / 60; out.set(k, r);
      }
      return [...out.values()].map((r) => ({ ...r, hours: Math.round(r.hours * 10) / 10 }));
    },
  });

  dash.calc('by_type', {
    inputs: ['all_bookings'],
    title: 'Bookings by session type',
    description: 'Confirmed bookings per session type per month, one column per person.',
    fn: (bookings) => {
      const out = new Map();
      for (const b of bookings) {
        if (b.status !== 'Confirmed') continue;
        const month = String(b.date).slice(0, 7);
        const k = month + '|' + b.type;
        const r = out.get(k) || { month, type: b.type, kyle: 0, giga: 0, ash: 0 };
        if (b.who === 'Kyle') r.kyle += 1; else if (b.who === 'Giga') r.giga += 1; else if (b.who === 'Ash') r.ash += 1;
        out.set(k, r);
      }
      return [...out.values()];
    },
  });

  dash.calc('weather_days', {
    inputs: ['weather'],
    title: 'Daily weather flags',
    description: 'Per day at UNSW Kensington: forecast high and low, and a flag from the forecast wording: rain or storms, showers, or wind.',
    fn: (weather) => weather.map((w) => {
      const s = String(w.summary || '');
      const flag = /rain|storm|thunder/i.test(s) ? 'Rain likely' : /shower/i.test(s) ? 'Showers' : /wind/i.test(s) ? 'Windy' : '';
      return { date: String(w.date).slice(0, 10), max_c: Number(w.max_c), min_c: Number(w.min_c), summary: s, flag };
    }).sort((a, b) => a.date.localeCompare(b.date)),
  });

  const monthSel = document.getElementById('tb-month');
  const whoSel = document.getElementById('tb-who');
  const q = document.getElementById('tb-q');
  const tip = document.getElementById('tb-tip');
  const monthName = (ym) => d3.utcFormat('%B %Y')(new Date(ym + '-01T00:00:00Z'));
  const fmtDay = d3.utcFormat('%a %-d %b');
  const fmtNum = d3.format(',');

  monthSel.addEventListener('change', () => dash.setParams({ month: monthSel.value }));
  whoSel.addEventListener('change', () => dash.setParams({ who: whoSel.value }));
  q.addEventListener('input', () => drawList());

  const setMark = (el, month, who) => el.setAttribute('data-where', 'month=' + month + '&who=' + who);
  const showTip = (html, x, y) => {
    tip.replaceChildren(...html);
    tip.style.display = 'block';
    const root = tip.offsetParent || document.body;
    const rb = root.getBoundingClientRect();
    const w = tip.offsetWidth;
    let left = x - rb.left + 12; if (left + w > rb.width) left = x - rb.left - w - 12;
    tip.style.left = Math.max(0, left) + 'px';
    tip.style.top = (y - rb.top + 12) + 'px';
  };
  const hideTip = () => { tip.style.display = 'none'; };
  const tipRows = (head, rows) => {
    const h = document.createElement('div'); h.className = 'tt-h'; h.textContent = head;
    return [h, ...rows.map(([c, name, v]) => {
      const r = document.createElement('div'); r.className = 'tt-r';
      const s = document.createElement('i'); s.className = 'tb-swatch'; s.style.background = c;
      const t = document.createElement('span'); t.textContent = name + ': ' + v;
      r.append(s, t); return r;
    })];
  };
  const failLine = (el) => { const d = document.createElement('div'); d.className = 'tb-fail'; d.textContent = 'Failed to load'; el.replaceChildren(d); };

  const colorOf = (w) => w === 'Kyle' ? dash.colors[0] : w === 'Ash' ? dash.colors[1] : dash.colors[2];
  const isOther = (r) => /\(Wren\)/.test(String(r.title || ''));
  const rowColor = (r) => isOther(r) ? dash.colors[3] : colorOf(r.who);

  // Outside matches typed on the page, kept in the dashboard's database: matches/<id> = {date, start, end, court, partner, who, booked}
  let manual = [];
  let extDb = null;
  let extReady = false;
  let canWrite = true;
  const extPending = new Set();
  const reDate = /^\d{4}-\d{2}-\d{2}$/, reTime = /^\d{2}:\d{2}$/;
  const cleanMatch = (id, v) => {
    if (!v || !reDate.test(String(v.date)) || !reTime.test(String(v.start))) return null;
    const end = reTime.test(String(v.end)) ? String(v.end) : String(v.start);
    return {
      id, date: String(v.date), start: String(v.start), end,
      court: typeof v.court === 'string' ? v.court.slice(0, 60) : '',
      partner: typeof v.partner === 'string' ? v.partner.slice(0, 60) : '',
      who: WHO.includes(v.who) ? v.who : 'Kyle',
      booked: v.booked === true,
      created_at: typeof v.created_at === 'string' ? v.created_at : '',
    };
  };
  (async () => {
    try {
      const db = await claude.use('db');
      if (!db) { extUnavailable(); return; }
      extDb = db.collection('matches');
      if (canWrite && fx.form.hidden) fx.open.hidden = false;
      extDb.onSnapshot((snap) => {
        manual = snap.docs.map((d) => cleanMatch(d.id, d.data())).filter(Boolean);
        extReady = true;
        refreshMonths();
        drawExtList();
        if (!editing) redrawPartners();
      }, () => { extReady = true; drawExtList(); });
    } catch (e) { extDb = null; extUnavailable(); }
    try {
      const u = await claude.use('user');
      if (u) { canWrite = (await u.canEdit()) !== false; applyWriteGate(); }
    } catch (e) {}
  })();
  // Heads-up days set by Claude, kept in the dashboard's database: yields/<YYYY-MM-DD> = {date, note}
  const yields = new Map();
  (async () => {
    try {
      const db = await claude.use('db');
      if (!db) return;
      db.collection('yields').onSnapshot((snap) => {
        yields.clear();
        for (const d of snap.docs) {
          const v = d.data();
          if (v && reDate.test(String(v.date))) yields.set(String(v.date), typeof v.note === 'string' ? v.note.slice(0, 200) : '');
        }
        refreshMonths();
      }, () => {});
    } catch (e) {}
  })();
  // Partners typed on the page, kept in the dashboard's database: partners/<booking id> = {partner, at}
  let partnerDb = null;
  const written = new Map();
  let editing = null;
  (async () => {
    try {
      const db = await claude.use('db');
      if (!db) return;
      partnerDb = db.collection('partners');
      partnerDb.onSnapshot((snap) => {
        written.clear();
        for (const d of snap.docs) { const v = d.data(); if (v && typeof v.partner === 'string') written.set(d.id, v.partner); }
        if (!editing) redrawPartners();
      }, () => {});
      redrawPartners();
    } catch (e) { partnerDb = null; }
  })();
  const partnerOf = (r) => written.has(r.id) ? written.get(r.id) : (r.partner || '');
  const savePartner = async (id, value) => {
    const v = String(value || '').trim().slice(0, 60);
    written.set(id, v);
    if (partnerDb) { try { await partnerDb.doc(id).set({ partner: v, at: new Date().toISOString() }); } catch (e) {} }
  };
  const partnerEditor = (r, onDone) => {
    const inp = document.createElement('input');
    inp.className = 'tb-pt-in'; inp.type = 'text'; inp.setAttribute('list', 'tb-partners');
    inp.placeholder = 'Hitting partner'; inp.value = partnerOf(r); inp.setAttribute('aria-label', 'Hitting partner');
    let done = false;
    const finish = async (save) => {
      if (done) return; done = true;
      if (save && inp.value.trim() !== partnerOf(r)) await savePartner(r.id, inp.value);
      editing = null; onDone();
    };
    inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); finish(true); } if (e.key === 'Escape') finish(false); });
    inp.addEventListener('blur', () => finish(true));
    return inp;
  };
  // Ash's text status, written by the hourly confirmations task: ash_confirmations/<booking id> = {sent_at, confirmed_at?, reply?}
  const ashTexts = new Map();
  (async () => {
    try {
      const db = await claude.use('db');
      if (!db) return;
      db.collection('ash_confirmations').onSnapshot((snap) => {
        ashTexts.clear();
        for (const d of snap.docs) { const v = d.data(); if (v && v.sent_at) ashTexts.set(d.id, v); }
        if (!editing) redrawPartners();
      }, () => {});
    } catch (e) {}
  })();
  const smsWhen = (t) => { const d = new Date(t); return isNaN(d) ? '' : d.toLocaleString('en-AU', { timeZone: 'Australia/Sydney', weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' }); };
  const smsBadges = (r) => {
    const v = ashTexts.get(r.id);
    const p = partnerOf(r).trim().toLowerCase();
    if (!v || !(r.who === 'Ash' ? p === 'kyle' : p === 'ash')) return null;
    const box = document.createElement('div'); box.className = 'tb-sms';
    const sent = document.createElement('span'); sent.className = 'ok'; sent.textContent = '✓ Text sent'; 
    const conf = document.createElement('span');
    if (v.confirmed_at) { conf.className = 'ok'; conf.textContent = '✓ Ash confirmed'; }
    else { conf.className = 'wait'; conf.textContent = 'Awaiting reply'; conf.title = 'Ash has not confirmed yet'; }
    box.append(sent, conf);
    return box;
  };
  const partnerPill = (r, onEdit) => {
    const p = partnerOf(r);
    const btn = document.createElement('button');
    btn.type = 'button';
    if (!p) { btn.className = 'tb-pt add'; btn.textContent = 'no partner'; }
    else { btn.className = 'tb-pt ' + (r.status === 'Confirmed' ? 'conf' : 'tent'); btn.textContent = r.status === 'Confirmed' ? 'with ' + p : p + '?'; }
        btn.disabled = true;
    btn.addEventListener('click', onEdit);
    const quick = r.who === 'Ash' ? 'Kyle' : (r.who === 'Kyle' || r.who === 'Giga') ? 'Ash' : '';
    return btn;
    const wrap = document.createElement('span');
    const qb = document.createElement('button');
    qb.type = 'button'; qb.className = 'tb-pt add tb-pt-quick'; qb.textContent = '+ ' + quick;
    qb.title = 'Confirm ' + quick + ' as the hitting partner';
    qb.disabled = !partnerDb;
    qb.addEventListener('click', async () => { qb.disabled = true; await savePartner(r.id, quick); redrawPartners(); });
    wrap.append(btn, document.createTextNode(' '), qb);
    return wrap;
  };
  function redrawPartners() {
    const names = new Set();
    for (const r of lastBookings) { const p = partnerOf(r); if (p) names.add(p); }
    for (const m of manual) if (m.partner) names.add(m.partner);
    const dl = document.getElementById('tb-partners');
    dl.replaceChildren(...[...names].sort().map((n) => { const o = document.createElement('option'); o.value = n; return o; }));
    const courts = new Set(['UNSW David Phillips', 'Heffron', 'Mutch Park', 'Moore Park', 'Centennial Park']);
    for (const m of manual) if (m.court) courts.add(m.court);
    document.getElementById('tb-courts').replaceChildren(...[...courts].sort().map((n) => { const o = document.createElement('option'); o.value = n; return o; }));
    const calEl = document.getElementById('cal');
    if (curMonth && lastBookings.length) { drawCal(calEl); drawList(); drawGaps(); }
  }
  let wxByDate = new Map();
  const wxClass = (f) => f === 'Rain likely' ? 'rain' : f === 'Showers' ? 'showers' : f === 'Windy' ? 'wind' : '';
  function drawGaps() {
    const today = sydToday();
    for (const [w, p] of [['Kyle', 'k'], ['Giga', 'g'], ['Ash', 'm']]) {
      const hits = lastBookings.filter((r) => r.who === w && r.type === 'Hit' && r.status === 'Confirmed' && r.date >= today);
      const open = hits.filter((r) => !partnerOf(r)).length;
      const big = document.getElementById('np-' + p), sub = document.getElementById('np-' + p + '-sub');
      if (!big) continue;
      big.textContent = lastBookings.length ? String(open) : '—';
      if (lastBookings.length) big.classList.remove('dash-skeleton');
      sub.textContent = hits.length ? 'of ' + hits.length + ' upcoming hits' : 'No upcoming hits';
    }
  }
  let lastBookings = [];
  let curMonth = null;

  function drawList() {
    const tbody = document.querySelector('#list-table tbody');
    const who = 'Both';
    const term = q.value.trim().toLowerCase();
    const rows = lastBookings
      .filter((b) => String(b.date).slice(0, 7) === curMonth)
      .filter((b) => who === 'Both' || b.who === who)
      .filter((b) => !term || [b.title, partnerOf(b), b.venue, b.type, b.who, b.status].join(' ').toLowerCase().includes(term))
      .sort((a, b) => (a.date + a.start).localeCompare(b.date + b.start));
    tbody.replaceChildren(...rows.map((b) => {
      const tr = document.createElement('tr'); tr.dataset.key = b.id;
      const cells = [b.date, b.start, b.end, b.who, b.title, b.partner, b.venue, b.type, b.status];
      cells.forEach((v, i) => {
        const td = document.createElement('td');
        if (i === 5) {
          if (b.status === 'Duplicate') { tr.append(td); return; }
          td.replaceChildren(partnerPill(b, () => { editing = b.id; const inp = partnerEditor(b, () => redrawPartners()); td.replaceChildren(inp); inp.focus(); }));
          const sb = smsBadges(b); if (sb) td.append(sb);
          tr.append(td); return;
        }
        if (i === 2 || i === 6 || i === 7) td.className = 'tb-hide-narrow';
        if (i === 3) { const s = document.createElement('i'); s.className = 'tb-swatch'; s.style.background = rowColor(b); s.style.marginRight = '6px'; td.append(s); }
        if (i === 8) {
          const p = document.createElement('span'); p.className = 'tb-pill' + (v === 'Tentative' ? ' tent' : v === 'Duplicate' ? ' dup' : ''); p.textContent = v; td.append(p);
        } else td.append(document.createTextNode(v));
        tr.append(td);
      });
      return tr;
    }));
  }

  function drawCal(el) {
    const who = 'Both';
    const start = new Date(curMonth + '-01T00:00:00Z');
    const today = sydToday();
    const days = d3.utcDays(start, d3.utcMonth.offset(start, 1)).filter((d) => d3.utcFormat('%Y-%m-%d')(d) >= today);
    if (!days.length) { const p = document.createElement('div'); p.className = 'tb-note'; p.style.gridColumn = '1 / -1'; p.textContent = 'All the days in this month have passed.'; el.replaceChildren(p); return; }
    const first = lastBookings.length ? d3.min(lastBookings, (r) => r.date) : '';
    const iso = d3.utcFormat('%Y-%m-%d');
    const byDay = d3.group(lastBookings.filter((r) => who === 'Both' || r.who === who), (r) => r.date);
    const extByDay = d3.group(manual.filter((m) => who === 'Both' || m.who === who), (m) => m.date);
    const nodes = [];
    ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].forEach((d) => { const h = document.createElement('div'); h.className = 'tb-dow'; h.textContent = d; nodes.push(h); });
    const lead = (days[0].getUTCDay() + 6) % 7;
    for (let i = 0; i < lead; i++) { const c = document.createElement('div'); c.className = 'tb-day blank'; nodes.push(c); }
    for (const d of days) {
      const key = iso(d);
      const list = (byDay.get(key) || []).slice().sort((a, c) => (a.start + a.who).localeCompare(c.start + c.who));
      const exts = extByDay.get(key) || [];
      const cell = document.createElement('div');
      cell.className = 'tb-day' + (key === today ? ' today' : '') + (key < first ? ' before' : key < today ? ' past' : '') + (list.length || exts.length ? '' : ' none') + (yields.has(key) ? ' yield' : '');
      const h = document.createElement('div'); h.className = 'tb-day-h';
      const num = document.createElement('b'); num.textContent = String(d.getUTCDate());
      const wd = document.createElement('span'); wd.className = 'wd'; wd.textContent = fmtDay(d);
      const cnt = document.createElement('span');
      const n = list.filter((r) => r.status === 'Confirmed').length;
      cnt.textContent = n ? n + (n === 1 ? ' booking' : ' bookings') : '';
      const right = document.createElement('span'); right.className = 'tb-day-r'; right.append(cnt);
      if (extDb && canWrite) {
        const add = document.createElement('button');
        add.type = 'button'; add.className = 'tb-day-add'; add.textContent = '+';
        add.title = 'Add an outside match on ' + fmtDay(d); add.setAttribute('aria-label', add.title);
        add.addEventListener('click', () => openForm(null, key));
        right.append(add);
      }
      const wx = wxByDate.get(key);
      h.append(num, wd, right);
      if (wx && wx.flag) { const t = document.createElement('span'); t.className = 'tb-day-wx ' + wxClass(wx.flag); t.textContent = wx.flag; num.append(t); }
      if (yields.has(key)) {
        const y = document.createElement('span'); y.className = 'tb-day-yield'; y.textContent = '🔻';
        const note = yields.get(key) || 'Heads-up for this day';
        y.title = note; y.setAttribute('role', 'img'); y.setAttribute('aria-label', 'Heads-up: ' + note);
        num.append(y);
      }
      cell.append(h);
      const items = [...list.map((r) => ({ s: r.start + r.who, r })), ...exts.map((m) => ({ s: m.start + m.who + '~', m }))].sort((a, c) => a.s.localeCompare(c.s));
      for (const it of items) {
        if (it.m) { cell.append(extEntry(it.m)); continue; }
        const r = it.r;
        const bk = document.createElement('div');
        bk.className = 'tb-bk' + (r.status === 'Tentative' ? ' tent' : r.status === 'Duplicate' ? ' dup' : '');
        bk.style.borderLeftColor = rowColor(r);
        const tm = document.createElement('span'); tm.className = 'tm'; tm.textContent = r.start;
        const tl = document.createElement('span'); tl.className = 'tl'; tl.textContent = r.title + (r.who !== 'Kyle' && !isOther(r) ? ' (' + r.who + ')' : '');
        bk.append(tm, tl);
        if (r.status !== 'Duplicate') {
          const br = document.createElement('div');
          br.replaceChildren(partnerPill(r, () => {
            editing = r.id;
            const inp = partnerEditor(r, () => redrawPartners());
            br.replaceChildren(inp); inp.focus();
          }));
          bk.append(br);
          const sb = smsBadges(r); if (sb) bk.append(sb);
        }
        cell.append(bk);
      }
      nodes.push(cell);
    }
    el.replaceChildren(...nodes);
  }

  // ---- Outside matches ----
  const fx = {
    card: document.getElementById('outside'), form: document.getElementById('ext-form'), open: document.getElementById('ext-open'), note: document.getElementById('ext-note'),
    date: document.getElementById('ext-date'), start: document.getElementById('ext-start'), end: document.getElementById('ext-end'), who: document.getElementById('ext-who'),
    court: document.getElementById('ext-court'), partner: document.getElementById('ext-partner'), seg: document.getElementById('ext-booked'),
    msg: document.getElementById('ext-msg'), save: document.getElementById('ext-save'), cancel: document.getElementById('ext-cancel'), del: document.getElementById('ext-del'),
  };
  let formId = null, formBooked = false, delArmed = false;
  const toMin = (t) => { const [h, mm] = String(t).split(':').map(Number); return h * 60 + mm; };
  const fromMin = (x) => String(Math.floor(x / 60)).padStart(2, '0') + ':' + String(x % 60).padStart(2, '0');
  const canChange = () => !!extDb && canWrite;

  function allMonths() {
    const nowM = sydToday().slice(0, 7);
    const s = new Set(lastBookings.map((r) => String(r.date).slice(0, 7)));
    for (const m of manual) { const mm = m.date.slice(0, 7); if (mm >= nowM) s.add(mm); }
    return [...s].sort();
  }
  function refreshMonths() {
    const months = allMonths();
    if (!months.length) return;
    monthSel.replaceChildren(...months.map((m) => new Option(monthName(m), m)));
    if (curMonth && months.includes(curMonth)) monthSel.value = curMonth;
  }
  function extUnavailable() {
    fx.open.hidden = true; fx.form.hidden = true;
    fx.note.textContent = "Adding outside matches isn't available in this view.";
    drawExtList();
  }
  function applyWriteGate() {
    if (!canWrite) {
      fx.open.hidden = true; fx.form.hidden = true;
      fx.note.textContent = "Matches booked outside the UNSW courts.";
    } else if (extDb && fx.form.hidden) fx.open.hidden = false;
    drawExtList();
    if (!editing) redrawPartners();
  }

  function statusPill(m) {
    const b = document.createElement('button'); b.type = 'button';
    b.className = 'tb-st ' + (m.booked ? 'yes' : 'no');
    b.textContent = m.booked ? 'Booked' : 'Not booked';
    const can = canChange() && !extPending.has(m.id);
    b.disabled = !can;
    if (can) b.title = m.booked ? 'Tap to mark as not booked' : 'Tap once you have booked the court';
    b.addEventListener('click', () => toggleBooked(m));
    return b;
  }
  async function toggleBooked(m) {
    if (!canChange() || extPending.has(m.id)) return;
    extPending.add(m.id);
    try { await extDb.doc(m.id).update({ booked: !m.booked, updated_at: new Date().toISOString() }); }
    catch (e) { /* the stored value stays as it was */ }
    finally { extPending.delete(m.id); drawExtList(); if (!editing) redrawPartners(); }
  }
  function extEntry(m) {
    const bk = document.createElement('div');
    bk.className = 'tb-bk ext';
    bk.style.borderLeftColor = colorOf(m.who);
    const tm = document.createElement('span'); tm.className = 'tm'; tm.textContent = m.start;
    const tl = document.createElement('button'); tl.type = 'button'; tl.className = 'tl-btn';
    tl.textContent = (m.court || 'Court TBC') + (m.who === 'Giga' ? ' (Giga)' : '');
    tl.disabled = !canChange();
    if (canChange()) tl.title = 'Edit this match';
    tl.addEventListener('click', () => openForm(m));
    bk.append(tm, tl);
    const row = document.createElement('div'); row.className = 'tb-ext-row';
    if (m.partner) { const p = document.createElement('span'); p.className = 'tb-pt ' + (m.booked ? 'conf' : 'tent'); p.textContent = 'with ' + m.partner; row.append(p); }
    row.append(statusPill(m));
    bk.append(row);
    return bk;
  }
  function drawExtList() {
    const ul = document.getElementById('ext-list');
    if (!extDb || !extReady) { ul.replaceChildren(); return; }
    const who = 'Both';
    const today = sydToday();
    const rows = manual.filter((m) => m.date >= today && (who === 'Both' || m.who === who))
      .sort((a, c) => (a.date + a.start).localeCompare(c.date + c.start));
    if (!rows.length) {
      const li = document.createElement('li'); li.className = 'empty';
      li.textContent = 'No upcoming outside matches' + (who !== 'Both' ? ' for ' + who : '') + '.';
      ul.replaceChildren(li); return;
    }
    ul.replaceChildren(...rows.map((m) => {
      const li = document.createElement('li');
      const d = document.createElement('span'); d.className = 'd';
      const s = document.createElement('i'); s.className = 'tb-swatch'; s.style.background = colorOf(m.who);
      d.append(s, document.createTextNode(fmtDay(new Date(m.date + 'T00:00:00Z'))));
      const t = document.createElement('span'); t.className = 't'; t.textContent = m.start + ' to ' + m.end;
      const c = document.createElement('span'); c.className = 'grow';
      const v = document.createElement('span'); v.className = 'v'; v.textContent = m.partner ? ' with ' + m.partner : ', no partner yet';
      c.append(document.createTextNode(m.court || 'Court TBC'), v);
      li.append(d, t, c, statusPill(m));
      if (canChange()) {
        const e = document.createElement('button'); e.type = 'button'; e.className = 'tb-link'; e.textContent = 'Edit';
        e.addEventListener('click', () => openForm(m));
        li.append(e);
      }
      return li;
    }));
  }

  function setBooked(v) {
    formBooked = v;
    fx.seg.querySelectorAll('button[data-v]').forEach((b) => b.setAttribute('aria-pressed', String((b.dataset.v === 'yes') === v)));
  }
  function showMsg(text, bad) { fx.msg.textContent = text || ''; fx.msg.hidden = !text; fx.msg.classList.toggle('bad', !!bad); }
  function clashText() {
    const date = fx.date.value, s = fx.start.value, e = fx.end.value, who = fx.who.value;
    if (!reDate.test(date) || !reTime.test(s)) return '';
    const a = toMin(s), b = reTime.test(e) && toMin(e) > a ? toMin(e) : a + 60;
    const notes = [];
    for (const r of lastBookings) {
      if (r.who !== who || r.date !== date || !(r.status === 'Confirmed' || r.status === 'Tentative')) continue;
      if (toMin(r.start) < b && toMin(r.end) > a) notes.push('Overlaps the ' + r.title + ' booking, ' + r.start + ' to ' + r.end + '.');
    }
    for (const m of manual) {
      if (m.id === formId || m.who !== who || m.date !== date) continue;
      if (toMin(m.start) < b && Math.max(toMin(m.end), toMin(m.start) + 1) > a) notes.push('Overlaps your outside match at ' + (m.court || 'Court TBC') + ', ' + m.start + ' to ' + m.end + '.');
    }
    return notes.join(' ');
  }
  const checkClash = () => showMsg(clashText(), false);
  function openForm(m, date) {
    if (!canChange()) return;
    formId = m ? m.id : null; delArmed = false;
    fx.date.value = m ? m.date : (date || sydToday());
    fx.start.value = m ? m.start : '';
    fx.end.value = m ? m.end : '';
    fx.who.value = m ? m.who : (dash.params().who === 'Giga' ? 'Giga' : 'Kyle');
    fx.court.value = m ? m.court : '';
    fx.partner.value = m ? m.partner : '';
    setBooked(m ? m.booked : false);
    fx.save.textContent = m ? 'Save changes' : 'Save match';
    fx.del.hidden = !m; fx.del.textContent = 'Delete';
    fx.form.hidden = false; fx.open.hidden = true;
    checkClash();
    fx.card.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    (m ? fx.court : fx.start).focus({ preventScroll: true });
  }
  function closeForm() {
    formId = null; delArmed = false;
    fx.form.hidden = true; fx.open.hidden = !canChange();
    showMsg('');
  }
  fx.open.addEventListener('click', () => openForm(null));
  fx.cancel.addEventListener('click', closeForm);
  fx.form.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeForm(); });
  fx.seg.addEventListener('click', (e) => { const b = e.target.closest('button[data-v]'); if (b) setBooked(b.dataset.v === 'yes'); });
  fx.start.addEventListener('change', () => {
    const s = fx.start.value;
    if (reTime.test(s) && (!reTime.test(fx.end.value) || toMin(fx.end.value) <= toMin(s))) fx.end.value = fromMin(Math.min(toMin(s) + 60, 23 * 60 + 55));
    checkClash();
  });
  [fx.end, fx.date, fx.who].forEach((el) => el.addEventListener('change', checkClash));
  fx.save.addEventListener('click', async () => {
    if (!canChange()) return;
    const date = fx.date.value, start = fx.start.value;
    let end = fx.end.value;
    if (!reDate.test(date) || !fx.date.validity.valid) { showMsg('Pick a date.', true); fx.date.focus(); return; }
    if (!reTime.test(start)) { showMsg('Add a start time.', true); fx.start.focus(); return; }
    if (!reTime.test(end)) end = fromMin(Math.min(toMin(start) + 60, 23 * 60 + 55));
    if (toMin(end) <= toMin(start)) { showMsg('The end time needs to be after the start.', true); fx.end.focus(); return; }
    const now = new Date().toISOString();
    const prev = formId ? manual.find((m) => m.id === formId) : null;
    const data = {
      date, start, end,
      court: fx.court.value.trim().slice(0, 60),
      partner: fx.partner.value.trim().slice(0, 60),
      who: WHO.includes(fx.who.value) ? fx.who.value : 'Kyle',
      booked: formBooked,
      created_at: (prev && prev.created_at) || now,
      updated_at: now,
    };
    fx.save.disabled = true;
    try {
      if (formId) await extDb.doc(formId).set(data); else await extDb.add(data);
      closeForm();
      if (date >= sydToday() && date.slice(0, 7) !== curMonth) dash.setParams({ month: date.slice(0, 7) });
    } catch (e) {
      const code = e && e.code;
      showMsg(code === 'invalid_argument' ? "Couldn't save: only the dashboard's editors can add matches."
        : code === 'quota_exceeded' ? "Couldn't save: the dashboard's storage is full. Delete some old matches first."
        : "Couldn't save just now. Try again in a moment.", true);
    } finally { fx.save.disabled = false; }
  });
  fx.del.addEventListener('click', async () => {
    if (!canChange() || !formId) return;
    if (!delArmed) { delArmed = true; fx.del.textContent = 'Tap again to delete'; return; }
    fx.del.disabled = true;
    try { await extDb.doc(formId).delete(); closeForm(); }
    catch (e) { showMsg("Couldn't delete just now. Try again in a moment.", true); }
    finally { fx.del.disabled = false; }
  });

  function drawVenue(el, rows, month) {
    const data = rows.filter((r) => r.month === month);
    const venues = [...d3.rollup(data, (v) => d3.sum(v, (r) => r.hours), (r) => r.venue)].sort((a, b) => b[1] - a[1]).map((d) => d[0]);
    if (!venues.length) { const p = document.createElement('div'); p.className = 'tb-note'; p.textContent = 'No confirmed sessions this month.'; el.replaceChildren(p); return; }
    const W = Math.max(280, el.clientWidth);
    const rowH = 48; const H = venues.length * rowH + 24;
    const get = (v, w) => (data.find((r) => r.venue === v && r.who === w) || {}).hours || 0;
    const svg = d3.create('svg').attr('width', '100%').attr('viewBox', `0 0 ${W} ${H}`).attr('height', H);
    const probe = svg.append('text').attr('font-size', 'var(--cds-font-size-caption)');
    document.body.appendChild(svg.node());
    let labW = 0; for (const v of venues) { probe.text(v); labW = Math.max(labW, probe.node().getComputedTextLength()); }
    probe.text('00.0 h'); const valW = probe.node().getComputedTextLength();
    probe.remove(); svg.node().remove();
    const m = { l: Math.max(labW, 110) + 10, r: valW + 10, t: 4 };
    const maxH = d3.max(data, (r) => r.hours) || 1;
    const x = d3.scaleLinear([0, maxH], [m.l, W - m.r]);
    const y = d3.scaleBand(venues, [m.t, H - 20]).paddingInner(0.3);
    const yi = d3.scaleBand(WHO, [0, y.bandwidth()]).padding(0.1);
    svg.append('g').selectAll('text').data(venues).join('text')
      .attr('x', m.l - 10).attr('y', (v) => y(v) + y.bandwidth() / 2).attr('dy', '0.32em').attr('text-anchor', 'end')
      .attr('fill', 'var(--color-fg)').attr('font-size', 'var(--cds-font-size-caption)').text((v) => v);
    const bars = [];
    for (const v of venues) for (const w of WHO) bars.push({ v, w, h: get(v, w), c: colorOf(w) });
    const g = svg.append('g');
    g.selectAll('rect').data(bars.filter((b) => b.h > 0)).join('rect')
      .attr('x', m.l).attr('y', (b) => y(b.v) + yi(b.w)).attr('height', yi.bandwidth()).attr('width', (b) => Math.max(2, x(b.h) - m.l))
      .attr('rx', 3).attr('fill', (b) => b.c)
      .on('mousemove', (ev, b) => showTip(tipRows(b.v, WHO.map((w) => [colorOf(w), w, get(b.v, w) + ' h'])), ev.clientX, ev.clientY))
      .on('mouseleave', hideTip);
    g.selectAll('text').data(bars.filter((b) => b.h > 0)).join('text')
      .attr('x', (b) => Math.max(m.l + 2, x(b.h)) + 4).attr('y', (b) => y(b.v) + yi(b.w) + yi.bandwidth() / 2).attr('dy', '0.32em')
      .attr('fill', 'var(--color-fg-muted)').attr('font-size', 'var(--cds-font-size-caption)').text((b) => b.h + ' h');
    el.replaceChildren(svg.node());
  }

  dash.onData(() => {
    document.querySelectorAll('.sw-k').forEach((s) => { s.style.background = colorOf('Kyle'); });
    document.querySelectorAll('.sw-g').forEach((s) => { s.style.background = colorOf('Giga'); });
    document.querySelectorAll('.sw-m').forEach((s) => { s.style.background = colorOf('Ash'); });
    document.querySelectorAll('.sw-z').forEach((s) => { s.style.background = dash.colors[3]; });

    const b = dash.data('all_bookings');
    const ok = b.status === 'ok';
    lastBookings = ok ? b.data.filter((r) => WHO.includes(r.who)) : [];
    const months = allMonths();
    if (ok && months.length && !months.includes(dash.params().month)) {
      const now = sydToday().slice(0, 7);
      dash.setParams({ month: months.includes(now) ? now : months[months.length - 1] });
      return;
    }
    curMonth = dash.params().month;
    monthSel.replaceChildren(...months.map((m) => new Option(monthName(m), m)));
    if (curMonth) monthSel.value = curMonth;
    whoSel.value = 'Both';
    drawExtList();

    const nudge = document.getElementById('tb-nudge');
    const today0 = sydToday();
    const laterMonths = ok && curMonth ? [...new Set([
      ...lastBookings.filter((r) => r.status === 'Confirmed' && String(r.date) >= today0).map((r) => String(r.date).slice(0, 7)),
      ...manual.filter((m) => m.date >= today0).map((m) => m.date.slice(0, 7))
    ])].filter((m) => m > curMonth).sort() : [];
    if (laterMonths.length) {
      const nm2 = laterMonths[0];
      document.getElementById('tb-nudge-text').textContent = monthName(nm2) + ' has bookings too.';
      const nb = document.getElementById('tb-nudge-btn');
      nb.textContent = 'View ' + monthName(nm2);
      nb.onclick = () => dash.setParams({ month: nm2 });
      nudge.hidden = false;
    } else nudge.hidden = true;

    const mon = dash.data('monthly');
    const monRows = mon.status === 'ok' ? mon.data : [];
    const rowFor = (w) => monRows.find((r) => r.month === curMonth && r.who === w);
    const nm = document.querySelector('.tb-mname');
    nm.textContent = curMonth ? monthName(curMonth) : '—';
    if (curMonth) nm.classList.remove('dash-skeleton');
    const tk = document.querySelector('.tk-k'), tg = document.querySelector('.tk-g'), tmm = document.querySelector('.tk-m');
    if (curMonth) { setMark(tk, curMonth, 'Kyle'); setMark(tg, curMonth, 'Giga'); setMark(tmm, curMonth, 'Ash'); }
    tk.textContent = rowFor('Kyle') ? fmtNum(rowFor('Kyle').bookings) : '—';
    tg.textContent = rowFor('Giga') ? fmtNum(rowFor('Giga').bookings) : '—';
    tmm.textContent = rowFor('Ash') ? fmtNum(rowFor('Ash').bookings) : '—';

    const wd = dash.data('weather_days');
    const wxRows = wd.status === 'ok' ? wd.data : [];
    wxByDate = new Map(wxRows.map((r) => [r.date, r]));
    const wl = document.getElementById('wx-list');
    const todayIso = sydToday();
    if (wd.status === 'ok') {
      const ahead = wxRows.filter((r) => r.date >= todayIso);
      const bad = ahead.filter((r) => r.flag);
      if (!bad.length) { const li = document.createElement('li'); li.textContent = ahead.length ? 'No bad weather days in the forecast.' : 'Forecast not available.'; wl.replaceChildren(li); }
      else wl.replaceChildren(...bad.map((r) => {
        const li = document.createElement('li');
        const d = document.createElement('span'); d.className = 'd'; d.textContent = fmtDay(new Date(r.date + 'T00:00:00Z'));
        const t = document.createElement('span'); t.className = 'tb-wx-tag ' + wxClass(r.flag); t.textContent = r.flag;
        const v = document.createElement('span'); v.className = 'v'; v.textContent = r.summary + ', ' + r.min_c + '° to ' + r.max_c + '°';
        li.append(d, t, v); return li;
      }));
    } else if (wd.status === 'error') failLine(wl);
    else wl.replaceChildren();
    drawGaps();

    const calEl = document.getElementById('cal');
    if (ok && curMonth && !editing) { drawCal(calEl); redrawPartners(); }
    else if (b.status === 'error') failLine(calEl);
    else if (!ok) calEl.replaceChildren();

    const vEl = document.getElementById('venue-chart');
    const vd = dash.data('by_venue');
    if (vd.status === 'ok' && curMonth) drawVenue(vEl, vd.data, curMonth);
    else if (vd.status === 'error' || b.status === 'error') failLine(vEl);
    else vEl.replaceChildren();

    const tt = document.querySelector('#type-table tbody');
    const td = dash.data('by_type');
    const tRows = td.status === 'ok' ? td.data.filter((r) => r.month === curMonth).sort((a, c) => (c.kyle + c.giga + c.ash) - (a.kyle + a.giga + a.ash)) : [];
    tt.replaceChildren(...tRows.map((r) => {
      const tr = document.createElement('tr'); tr.dataset.key = r.month + ',' + r.type;
      const a = document.createElement('td'); a.textContent = r.type;
      const k = document.createElement('td'); k.className = 'num'; k.textContent = String(r.kyle);
      const gg = document.createElement('td'); gg.className = 'num'; gg.textContent = String(r.giga);
      const mm2 = document.createElement('td'); mm2.className = 'num'; mm2.textContent = String(r.ash);
      tr.append(a, k, gg, mm2); return tr;
    }));

    if (!editing) drawList();
  });
})();
