// The spectator's view: the world (3D, or a flat map), the four minds as they think, and everything they said.
import { createWorld } from './world3d.js';
const $ = (s) => document.querySelector(s);
const NS = 'http://www.w3.org/2000/svg';
const el = (tag, attrs = {}, parent) => {
  const n = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v);
  parent?.appendChild(n);
  return n;
};
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

let map = null;
let snap = null;
let turns = [];
let picked = null;
let pickedIndex = -1; // -1 = latest
const live = {}; // house -> { think, say }
const nodes = {};
let world = null;
let flat = false;
try {
  flat = localStorage.getItem('fourfold.view') === 'flat';
} catch {}

function setView(toFlat) {
  flat = toFlat || !world;
  $('#world').hidden = flat;
  $('#overlay').hidden = flat;
  $('#map').toggleAttribute('hidden', !flat); // an <svg> has no .hidden property: set the attribute itself
  $('#view-home').hidden = flat;
  $('#view-toggle').textContent = flat ? '3D world' : '2D map';
  $('#view-toggle').disabled = !world;
  try {
    localStorage.setItem('fourfold.view', toFlat ? 'flat' : '3d');
  } catch {}
}
async function startWorld() {
  try {
    world = await createWorld($('#world'), $('#overlay'), map, {
      onPick: (tid, owner) => {
        if (!owner) return;
        picked = owner;
        pickedIndex = -1;
        renderHouses();
        renderInspect();
      },
    });
    world.sync(snap);
  } catch (err) {
    console.warn('3D world unavailable:', err);
    world = null;
  }
  setView(flat);
}

function houseColor(id) {
  return id ? map.seats.find((s) => s.id === id).color : 'var(--neutral)';
}
const hname = (id) => (id ? snap.houses[id].house : 'neutral');
const tn = (id) => map.territories[id].name;

function drawMap() {
  const svg = $('#map');
  svg.innerHTML = '';
  const T = map.territories;
  const LABELS = { rime: [500, 24], thorn: [155, 515], salt: [845, 515], ember: [500, 706], hollow: [500, 222], shards: [150, 38] };
  for (const [rid, [x, y]] of Object.entries(LABELS)) {
    const label = el('text', { x, y, 'text-anchor': 'middle', class: 'r-name' }, svg);
    label.textContent = `${map.regions[rid].name} +${map.regions[rid].bonus}${rid === 'shards' ? ' (4 islands)' : ''}`;
  }
  for (const [a, b] of map.edges) {
    const sea = T[a].region === 'shards' || T[b].region === 'shards';
    el('line', { x1: T[a].x, y1: T[a].y, x2: T[b].x, y2: T[b].y, class: `edge${sea ? ' sea' : ''}` }, svg);
  }
  el('g', { id: 'arrows' }, svg);
  for (const [id, t] of Object.entries(T)) {
    const g = el('g', {}, svg);
    const ring = el('circle', { cx: t.x, cy: t.y, r: 25, 'stroke-width': 2 }, g);
    const troops = el('text', { x: t.x, y: t.y + 5, 'text-anchor': 'middle', class: 't-troops' }, g);
    const name = el('text', { x: t.x, y: t.y + 42, 'text-anchor': 'middle', class: 't-name' }, g);
    name.textContent = t.name;
    el('title', {}, g).textContent = t.name;
    nodes[id] = { ring, troops };
  }
}

function paintMap() {
  if (!snap) return;
  for (const [id, n] of Object.entries(nodes)) {
    const t = snap.territories[id];
    n.ring.setAttribute('fill', houseColor(t.owner));
    n.ring.setAttribute('stroke', t.owner ? '#0b0d12' : '#555d70');
    n.troops.textContent = t.troops;
    n.troops.classList.toggle('light', !t.owner);
  }
}

