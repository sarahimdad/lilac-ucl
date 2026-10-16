const $ = s => document.querySelector(s);
const KEY = 'lilac-ucl-v1';
let state = { classes: [], deadlines: [], extra: [], blocks: [], clubs: [], tx: [], done: {}, outlook: [] };
try { Object.assign(state, JSON.parse(localStorage.getItem(KEY) || '{}')); } catch { /* ignore */ }
const save = () => { try { localStorage.setItem(KEY, JSON.stringify(state)); } catch { /* ignore */ } };

function confetti(n = 60) {
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const bits = ['🎉', '✨', '💜', '⭐', '🎊'];
  for (let i = 0; i < n; i++) {
    const c = el('span', 'confetti', bits[i % bits.length]);
    c.style.left = Math.random() * 100 + 'vw';
    c.style.fontSize = 14 + Math.random() * 16 + 'px';
    c.style.animationDuration = 1.6 + Math.random() * 1.8 + 's';
    c.style.animationDelay = Math.random() * 0.4 + 's';
    document.body.append(c); setTimeout(() => c.remove(), 4200);
  }
}
const hr = new Date().getHours();
$('#greet').textContent = (hr < 12 ? 'Good morning' : hr < 18 ? 'Good afternoon' : 'Good evening') + ', let\'s make this week feel lighter ✨';
function el(tag, cls, text) { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }
async function api(name, body) {
  const r = await fetch('/api/' + name, { method: 'POST', body: JSON.stringify(body) });
  const j = await r.json();
  if (!r.ok) throw new Error(j.error || r.statusText);
  return j;
}
async function withBusy(btn, fn) {
  btn.disabled = true; btn.classList.add('loading');
  try { await fn(); } catch (e) { alert('Something went wrong: ' + e.message); } finally { btn.disabled = false; btn.classList.remove('loading'); }
}

// ---------- tabs ----------
document.querySelectorAll('nav button').forEach(b => b.onclick = () => {
  document.querySelectorAll('nav button, .tab').forEach(x => x.classList.remove('active'));
  b.classList.add('active'); $('#' + b.dataset.tab).classList.add('active');
});
fetch('/api/status').then(r => r.json()).then(s => { $('#mode').textContent = s.mock ? 'mock mode (no API key)' : 'live Claude'; });

