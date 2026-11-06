// The setup screens: a new match or an experiment (four seats, each from any provider, with its own settings, and the
// rules to play by), the providers models come from, swapping the model behind a house mid-match, and experiment results.
const $ = (s, root = document) => root.querySelector(s);
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const post = (p, data) =>
  fetch(p, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(data || {}) })
    .then((r) => r.json())
    .then((j) => (j.error && alert(j.error), j));

const RULES = {
  diplomacy: ['Talk and deals', 'group messages, forwarding, agreements, gifts, cessions'],
  fog: ['Fog of war', 'exact troop numbers only on and next to your own land'],
  'fixed-dice': ['Fixed dice', 'the same attack in the same round always rolls the same'],
};
const LETTERS = ['A', 'B', 'C', 'D'];
let setup = null; // the last /api/setup answer

// ---- one seat: where its model comes from, which model, and its settings ----
const value = (c) => (c.backend === 'mock' ? 'mock||mock' : c.backend === 'anthropic' ? `anthropic||${c.model}` : `openai|${c.provider || 'local'}|${c.model}`);
function modelOptions() {
  const groups = setup.providers
    .map((p) => {
      const opts = p.models.map((m) => `<option value="${esc(`openai|${p.id}|${m}`)}">${esc(m)}</option>`).join('');
      const why = p.ok ? '' : ` — ${p.reason}`;
      return `<optgroup label="${esc(p.name)}${esc(why)}">${opts}</optgroup>`;
    })
    .join('');
  const claude = setup.claude.models.map((m) => `<option value="${esc(`anthropic||${m}`)}">${esc(m)}</option>`).join('');
  return `${groups}<optgroup label="Claude (API)">${claude}</optgroup><optgroup label="Testing"><option value="mock||mock">test bot (no model)</option></optgroup>`;
}
function seatRow(name, c, id) {
  const el = document.createElement('div');
  el.className = 'seatrow';
  el.innerHTML = `<div class="seat"><span>${esc(name)}</span><select class="pick">${modelOptions()}</select><button type="button" class="ghost small tune" title="This seat's own settings">Settings</button></div>
    <div class="tuning" hidden>
      <label>Name shown <input class="label" placeholder="model name" maxlength="40"></label>
      <label class="for-openai">Thinking <select class="thinking"><option value="default">model's default</option><option value="off">off</option></select></label>
      <label>Max tokens <input class="maxTokens" type="number" min="200" max="64000" step="100" placeholder="6000"></label>
      <label class="for-openai">Temperature <input class="temperature" type="number" min="0" max="2" step="0.05" placeholder="default"></label>
      <label class="for-claude">Effort <select class="effort"><option value="">medium</option><option>low</option><option>high</option><option>xhigh</option><option>max</option></select></label>
      <p class="dim small for-local-off">Switching thinking off only works on this machine's models; other providers use their default.</p>
    </div>`;
  el.id = id;
  const pick = $('.pick', el);
  if (c) {
    const v = value(c);
    if (![...pick.options].some((o) => o.value === v)) pick.insertAdjacentHTML('afterbegin', `<option value="${esc(v)}">${esc(c.model)} (not listed now)</option>`);
    pick.value = v;
    $('.label', el).value = c.label && c.label !== c.model ? c.label : '';
    $('.thinking', el).value = c.thinking || 'default';
    $('.maxTokens', el).value = c.maxTokens ?? '';
    $('.temperature', el).value = c.temperature ?? '';
    $('.effort', el).value = c.effort || '';
  }
  const kind = () => {
    const [backend, provider] = pick.value.split('|');
    el.dataset.backend = backend;
    el.dataset.local = backend === 'openai' && provider === 'local' ? '1' : '0';
  };
  pick.onchange = kind;
  kind();
  $('.tune', el).onclick = () => ($('.tuning', el).hidden = !$('.tuning', el).hidden);
  return el;
}
function readSeat(el) {
  const [backend, provider, ...rest] = $('.pick', el).value.split('|');
  return {
    backend, provider: provider || null, model: rest.join('|'),
    label: $('.label', el).value.trim(), thinking: $('.thinking', el).value,
    maxTokens: $('.maxTokens', el).value, temperature: $('.temperature', el).value, effort: $('.effort', el).value,
  };
}