function arrow(e) {
  const T = map.territories;
  const a = T[e.from];
  const b = T[e.to];
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = Math.hypot(dx, dy);
  const ux = dx / len;
  const uy = dy / len;
  const g = $('#arrows');
  const c = houseColor(e.house);
  const x2 = b.x - ux * 30;
  const y2 = b.y - uy * 30;
  el('line', { x1: a.x + ux * 28, y1: a.y + uy * 28, x2, y2, stroke: c, class: 'arrow', 'stroke-dasharray': e.won ? '' : '6 4' }, g);
  el('polygon', { points: `${x2},${y2} ${x2 - ux * 12 - uy * 7},${y2 - uy * 12 + ux * 7} ${x2 - ux * 12 + uy * 7},${y2 - uy * 12 - ux * 7}`, fill: c, class: 'arrow' }, g);
  setTimeout(() => g.firstChild && g.removeChild(g.firstChild) && g.firstChild && g.removeChild(g.firstChild), 2500);
  const ring = nodes[e.to].ring;
  ring.classList.remove('flash');
  void ring.getBoundingClientRect();
  ring.classList.add('flash');
}

function renderHouses() {
  const box = $('#houses');
  box.innerHTML = '';
  for (const seat of map.seats) {
    const h = snap.houses[seat.id];
    const st = snap.standings.find((s) => s.id === seat.id);
    const active = snap.current === seat.id && snap.status === 'running';
    const card = document.createElement('div');
    card.className = `house${active ? ' active' : ''}${h.alive ? '' : ' out'}${picked === seat.id ? ' picked' : ''}`;
    card.style.setProperty('--c', seat.color);
    card.innerHTML = `<div class="top"><span class="name">${h.house}</span><span class="stats">${h.alive ? `${st.territories} lands · ${st.troops} troops` : 'OUT'}${snap.winner === seat.id ? ' · WINNER' : ''}</span></div>
      <div class="model">${esc(h.label)}${active ? ' — thinking…' : ''}</div>
      <div class="live" id="live-${seat.id}"></div>`;
    card.onclick = () => {
      picked = seat.id;
      pickedIndex = -1;
      renderHouses();
      renderInspect();
    };
    box.appendChild(card);
    paintLive(seat.id);
  }
}

function paintLive(id) {
  const box = document.getElementById(`live-${id}`);
  if (!box || !live[id]) return;
  const { think, say } = live[id];
  box.innerHTML = `${think ? `<span class="think">${esc(think.slice(-1800))}</span>\n` : ''}${esc(say.slice(-2400))}`;
  box.scrollTop = box.scrollHeight;
}

function line(e) {
  const r = `<span class="r">R${e.round}</span>`;
  const H = (id) => `<b style="color:${houseColor(id)}">${hname(id)}</b>`;
  switch (e.type) {
    case 'battle':
      return `${r}${H(e.house)} → ${tn(e.to)} (${e.defender ? H(e.defender) : 'neutral'}) from ${tn(e.from)} with ${e.sent} vs ${e.defended}: ${e.won ? `<b>taken</b>, ${e.survivors} hold it` : `repelled, ${e.survivors} left`}`;
    case 'say':
      return `${r}${e.mid ? `<span class="mid">${e.mid}</span>` : ''}${H(e.house)}${toWhom(e)}: <span class="say">“${esc(e.text)}”</span>`;
    case 'forward': {
      const o = e.original;
      return `${r}${H(e.house)} <span class="tag fwd">forwarded ${e.mid}</span>${toWhom(e)} — from ${H(o.house)}${o.to ? ` to ${o.to.map(H).join(', ')}` : ' to all'}: <span class="say">“${esc(o.text)}”</span>`;
    }
    case 'propose':
      return `${r}${H(e.house)} <span class="tag deal">proposes ${e.pact}</span> to ${e.to.map(H).join(', ')}: <span class="say">“${esc(e.terms)}”</span>`;
    case 'accept':
      return `${r}${H(e.house)} accepts ${e.pact}${e.active ? ' — <b>in force</b>' : ''}`;
    case 'reject':
      return `${r}${H(e.house)} rejects ${e.pact}`;
    case 'renounce':
      return `${r}${H(e.house)} <span class="tag">withdraws from ${e.pact}</span>`;
    case 'betrayal':
      return `${r}<span class="tag bad">broke ${e.pact}</span> ${H(e.house)} attacked partner ${H(e.victim)} at ${tn(e.at)}`;
    case 'give':
      return `${r}${H(e.house)} <span class="tag gift">gave ${e.n} reinforcements</span> to ${H(e.to[0])} <span class="priv">private</span>`;
    case 'cede':
      return `${r}${H(e.house)} <span class="tag gift">handed ${tn(e.territory)}</span> (${e.troops} troops) to ${H(e.recipient)}`;
    case 'eliminated':
      return `${r}<b>${H(e.house)} is out</b> — destroyed by ${H(e.by)}`;
    case 'desert':
      return `${r}${H(e.house)} left ${e.n} reinforcements unplaced; they deserted`;
    case 'silent':
      return `${r}${H(e.house)} gave no orders`;
    case 'over':
      return `${r}<b>Game over — ${H(e.winner)} wins</b> (${esc(e.why)})`;
    case 'round':
      return `<span class="r">—— round ${e.n} ——</span>`;
    default:
      return null;
  }
}