// ---------- ICS ----------
function parseICSDate(v) {
  const m = v.match(/^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})(Z)?)?$/);
  if (!m) return null;
  const [, y, mo, d, h = '0', mi = '0', s = '0', z] = m;
  const date = z ? new Date(Date.UTC(+y, mo - 1, +d, +h, +mi, +s)) : new Date(+y, mo - 1, +d, +h, +mi, +s);
  return toLocalISO(date);
}
function toLocalISO(d) { const p = n => String(n).padStart(2, '0'); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}:00`; }
function parseICS(text) {
  const lines = text.replace(/\r?\n[ \t]/g, '').split(/\r?\n/);
  const out = []; let cur = null;
  for (const line of lines) {
    if (line === 'BEGIN:VEVENT') cur = {};
    else if (line === 'END:VEVENT') { if (cur?.title && cur.start) out.push(cur); cur = null; }
    else if (cur) {
      const i = line.indexOf(':'); if (i < 0) continue;
      const key = line.slice(0, i).split(';')[0], val = line.slice(i + 1);
      if (key === 'SUMMARY') cur.title = val.replace(/\\,/g, ',');
      else if (key === 'DTSTART') cur.start = parseICSDate(val);
      else if (key === 'DTEND') cur.end = parseICSDate(val);
      else if (key === 'LOCATION') cur.where = val.replace(/\\,/g, ',');
      else if (key === 'DESCRIPTION') cur.note = val.replace(/\\n/g, ' ').replace(/\\,/g, ',');
    }
  }
  return out.map(e => ({ ...e, end: e.end || e.start }));
}
const readFile = f => new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = rej; r.readAsText(f); });

$('#ttFile').onchange = async e => { if (e.target.files[0]) { state.classes = parseICS(await readFile(e.target.files[0])); afterImport(); } };
$('#mdFile').onchange = async e => { if (e.target.files[0]) { state.deadlines = parseICS(await readFile(e.target.files[0])); afterImport(); } };
$('#ttUrl').value = state.ttUrl || '';
$('#ttSync').onclick = e => withBusy(e.target, async () => {
  const url = $('#ttUrl').value.trim(); if (!url) return;
  const { ics } = await api('ics', { url });
  state.ttUrl = url; state.classes = parseICS(ics);
  afterImport();
  if (!state.classes.length) $('#setupStatus').textContent = 'Connected, but UCL returned no events yet. Check that your modules are selected on timetable.ucl.ac.uk.';
});
$('#olUrl').value = state.olUrl || '';
$('#olSync').onclick = e => withBusy(e.target, async () => {
  const url = $('#olUrl').value.trim(); if (!url) return;
  const { ics } = await api('ics', { url });
  state.olUrl = url; state.outlook = parseICS(ics).filter(ev => new Date(ev.end || ev.start) > new Date(Date.now() - 864e5));
  afterImport(); $('#setupStatus').textContent = `Synced ${state.outlook.length} Outlook events.`;
});
$('#olFile').onchange = async e => { if (e.target.files[0]) { state.outlook = parseICS(await readFile(e.target.files[0])); afterImport(); $('#setupStatus').textContent = `Loaded ${state.outlook.length} Outlook events.`; } };
$('#loadSample').onclick = async () => {
  state.classes = parseICS(await (await fetch('/data/sample-timetable.ics')).text());
  state.deadlines = parseICS(await (await fetch('/data/sample-moodle.ics')).text());
  afterImport();
};
$('#clearAll').onclick = () => { if (confirm('Delete all saved data in this browser?')) { state = { classes: [], deadlines: [], extra: [], blocks: [], clubs: [], tx: [], done: {}, outlook: [] }; save(); renderAll(); } };
function afterImport() { state.blocks = []; save(); renderAll(); $('#setupStatus').textContent = `Loaded ${state.classes.length} classes and ${state.deadlines.length} deadlines.`; }

// ---------- week agenda ----------
const fmtDay = iso => new Date(iso).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'short' });
const fmtTime = iso => new Date(iso).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
function updateProgress() {
  const todo = [...state.blocks.map(b => 'study' + b.start + b.title), ...state.deadlines.map(d => 'deadline' + d.start + d.title)];
  const card = $('#progressCard'); card.hidden = !todo.length; if (!todo.length) return;
  const done = todo.filter(k => state.done[k]).length;
  $('#progressBar').style.width = (done / todo.length * 100) + '%';
  $('#progressText').textContent = done === todo.length ? '🎉 All done. Go celebrate!' : `${done} of ${todo.length} things done. You've got this 💪`;
  if (done === todo.length && done) confetti(90);
}
function renderAgenda() {
  const root = $('#agenda'); root.replaceChildren(); updateProgress();
  const items = [
    ...state.classes.map(e => ({ ...e, kind: 'class' })),
    ...(state.outlook || []).map(e => ({ ...e, kind: 'event' })),
    ...state.deadlines.map(e => ({ ...e, kind: 'deadline' })),
    ...state.blocks.map(e => ({ ...e, kind: 'study', note: e.why })),
  ].sort((a, b) => a.start.localeCompare(b.start));
  if (!items.length) {
    root.append(el('p', 'muted', 'Nothing yet. Paste your UCL timetable link in Setup to get started, or try the sample data.'));
    const go = el('button', 'primary', 'Go to Setup'); go.onclick = () => document.querySelector('[data-tab=setup]').click();
    root.append(go); return;
  }
  const days = {};
  items.forEach(i => (days[i.start.slice(0, 10)] ||= []).push(i));
  for (const d of Object.keys(days).sort()) {
    const box = el('div', 'day'); box.append(el('h3', null, fmtDay(d)));
    for (const i of days[d]) {
      const row = el('div', 'item ' + i.kind);
      const key = i.kind + i.start + i.title;
      if (i.kind === 'study' || i.kind === 'deadline') {
        const cb = el('input'); cb.type = 'checkbox'; cb.checked = !!state.done[key];
        row.classList.toggle('done', cb.checked);
        cb.onchange = () => { state.done[key] = cb.checked; if (!cb.checked) delete state.done[key]; save(); row.classList.toggle('done', cb.checked); if (cb.checked) confetti(24); updateProgress(); };
        row.append(cb);
      } else row.append(el('span', 'emoji', '🎓'));
      row.append(el('div', 't', i.kind === 'deadline' ? 'due ' + fmtTime(i.start) : fmtTime(i.start) + '–' + fmtTime(i.end)));
      const body = el('div'); body.append(el('div', 'title', (i.kind === 'study' ? '📚 ' : i.kind === 'deadline' ? '⏰ ' : '') + i.title));
      const sub = [i.where, i.note].filter(Boolean).join(' · '); if (sub) body.append(el('small', null, sub));
      row.append(body); box.append(row);
    }
    root.append(box);
  }
}
$('#makePlan').onclick = e => withBusy(e.target, async () => {
  const msgs = ['Reading your timetable ☕', 'Finding the free gaps 🔍', 'Protecting your evenings 🌙', 'Almost there ✨']; let mi = 0; $('#planStatus').textContent = msgs[0]; const iv = setInterval(() => $('#planStatus').textContent = msgs[++mi % msgs.length], 1400);
  let r; try { r = await api('plan', { events: [...state.classes, ...(state.outlook || [])], deadlines: state.deadlines, tasks: state.extra }); } finally { clearInterval(iv); $('#planStatus').textContent = ''; }
  state.blocks = r.blocks || []; save();
  $('#planSummary').textContent = r.summary || '';
  $('#warnings').replaceChildren(...(r.warnings || []).map(w => el('li', null, w)));
  renderAgenda(); confetti();
});