// ---- providers ----
function renderProviders() {
  const box = $('#providers');
  box.innerHTML = setup.providers
    .map((p) => `<li><b>${esc(p.name)}</b> <span class="dim small">${esc(p.baseUrl)}</span> <span class="small ${p.ok ? 'ok' : 'bad'}">${p.ok ? `${p.models.length} models` : esc(p.reason)}</span>${p.local ? '' : ` <button type="button" class="ghost small" data-remove="${esc(p.id)}">Remove</button>`}</li>`)
    .join('');
  box.querySelectorAll('[data-remove]').forEach((b) => (b.onclick = async () => {
    if (!confirm('Remove this provider? Its saved key is deleted too.')) return;
    if ((await post('/api/providers/remove', { id: b.dataset.remove })).ok) reload();
  }));
  const preset = $('#prov-preset');
  preset.innerHTML = '<option value="">custom…</option>' + setup.presets.map((p) => `<option value="${esc(p.id)}">${esc(p.name)}</option>`).join('');
  preset.onchange = () => {
    const p = setup.presets.find((x) => x.id === preset.value);
    if (!p) return;
    $('#prov-name').value = p.name;
    $('#prov-url').value = p.baseUrl;
    $('#prov-key').placeholder = p.needsKey ? 'API key (needed)' : 'API key (not needed)';
  };
}
async function addProvider() {
  const p = setup.presets.find((x) => x.id === $('#prov-preset').value);
  const r = await post('/api/providers', { name: $('#prov-name').value, baseUrl: $('#prov-url').value, key: $('#prov-key').value, maxTokensField: p?.maxTokensField });
  if (!r.ok) return;
  $('#prov-key').value = '';
  reload();
}

// ---- the new match / experiment dialog ----
let current = null; // the seats as last chosen, kept while the dialog reloads
async function reload() {
  if ($('#seats').children.length) current = [...$('#seats').children].map(readSeat);
  setup = await fetch('/api/setup').then((r) => r.json());
  renderSeats(current || setup.current);
  renderProviders();
}
function renderSeats(choices) {
  const x = $('#mode-exp').checked;
  const box = $('#seats');
  box.innerHTML = '';
  for (let i = 0; i < 4; i++) box.appendChild(seatRow(x ? `entrant ${LETTERS[i]}` : `player ${i + 1}`, choices[i], `seat-${i}`));
}
function renderMode() {
  const x = $('#mode-exp').checked;
  document.querySelectorAll('#setup .only-exp').forEach((e) => (e.hidden = !x));
  document.querySelectorAll('#setup .only-single').forEach((e) => (e.hidden = x));
  $('#setup-start').textContent = x ? 'Start experiment' : 'Start match';
  [...$('#seats').children].forEach((el, i) => ($('.seat span', el).textContent = x ? `entrant ${LETTERS[i]}` : `player ${i + 1}`));
  const sets = Math.max(1, Number($('#exp-sets').value) || 1);
  $('#exp-plan').textContent = `${sets * 4} matches: in every set of four, each entrant plays each house once, and the four share one dice seed.`;
}

export async function openSetup({ cancellable, running }) {
  const dlg = $('#setup');
  $('#setup-cancel').hidden = !cancellable;
  $('#seats').innerHTML = '<p class="dim">Looking for models…</p>';
  current = null;
  dlg.showModal();
  setup = await fetch('/api/setup').then((r) => r.json());
  $('#seats').innerHTML = '';
  renderSeats(setup.current);
  renderProviders();
  $('#rules').innerHTML = Object.entries(RULES)
    .map(([id, [name, about]]) => `<label class="check" title="${esc(about)}"><input type="checkbox" value="${id}" ${setup.features.chosen.includes(id) ? 'checked' : ''}> ${esc(name)} <span class="dim small">${esc(about)}</span></label>`)
    .join('');
  $('#rounds').value = setup.rounds;
  $('#shuffle').checked = setup.shuffleSeats;
  const notes = [];
  if (!setup.claude.sdk || !setup.claude.key) notes.push(`Claude seats need ${[!setup.claude.sdk && 'the SDK (npm install @anthropic-ai/sdk)', !setup.claude.key && 'ANTHROPIC_API_KEY'].filter(Boolean).join(' and ')}; without them a Claude seat just loses its turns.`);
  notes.push("Models on this machine share one graphics card and are swapped in every turn.");
  $('#setup-note').textContent = notes.join(' ');
  $('#mode-exp').onchange = $('#mode-single').onchange = renderMode;
  $('#exp-sets').oninput = renderMode;
  $('#prov-add').onclick = addProvider;
  renderMode();
  $('#setup-form').onsubmit = async (e) => {
    e.preventDefault();
    const x = $('#mode-exp').checked;
    if (running() && !confirm(`Abandon the match in progress? It stays saved on disk.`)) return;
    const players = [...$('#seats').children].map(readSeat);
    const features = [...document.querySelectorAll('#rules input:checked')].map((i) => i.value);
    $('#setup-start').disabled = true;
    const r = await post('/api/new', {
      players, features, rounds: $('#rounds').value, shuffleSeats: $('#shuffle').checked, seed: $('#seed').value,
      ...(x ? { experiment: { name: $('#exp-name').value, repeats: $('#exp-sets').value } } : {}),
    });
    $('#setup-start').disabled = false;
    if (r.ok) dlg.close();
  };
}
$('#setup-cancel').onclick = () => $('#setup').close();