function toWhom(e) {
  const to = e.to == null ? null : [].concat(e.to);
  return to ? ` <span class="priv">→ ${to.map(hname).join(', ')} · private</span>` : ' <span class="dim">to all</span>';
}

function addEvents(events) {
  const ol = $('#chronicle');
  for (const e of events) {
    const html = line(e);
    if (!html) continue;
    const li = document.createElement('li');
    li.innerHTML = html;
    // Clicking an entry opens that house's turn: what it wrote, and what it was thinking when it did.
    if (e.house && e.round) {
      li.className = 'jump';
      li.title = 'See what it was thinking that turn';
      li.onclick = () => openTurn(e.house, e.round);
    }
    ol.prepend(li);
    if (e.type === 'battle' && events.length < 40 && flat) arrow(e);
  }
  while (ol.children.length > 600) ol.lastChild.remove();
  renderDiplomacy();
}

function openTurn(house, round) {
  picked = house;
  const mine = turns.filter((t) => t.house === house);
  const i = mine.findIndex((t) => t.round === round);
  pickedIndex = i >= 0 ? i : -1;
  renderHouses();
  renderInspect();
  $('#inspect-panel').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

// ---- diplomacy: agreements and their fate, gifts, cessions, forwards, private talk ----
let allEvents = [];
function renderDiplomacy() {
  const box = $('#diplomacy');
  if (!box || !snap || !map) return;
  const ev = allEvents;
  const H = (id) => `<b style="color:${houseColor(id)}">${hname(id)}</b>`;
  const pacts = {};
  for (const e of ev) {
    if (e.type === 'propose') pacts[e.pact] = { id: e.pact, by: e.house, parties: e.parties, terms: e.terms, round: e.round, status: 'proposed', log: [] };
    const p = pacts[e.pact];
    if (!p) continue;
    if (e.type === 'accept' && e.active) Object.assign(p, { status: 'active', since: e.round });
    if (e.type === 'reject') Object.assign(p, { status: 'rejected', endedBy: e.house, endedRound: e.round });
    if (e.type === 'renounce') Object.assign(p, { status: 'renounced', endedBy: e.house, endedRound: e.round });
    if (e.type === 'betrayal') Object.assign(p, { status: 'broken', endedBy: e.house, endedRound: e.round });
  }
  const list = Object.values(pacts).reverse();
  const count = (t) => ev.filter((e) => e.type === t).length;
  const says = ev.filter((e) => e.type === 'say');
  const priv = says.filter((e) => e.to != null).length;
  const group = says.filter((e) => Array.isArray(e.to) && e.to.length > 1).length;
  const stat = (k, v) => `<div class="stat"><b>${v}</b><span>${k}</span></div>`;
  const statuses = list.reduce((a, p) => ((a[p.status] = (a[p.status] || 0) + 1), a), {});
  box.innerHTML = `<div class="stats">${stat('messages', says.length)}${stat('private', priv)}${stat('group', group)}${stat('forwarded', count('forward'))}${stat('agreements', list.length)}${stat('in force', statuses.active || 0)}${stat('broken by attack', statuses.broken || 0)}${stat('gifts', count('give'))}${stat('territories handed over', count('cede'))}</div>
    ${list.length ? '' : '<p class="dim">No agreements yet.</p>'}
    <ul class="pacts">${list
      .map(
        (p) => `<li class="pact ${p.status}" data-house="${p.by}" data-round="${p.round}"><span class="pid">${p.id}</span> <span class="st">${p.status === 'active' ? 'in force' : p.status}</span> ${p.parties.map(H).join(' · ')} <span class="r">R${p.round}${p.endedRound ? `–R${p.endedRound}${p.endedBy ? ` by ${hname(p.endedBy)}` : ''}` : ''}</span><div class="terms">“${esc(p.terms)}”</div></li>`,
      )
      .join('')}</ul>`;
  box.querySelectorAll('.pact').forEach((li) => (li.onclick = () => openTurn(li.dataset.house, Number(li.dataset.round))));
}

function renderInspect() {
  const box = $('#inspect');
  if (!picked) return void (box.innerHTML = '<p class="dim">Click a house to read its last turn: the orders it wrote, its private reasoning, what the world did with them, and its notebook.</p>');
  const mine = turns.filter((t) => t.house === picked);
  $('#inspect-who').textContent = `${snap.houses[picked].house} (${snap.houses[picked].label})`;
  $('#inspect-who').style.color = houseColor(picked);
  if (!mine.length) return void (box.innerHTML = `<p class="dim">No turns yet.</p><h3>Notebook</h3><pre>${esc(snap.houses[picked].notebook || '(empty)')}</pre>`);
  const i = pickedIndex < 0 ? mine.length - 1 : Math.min(pickedIndex, mine.length - 1);
  const t = mine[i];
  box.innerHTML = `<div class="turnnav"><button id="prev">‹</button> round ${t.round} · ${(t.ms / 1000).toFixed(1)}s${t.finish ? ` · ${t.finish}` : ''} <button id="next">›</button></div>
    <h3>What the world did</h3><pre>${t.report.map((r) => (/refused/.test(r) ? `<span class="refused">${esc(r)}</span>` : esc(r))).join('\n') || '—'}</pre>
    <h3>Its reply</h3><pre>${esc(t.text || t.error || '(nothing)')}</pre>
    ${t.reasoning ? `<details><summary class="dim">Hidden reasoning (${t.reasoning.length} chars)</summary><pre>${esc(t.reasoning)}</pre></details>` : ''}
    <h3>Notebook after</h3><pre>${esc(t.notebook || '(empty)')}</pre>
    <details><summary class="dim">The page it was shown</summary><pre>${esc(t.prompt)}</pre></details>`;
  $('#prev').onclick = () => ((pickedIndex = Math.max(0, i - 1)), renderInspect());
  $('#next').onclick = () => ((pickedIndex = i + 1 >= mine.length ? -1 : i + 1), renderInspect());
}

function renderHeader() {
  $('#round').textContent = `round ${snap.round}/${snap.rounds}`;
  const s = $('#status');
  s.textContent = snap.status === 'over' ? 'over' : snap.paused ? 'paused' : snap.waiting ? snap.waiting : snap.running ? `${hname(snap.current)} to move` : 'stopped';
  const b = $('#banner');
  b.hidden = snap.status !== 'over';
  if (snap.status === 'over') b.innerHTML = `<span style="color:${houseColor(snap.winner)}">${hname(snap.winner)}</span> wins — ${esc(snap.houses[snap.winner].label)}`;
}

function renderAll() {
  if (!snap) {
    $('#round').textContent = 'no match';
    $('#status').textContent = 'set one up';
    return;
  }
  renderHeader();
  paintMap();
  renderHouses();
  renderInspect();
}

// A published copy (on the web) has no server behind it: it opens on the saved record and can replay it.
const STATIC = Boolean(document.querySelector('meta[name="fourfold-static"]'));
const es = STATIC ? { close() {} } : new EventSource('/api/stream');
function handle(msg) {
  if (msg.snapshot) snap = msg.snapshot;
  if (msg.type === 'hello') {
    const first = !map;
    map = msg.map;
    turns = msg.turns;
    drawMap();
    if (first) startWorld();
    else world?.sync(snap);
    $('#chronicle').innerHTML = '';
    allEvents = msg.events.slice();
    addEvents(msg.events);
    renderAll();
    if (!snap) openSetup(false);
  } else if (msg.type === 'quit') {
    es.close();
    $('#goodbye').hidden = false;
  } else if (msg.type === 'reset') {
    location.reload();
  } else if (msg.type === 'thinking') {
    world?.sync(snap);
    live[msg.house] = { think: '', say: '' };
    renderAll();
  } else if (msg.type === 'token') {
    const l = (live[msg.house] ||= { think: '', say: '' });
    l[msg.kind] += msg.d;
    paintLive(msg.house);
  } else if (msg.type === 'turn') {
    world?.play(msg.events);
    world?.sync(snap);
    turns.push(msg.record);
    allEvents.push(...msg.events);
    if (turns.length > 400) turns.shift();
    addEvents(msg.events);
    renderAll();
  } else if (msg.type === 'error') {
    const l = (live[msg.house] ||= { think: '', say: '' });
    l.say += `\n[error: ${msg.error}]`;
    paintLive(msg.house);
  } else {
    renderAll();
  }
}
if (!STATIC) {
  es.onmessage = (m) => handle(JSON.parse(m.data));
  es.onerror = () => ($('#status').textContent = 'disconnected');
} else startStatic();

let record = null;
async function startStatic() {
  document.body.classList.add('static');
  record = await fetch('data/match.json', { cache: 'no-cache' }).then((r) => r.json());
  handle({ type: 'hello', snapshot: record.snapshot, events: record.events, turns: record.turns, map: record.map });
  const when = new Date(record.publishedAt).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' });
  const who = map.seats.map((x) => record.snapshot.houses[x.id].label).join(', ');
  const intro = document.createElement('p');
  intro.className = 'intro';
  intro.innerHTML = `<b>Four language models at one table.</b> ${esc(who)} play a game of territory and talk on one graphics card. Each is told only the rules: nobody coaches them, orders they get wrong are refused rather than fixed, and nothing makes them keep their word. Every public and private message is shown here, and you can click a house to read what it was thinking.`;
  document.querySelector('main').before(intro);
  $('#status').textContent = record.snapshot.status === 'over' ? `final · published ${when}` : `recorded to round ${record.snapshot.round} · published ${when}`;
}

// Replays the recorded match on the board, one turn at a time.
let replaying = false;
async function replay() {
  if (!record || !world || replaying) return;
  replaying = true;
  $('#replay').textContent = 'Stop';
  world.reset(record.initial);
  $('#chronicle').innerHTML = '';
  allEvents = [];
  let turn = [];
  for (const e of record.events) {
    if (!replaying) break;
    turn.push(e);
    if (e.type !== 'endturn' && e.type !== 'over') continue;
    $('#round').textContent = `round ${e.round}/${record.snapshot.rounds}`;
    world.play(turn);
    allEvents.push(...turn);
    addEvents(turn);
    turn = [];
    while (replaying && world.busy()) await new Promise((r) => setTimeout(r, 150));
    await new Promise((r) => setTimeout(r, 500));
  }
  if (replaying) world.sync(record.snapshot);
  else {
    world.reset(record.snapshot.territories);
    $('#chronicle').innerHTML = '';
    allEvents = record.events.slice();
    addEvents(record.events);
  }
  $('#round').textContent = `round ${record.snapshot.round}/${record.snapshot.rounds}`;
  replaying = false;
  $('#replay').textContent = 'Replay the match';
}

const post = (p, data) =>
  fetch(p, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(data || {}) })
    .then((r) => r.json())
    .then((j) => (j.error && alert(j.error), j));