// ---------- voice ----------
const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
let rec = null;
$('#mic').onclick = () => {
  if (!SR) { $('#micStatus').textContent = 'This browser has no speech recognition. Open Lilac in Chrome or Edge, or type below (or use Windows dictation: Win+H).'; return; }
  if (rec) { rec.stop(); return; }
  rec = new SR(); rec.lang = 'en-GB'; rec.continuous = true; rec.interimResults = true;
  const base = $('#dump').value ? $('#dump').value + ' ' : '';
  let err = '';
  const reasons = { 'not-allowed': 'Mic blocked. Click the 🔒 in the address bar, allow Microphone, and try again.', 'service-not-allowed': 'Mic blocked by the browser or system settings.', 'audio-capture': 'No microphone found. Check it is plugged in and selected.', 'network': 'Speech service unreachable. Check your internet (Chrome sends audio to Google).', 'no-speech': 'Did not hear anything. Speak after the red button pulses.' };
  const step = m => { if (rec) $('#micStatus').textContent = m; };
  rec.onaudiostart = () => step('Mic is on, now speak 🎙️');
  rec.onspeechstart = () => step('Hearing you... 👂');
  rec.onspeechend = () => step('Processing...');
  rec.onnomatch = () => { err = 'Heard sound but could not turn it into words. Speak clearly and a bit closer to the mic.'; };
  rec.onresult = ev => {
    step('Got it ✅');
    $('#dump').value = base + [...ev.results].map(r => r[0].transcript).join(' ');
  };
  rec.onend = () => { rec = null; $('#mic').classList.remove('listening'); $('#mic').textContent = '🎙️ Start talking'; $('#micStatus').textContent = err; };
  rec.onerror = ev => { err = reasons[ev.error] || 'Mic error: ' + ev.error; };
  try { rec.start(); } catch (e) { rec = null; $('#micStatus').textContent = 'Could not start the mic: ' + e.message; return; }
  $('#mic').textContent = '⏹ Stop'; $('#mic').classList.add('listening'); $('#micStatus').textContent = 'Listening... 🎙️';
};
$('#parseDump').onclick = e => withBusy(e.target, async () => {
  const text = $('#dump').value.trim(); if (!text) return;
  const r = await api('braindump', { text });
  $('#dumpTip').textContent = [r.mood && `You sound: ${r.mood}.`, r.tip].filter(Boolean).join(' ');
  const ul = $('#dumpTasks'); ul.replaceChildren();
  (r.tasks || []).forEach(t => ul.append(el('li', null, `${t.title} (${t.priority}${t.due ? ', due ' + t.due : ''}, ~${t.hours}h)`)));
  const add = el('button', 'primary', 'Add to my week plan');
  add.onclick = () => { state.extra.push(...r.tasks); save(); add.disabled = true; add.textContent = 'Added ✅ Re-plan from the Week tab.'; confetti(30); };
  ul.after(add);
});

