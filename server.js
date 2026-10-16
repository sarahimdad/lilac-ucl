import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
try { process.loadEnvFile(path.join(__dirname, '.env')); } catch { /* no .env: mock mode */ }

const KEY = process.env.ANTHROPIC_API_KEY?.trim();
const MODEL = process.env.CLAUDE_MODEL || 'claude-sonnet-5-5';
const PORT = process.env.PORT || 3000;
const MOCK = !KEY;

const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.ics': 'text/calendar', '.csv': 'text/csv' };

async function claude(system, user) {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-api-key': KEY, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({ model: MODEL, max_tokens: 4096, system, messages: [{ role: 'user', content: user }] }),
  });
  if (!res.ok) throw new Error(`Claude API ${res.status}: ${await res.text()}`);
  const data = await res.json();
  const text = data.content.map(b => b.text || '').join('');
  const m = text.match(/\{[\s\S]*\}/);
  if (!m) throw new Error('No JSON in model reply');
  return JSON.parse(m[0]);
}

const JSON_ONLY = 'Reply with ONLY a single JSON object, no prose, no markdown fences.';

const ICS_HOSTS = new Set(['timetable.apps.ucl.ac.uk', 'timetable.mesh.ucl.ac.uk']);
async function fetchICS({ url }) {
  let u;
  try { u = new URL(url); } catch { throw new Error('That does not look like a URL'); }
  if (u.protocol !== 'https:' || !ICS_HOSTS.has(u.hostname)) throw new Error('Only UCL timetable links (timetable.apps.ucl.ac.uk) are allowed');
  const r = await fetch(u, { redirect: 'follow' });
  const text = await r.text();
  if (!r.ok) {
    let msg = text; try { msg = JSON.parse(text).message || text; } catch { /* keep raw */ }
    throw new Error(msg.replace(/UPI: \w+/g, 'your account').slice(0, 300));
  }
  return { ics: text };
}

const tasks = {
  ics: fetchICS,
  async plan({ events, deadlines, tasks: extra }) {
    if (MOCK) return mockPlan(deadlines, extra);
    return claude(
      `You are a study planner for a UCL student. Given their fixed classes/events, deadlines and extra tasks, schedule realistic study blocks in the free gaps (08:00-21:00, not overlapping events, max 4h per day of study, include breaks and an evening off at least once). Prioritise by deadline date and weighting. ${JSON_ONLY}
Schema: {"summary": string, "blocks": [{"start": ISO datetime, "end": ISO datetime, "title": string, "why": string}], "warnings": [string]}`,
      JSON.stringify({ events, deadlines, extra }));
  },
  async braindump({ text }) {
    if (MOCK) return mockBraindump(text);
    return claude(
      `Turn a rambling student voice note into structured tasks. Today is ${new Date().toISOString().slice(0, 10)}. ${JSON_ONLY}
Schema: {"tasks": [{"title": string, "due": "YYYY-MM-DD or null", "hours": number, "priority": "high"|"medium"|"low", "kind": "study"|"social"|"admin"|"other"}], "mood": string, "tip": string}`,
      text);
  },
  async budget({ transactions }) {
    if (MOCK) return mockBudget(transactions);
    return claude(
      `You categorise bank transactions for a UK student and give blunt but kind insights. Categories: Rent, Groceries, Eating out, Transport, Subscriptions, Going out, Study, Income, Other. Negative amounts are spending. ${JSON_ONLY}
Schema: {"categories": [category string per transaction, same order and length as input], "insights": [string, max 5], "weeklyBudgetSuggestion": number}`,
      JSON.stringify(transactions.map((t, i) => ({ i, d: t.desc, a: t.amount }))));
  },
};

// ---- mock mode: canned but data-driven so the demo works without a key ----
function mockPlan(deadlines = [], extra = []) {
  const sorted = [...deadlines].sort((a, b) => a.start.localeCompare(b.start));
  const blocks = sorted.map((d, i) => {
    const due = new Date(d.start);
    const day = new Date(due); day.setDate(day.getDate() - 1);
    day.setHours(14 + (i % 2) * 2, 0, 0, 0);
    const end = new Date(day); end.setHours(day.getHours() + 2);
    return { start: iso(day), end: iso(end), title: `Work on: ${d.title.replace(/ is due$/, '')}`, why: `Due ${due.toDateString()}, scheduled the day before so you have a buffer.` };
  });
  return { summary: '[MOCK] Study blocks placed the day before each deadline. Add an API key for a real optimised plan.', blocks, warnings: sorted.length > 2 ? ['Several deadlines land close together this week.'] : [] };
}
function mockBraindump(text) {
  const parts = text.split(/[.,;\n]| and /i).map(s => s.trim()).filter(s => s.length > 3);
  return { tasks: parts.map(p => ({ title: p, due: null, hours: 1, priority: /due|deadline|exam/i.test(p) ? 'high' : 'medium', kind: 'other' })), mood: 'busy', tip: '[MOCK] Add an API key for real prioritisation.' };
}
function mockBudget(tx) {
  const rules = [[/rent|unite/i, 'Rent'], [/tesco|sainsbury/i, 'Groceries'], [/deliveroo|pret|starbucks/i, 'Eating out'], [/tfl|uber/i, 'Transport'], [/spotify|netflix|prime|gym/i, 'Subscriptions'], [/pub|club|fabric/i, 'Going out'], [/waterstones/i, 'Study'], [/loan/i, 'Income']];
  const categories = tx.map(t => (rules.find(([r]) => r.test(t.desc)) || [0, 'Other'])[1]);
  const eat = tx.filter((t, i) => categories[i] === 'Eating out').reduce((s, t) => s - t.amount, 0);
  return { categories, insights: [`[MOCK] You spent £${eat.toFixed(2)} on eating out.`, 'Add an API key for real insights.'], weeklyBudgetSuggestion: 60 };
}
const iso = d => { const p = n => String(n).padStart(2, '0'); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}:00`; };

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  if (req.method === 'POST' && url.pathname.startsWith('/api/')) {
    const name = url.pathname.slice(5);
    if (!tasks[name]) { res.writeHead(404).end(); return; }
    let body = '';
    for await (const c of req) body += c;
    try {
      const out = await tasks[name](JSON.parse(body || '{}'));
      res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify({ ...out, mock: MOCK }));
    } catch (e) {
      console.error(e.message);
      res.writeHead(500, { 'content-type': 'application/json' }).end(JSON.stringify({ error: e.message }));
    }
    return;
  }
  if (url.pathname === '/api/status') { res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify({ mock: MOCK })); return; }

  // static files: public/ plus sample data under /data
  let rel = decodeURIComponent(url.pathname === '/' ? '/index.html' : url.pathname);
  const isData = rel.startsWith('/data/');
  const base = path.join(__dirname, isData ? 'data' : 'public');
  const file = path.normalize(path.join(base, isData ? rel.slice(5) : rel));
  if (!file.startsWith(base + path.sep) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404).end('Not found'); return; }
  res.writeHead(200, { 'content-type': MIME[path.extname(file)] || 'application/octet-stream' }).end(fs.readFileSync(file));
});

server.listen(PORT, () => console.log(`UCL Copilot on http://localhost:${PORT}  [${MOCK ? 'MOCK mode (no API key)' : 'live: ' + MODEL}]`));