// ---- swapping the model behind a house ----
export async function openSwap(house) {
  const dlg = $('#swap');
  setup = await fetch('/api/setup').then((r) => r.json());
  const seat = setup.seats.find((s) => s.house === house);
  if (!seat) return;
  $('#swap-title').textContent = `Change who plays House ${seat.name}`;
  $('#swap-seat').innerHTML = '';
  const row = seatRow('model', seat, 'swap-row');
  $('.tuning', row).hidden = false;
  $('#swap-seat').appendChild(row);
  dlg.showModal();
  $('#swap-form').onsubmit = async (e) => {
    e.preventDefault();
    const r = await post('/api/seat', { house, choice: readSeat(row) });
    if (r.ok) dlg.close();
  };
}
$('#swap-cancel').onclick = () => $('#swap').close();

// ---- experiment results ----
const COLUMNS = [
  ['winRate', 'win rate', (v) => (v == null ? '—' : `${Math.round(v * 100)}%`)],
  ['avgRank', 'avg place'],
  ['avgTerritories', 'avg land'],
  ['avgTroops', 'avg troops'],
  ['eliminated', 'knocked out'],
  ['refusedPerTurn', 'refused / turn'],
  ['cutOff', 'cut off'],
  ['avgSeconds', 's / turn'],
  ['avgTokens', 'tokens / turn'],
  ['messages', 'messages'],
  ['privateMessages', 'private'],
  ['forwards', 'forwarded'],
  ['proposed', 'proposed'],
  ['accepted', 'accepted'],
  ['betrayed', 'broke'],
  ['wasBetrayed', 'was betrayed'],
  ['kept', 'kept to end'],
  ['giftsGiven', 'gifts'],
  ['ceded', 'ceded'],
];
function settingsText(e) {
  const s = e.settings;
  return [e.provider && e.provider !== 'local' ? e.provider : e.backend === 'anthropic' ? 'Claude' : e.backend === 'mock' ? 'test bot' : 'local', s.thinking === 'off' ? 'thinking off' : null, s.maxTokens ? `${s.maxTokens} tok` : null, s.temperature != null ? `temp ${s.temperature}` : null, s.effort ? `effort ${s.effort}` : null].filter(Boolean).join(' · ');
}
export async function openResults() {
  const dlg = $('#results');
  dlg.showModal();
  const box = $('#results-body');
  box.innerHTML = '<p class="dim">Loading…</p>';
  const list = await fetch('/api/experiments').then((r) => r.json());
  if (!list.length) return void (box.innerHTML = '<p class="dim">No experiments yet. Start one from New match → Experiment.</p>');
  box.innerHTML = list
    .map(
      (x) => `<section class="exp">
      <h3>${esc(x.name)} <span class="dim small">${esc(new Date(x.createdAt).toLocaleString())} · ${x.played}/${x.planned} matches · ${x.rounds} rounds · ${esc((x.features || []).join(', ') || 'plain rules')} · <b class="st-${x.status}">${x.status}</b></span>
      ${x.status === 'running' ? `<button type="button" class="ghost small" data-stop="${esc(x.id)}">Stop after this match</button>` : ''}</h3>
      <div class="tablewrap"><table><thead><tr><th>entrant</th>${COLUMNS.map(([, h]) => `<th>${esc(h)}</th>`).join('')}</tr></thead><tbody>
      ${x.entrants
        .map((e) => `<tr><td><b>${e.entrant}</b> ${esc(e.label)}<div class="dim small">${esc(settingsText(e))}</div></td>${COLUMNS.map(([k, , f]) => `<td>${esc(f ? f(e[k]) : e[k] ?? '—')}</td>`).join('')}</tr>`)
        .join('')}
      </tbody></table></div>
      <p class="dim small">Outcomes count finished matches only (${x.entrants[0]?.finished ?? 0} so far); behaviour counts every turn played. "Broke" is an attack on a partner while an agreement was in force; "kept to end" counts agreements still in force when a match ended.</p>
    </section>`,
    )
    .join('');
  box.querySelectorAll('[data-stop]').forEach((b) => (b.onclick = async () => {
    if ((await post('/api/experiments/stop', { id: b.dataset.stop })).ok) openResults();
  }));
}
$('#results-close').onclick = () => $('#results').close();