// ---------- budget ----------
function parseCSV(text) {
  const rows = []; let row = [], f = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) { if (c === '"') { if (text[i + 1] === '"') { f += '"'; i++; } else q = false; } else f += c; }
    else if (c === '"') q = true;
    else if (c === ',') { row.push(f); f = ''; }
    else if (c === '\n') { row.push(f); rows.push(row); row = []; f = ''; }
    else if (c !== '\r') f += c;
  }
  if (f || row.length) { row.push(f); rows.push(row); }
  return rows.filter(r => r.some(x => x.trim()));
}
function loadStatement(text) {
  const rows = parseCSV(text); const head = rows[0].map(h => h.trim().toLowerCase());
  const di = head.findIndex(h => h === 'description' || h === 'merchant' || h === 'name');
  const ai = head.findIndex(h => h === 'amount');
  if (di < 0 || ai < 0) { alert('Could not find Description and Amount columns.'); return; }
  state.tx = rows.slice(1).map(r => ({ desc: r[di], amount: parseFloat(r[ai]) })).filter(t => t.desc && !isNaN(t.amount));
  save(); renderBudget();
}
$('#csvFile').onchange = async e => { if (e.target.files[0]) loadStatement(await readFile(e.target.files[0])); };
$('#csvSample').onclick = async () => loadStatement(await (await fetch('/data/sample-statement.csv')).text());
function renderBudget() {
  $('#csvPreview').textContent = state.tx.length ? `${state.tx.length} transactions loaded. Claude will see only descriptions and amounts.` : '';
  $('#runBudget').hidden = !state.tx.length;
}
$('#runBudget').onclick = e => withBusy(e.target, async () => {
  const r = await api('budget', { transactions: state.tx }); confetti(20);
  const totals = {};
  state.tx.forEach((t, i) => { const c = r.categories[i] || 'Other'; if (t.amount < 0) totals[c] = (totals[c] || 0) - t.amount; });
  const max = Math.max(...Object.values(totals), 1);
  const out = $('#budgetOut'); out.replaceChildren();
  const table = el('table');
  Object.entries(totals).sort((a, b) => b[1] - a[1]).forEach(([c, v]) => {
    const tr = el('tr'); tr.append(el('td', null, c), el('td', 'num', '£' + v.toFixed(2)));
    const td = el('td'); const bar = el('div', 'bar'); bar.style.width = (v / max * 100) + '%'; td.append(bar); tr.append(td); table.append(tr);
  });
  out.append(table);
  const ul = el('ul'); (r.insights || []).forEach(i => ul.append(el('li', null, i))); out.append(ul);
  if (r.weeklyBudgetSuggestion) out.append(el('p', null, `Suggested weekly spending budget: £${r.weeklyBudgetSuggestion}`));
});

// ---------- events ----------
let allEvents = [];
async function initEvents() {
  allEvents = await (await fetch('/data/events.json')).json();
  const clubs = [...new Set(allEvents.map(e => e.club))];
  const box = $('#clubs'); box.className = 'chips';
  clubs.forEach(c => {
    const l = el('label', 'chip'); const cb = el('input'); cb.type = 'checkbox'; cb.checked = state.clubs.includes(c);
    cb.onchange = () => { state.clubs = cb.checked ? [...state.clubs, c] : state.clubs.filter(x => x !== c); save(); renderEvents(); };
    l.append(cb, el('span', null, c)); box.append(l);
  });
  renderEvents();
}
function renderEvents() {
  const root = $('#eventList'); root.replaceChildren();
  const mine = allEvents.filter(e => state.clubs.includes(e.club)).sort((a, b) => a.when.localeCompare(b.when));
  if (!mine.length) { root.append(el('p', 'muted', 'Pick a club above.')); return; }
  mine.forEach(ev => {
    const row = el('div', 'item event');
    row.append(el('div', 't', fmtDay(ev.when) + ' ' + fmtTime(ev.when)));
    const body = el('div'); body.append(el('div', null, `${ev.title} (${ev.club})`));
    body.append(el('small', null, `${ev.where} · ${ev.cost ? '£' + ev.cost : 'free'}${ev.food ? ' · free food' : ''}`));
    row.append(body); root.append(row);
  });
}

function renderAll() { renderAgenda(); renderBudget(); }
renderAll(); initEvents();