$('#play').onclick = () => post('/api/play');
$('#pause').onclick = () => post('/api/pause');
$('#new').onclick = () => openSetup(true);
$('#view-toggle').onclick = () => setView(!flat);
$('#replay').onclick = () => (replaying ? (replaying = false) : replay());
$('#view-home').onclick = () => world?.overview();
$('#quit').onclick = () => confirm('Stop Fourfold? The match is saved and picks up from this turn next time.') && post('/api/quit');

// ---- setting up a match -----------------------------------------------------
const OPT = (backend, model) => `${backend}|${model}`;
async function openSetup(cancellable) {
  const dlg = $('#setup');
  $('#setup-cancel').hidden = !cancellable;
  $('#seats').innerHTML = '<p class="dim">Looking for models…</p>';
  dlg.showModal();
  const s = await fetch('/api/setup').then((r) => r.json());
  const local = s.local.models.map((m) => `<option value="${esc(OPT('openai', m))}">${esc(m)}</option>`).join('');
  const claude = s.claude.models.map((m) => `<option value="${esc(OPT('anthropic', m))}">${esc(m)}</option>`).join('');
  const options = `${local ? `<optgroup label="On this machine">${local}</optgroup>` : ''}<optgroup label="Claude (API)">${claude}</optgroup><optgroup label="Testing"><option value="mock|mock">test bot (no model)</option></optgroup>`;
  $('#seats').innerHTML = [0, 1, 2, 3].map((i) => `<label class="seat"><span>player ${i + 1}</span><select id="seat-${i}">${options}</select></label>`).join('');
  s.current.forEach((c, i) => {
    const sel = $(`#seat-${i}`);
    const v = c.backend === 'mock' ? 'mock|mock' : OPT(c.backend, c.model);
    if ([...sel.options].some((o) => o.value === v)) sel.value = v;
  });
  $('#rounds').value = s.rounds;
  $('#shuffle').checked = s.shuffleSeats;
  const notes = [];
  if (!s.local.ok) notes.push(`Local models unavailable: ${s.local.reason}.`);
  if (!s.claude.sdk || !s.claude.key) notes.push(`Claude seats need ${[!s.claude.sdk && 'the SDK (npm install @anthropic-ai/sdk)', !s.claude.key && 'ANTHROPIC_API_KEY'].filter(Boolean).join(' and ')}; without them a Claude seat just loses its turns.`);
  notes.push('Local models share one graphics card and are swapped in every turn.');
  $('#setup-note').textContent = notes.join(' ');
}
$('#setup-cancel').onclick = () => $('#setup').close();
$('#setup-form').onsubmit = async (e) => {
  e.preventDefault();
  if (snap && snap.status === 'running' && !confirm('Abandon the match in progress? It stays saved on disk.')) return;
  const players = [0, 1, 2, 3].map((i) => {
    const [backend, ...rest] = $(`#seat-${i}`).value.split('|');
    return { backend, model: rest.join('|') };
  });
  $('#setup-start').disabled = true;
  const r = await post('/api/new', { players, rounds: $('#rounds').value, shuffleSeats: $('#shuffle').checked });
  $('#setup-start').disabled = false;
  if (r.ok) $('#setup').close();
};
