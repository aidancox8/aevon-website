// The demo page: three panels over the pretend clinic in clinic.js. Everything the patient is sent
// comes from the engine and its message templates; this file only draws it.
import { createClinic, PATIENTS, DOCTOR, TZ, BLOCKS } from './clinic.js';
import { addDays, localDate, mondayOf, partsOf, weekdayOf } from './core/time.js';

const PRESETS = ['Follow-up in 6 weeks, 15 min', 'f/u 2 wks', 'RTC 6/52', 'telephone f/u 1 month', 'follow up as needed', 'urgent follow-up this week'];
const CHIPS = ['1', '2', '3', 'OTHER', 'mornings only', 'not that week', 'Tuesdays or Thursdays', 'I need to talk to the doctor about my results', 'STOP'];
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const reduced = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
const $ = (id) => document.getElementById(id);
const sleep = (ms) => new Promise((r) => setTimeout(r, reduced ? 0 : ms));
const pad = (n) => String(n).padStart(2, '0');
const minutesOf = (t) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3));

function h(tag, props = {}, ...kids) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (k === 'class') e.className = v;
    else if (k.startsWith('on')) e.addEventListener(k.slice(2), v);
    else if (v === true) e.setAttribute(k, '');
    else if (v !== false && v !== null && v !== undefined) e.setAttribute(k, v);
  }
  for (const kid of kids.flat()) if (kid !== null && kid !== undefined && kid !== false) e.append(kid);
  return e;
}

let clinic = createClinic();
let patientId = PATIENTS[0].id;
let shown = new Map(); // patient id -> how many messages of the thread are on the phone so far
let typing = false;
let pumping = false;
let busy = 0;
let weekDate = null; // any date in the week the schedule shows
let flash = null; // appointment start to highlight once
let note = '';
let drawn = new Map(); // patient id -> how many messages were on the phone at the last draw

const taskId = () => clinic.latestTaskFor(patientId);
const current = () => clinic.view(taskId());
const patient = () => PATIENTS.find((p) => p.id === patientId);

function setBusy(d) {
  busy += d;
  document.body.dataset.busy = busy > 0 ? '1' : '0';
  renderControls();
}

function clock12(h24, mi) {
  return `${h24 % 12 || 12}:${pad(mi)} ${h24 < 12 ? 'am' : 'pm'}`;
}
function stamp(ms) {
  const p = partsOf(ms, TZ);
  const day = localDate(ms, TZ) === clinic.today ? 'Today' : `${DAYS[p.weekday]} ${MONTHS[p.m - 1]} ${p.d}`;
  return `${day} ${clock12(p.h, p.mi)}`;
}
function dayLabel(date) {
  const [, m, d] = date.split('-').map(Number);
  return `${DAYS[weekdayOf(date)]} ${MONTHS[m - 1]} ${d}`;
}

/* ---------- the doctor ---------- */
function renderDoctor() {
  const list = $('pt-list');
  list.replaceChildren(...PATIENTS.map((p) => h('label', { class: `pt${p.id === patientId ? ' sel' : ''}` },
    h('input', { type: 'radio', name: 'pt', value: p.id, checked: p.id === patientId, onchange: () => selectPatient(p.id) }),
    h('span', { class: 'pt-n' }, `${p.lastName}, ${p.firstName}`),
    h('span', { class: `pt-c${p.sms ? '' : ' no'}` }, clinic.consent.allows(p.id, 'sms') ? 'Agreed to texts' : p.sms ? 'Opted out of texts' : 'No consent on file'),
  )));
}
function buildPresets() {
  $('presets').replaceChildren(...PRESETS.map((t) => h('button', { type: 'button', class: 'pre', onclick: () => { $('instr').value = t; $('instr').focus(); } }, t)));
}

/* ---------- the patient ---------- */
function renderThread() {
  const p = patient();
  $('ph-name').textContent = clinic.settings.get().clinicName;
  $('ph-who').textContent = `${p.firstName}'s phone`;
  const all = clinic.thread(patientId);
  const n = Math.min(shown.get(patientId) ?? 0, all.length);
  const box = $('thread');
  const kids = [];
  let prev = 0;
  const before = drawn.get(patientId) ?? n;
  drawn.set(patientId, n);
  for (const [i, m] of all.slice(0, n).entries()) {
    const at = m.sentAt ?? m.createdAt;
    if (at - prev > 30 * 60000) kids.push(h('div', { class: 'stamp' }, stamp(at)));
    prev = at;
    kids.push(h('div', { class: `b ${m.direction === 'out' ? 'in' : 'out'}${i >= before ? ' fresh' : ''}` }, m.body));
  }
  if (typing) kids.push(h('div', { class: 'b in typ', 'aria-hidden': 'true' }, h('i'), h('i'), h('i')));
  if (!kids.length) kids.push(h('p', { class: 'empty' }, clinic.consent.allows(patientId, 'sms') ? 'No messages yet. Assign a follow-up as the doctor.' : `${p.firstName} has not agreed to texts, so nothing is sent to this phone.`));
  box.replaceChildren(...kids);
  box.scrollTop = box.scrollHeight;
}
function buildChips() {
  $('chips').replaceChildren(...CHIPS.map((t) => h('button', { type: 'button', class: 'chip', 'data-reply': t, onclick: () => sendReply(t) }, t)));
}
async function pump() {
  if (pumping) return;
  pumping = true;
  setBusy(1);
  for (;;) {
    const all = clinic.thread(patientId);
    const n = shown.get(patientId) ?? 0;
    if (n >= all.length) break;
    if (all[n].direction === 'out') {
      typing = true; renderThread();
      await sleep(650);
      typing = false;
    }
    shown.set(patientId, n + 1);
    renderThread();
    await sleep(220);
  }
  pumping = false;
  setBusy(-1);
}

/* ---------- the clinic ---------- */
function renderTask() {
  const v = current();
  const box = $('task');
  if (!v) {
    box.replaceChildren(h('p', { class: 'empty dark' }, 'No task for this patient yet.'));
    $('status').replaceChildren(h('p', { class: 'st-w' }, 'Waiting for a task'), h('p', { class: 'st-n' }, 'Assign a follow-up to Aevon and it starts at once.'));
    return;
  }
  const done = v.emrTask.status === 'completed';
  const rows = [
    ['Patient', `${v.patient.lastName}, ${v.patient.firstName}`],
    ['Created by', DOCTOR.displayName],
    ['Message', v.emrTask.message],
    ['Assigned to', h('b', { class: v.assignee === 'Aevon' ? '' : 'fd' }, v.assignee)],
    ['Status', h('b', { class: done ? 'ok' : '' }, done ? 'Complete' : 'Active')],
  ];
  const notes = v.emrTask.comments.map((c) => h('tr', {},
    h('td', { class: 'nt-t' }, stamp(Date.parse(c.at))), h('td', {}, 'Aevon'), h('td', { class: 'nt-x' }, c.text)));
  box.replaceChildren(
    h('table', { class: 'kv' }, h('tbody', {}, rows.map(([k, val]) => h('tr', {}, h('th', { scope: 'row' }, k), h('td', {}, val))))),
    h('table', { class: 'nt' },
      h('thead', {}, h('tr', {}, h('th', {}, 'Time'), h('th', {}, 'By'), h('th', {}, 'Note'))),
      h('tbody', {}, notes.length ? notes : h('tr', {}, h('td', { colspan: '3' }, 'No notes yet')))),
  );
  $('status').replaceChildren(h('p', { class: 'st-w' }, v.status.words), h('p', { class: 'st-n' }, v.status.next.replaceAll('the agent', 'Aevon')));
}

function defaultWeek() {
  const v = current();
  if (!v) return addDays(clinic.today, 7);
  return v.row.booked_start?.slice(0, 10) ?? v.row.offers[0]?.date ?? v.row.target_date ?? addDays(clinic.today, 7);
}
function renderSched() {
  const v = current();
  const wk = clinic.week(weekDate ?? defaultWeek());
  const offers = new Map();
  if (v && ['awaiting', 'booking'].includes(v.row.state)) v.row.offers.forEach((o, i) => offers.set(`${o.date} ${minutesOf(o.start.slice(11, 16))}`, i + 1));
  $('wk-label').textContent = `Week of ${dayLabel(wk.monday)}`;
  const head = h('tr', {}, h('th', { class: 'tm' }, ''), wk.days.map((d) => h('th', { class: d.closed ? 'cl' : '' }, dayLabel(d.date).replace(/ \w+ /, ' '), d.closed ? h('small', {}, d.closed) : null)));
  const body = [];
  BLOCKS.forEach((b, bi) => {
    if (bi) body.push(h('tr', { class: 'lunch' }, h('td', { colspan: '6' }, 'Lunch')));
    for (let m = minutesOf(b.start); m < minutesOf(b.end); m += 15) {
      body.push(h('tr', {}, h('td', { class: 'tm' }, `${Math.floor(m / 60) % 12 || 12}:${pad(m % 60)}`), wk.days.map((d) => {
        if (d.closed) return h('td', { class: 'cl' });
        const s = d.slots.get(m);
        if (s) return h('td', { class: `${s.mine ? 'mine' : 'bk'}${s.first ? '' : ' cont'}${s.mine && s.start === flash ? ' new' : ''}` }, s.first ? s.who : '');
        const n = offers.get(`${d.date} ${m}`);
        return n ? h('td', { class: 'off' }, `Offered ${n}`) : h('td', {});
      })));
    }
  });
  $('sched').replaceChildren(h('thead', {}, head), h('tbody', {}, body));
  flash = null;
}

function renderControls() {
  const v = current();
  const waiting = !!v && v.row.state === 'awaiting' && !!v.row.first_sent_at;
  const lock = busy > 0;
  $('btn-noreply').disabled = lock || !waiting;
  $('btn-taken').disabled = lock || !waiting;
  $('btn-assign').disabled = lock;
  const canReply = !lock && clinic.thread(patientId).length > 0;
  $('reply').disabled = !canReply;
  $('reply-send').disabled = !canReply;
  for (const c of document.querySelectorAll('.chip')) c.disabled = !canReply;
  $('note').textContent = note;
}

function render() {
  renderDoctor();
  renderThread();
  renderTask();
  renderSched();
  renderControls();
}

/* ---------- actions ---------- */
async function act(work) {
  if (busy > 0) return;
  setBusy(1);
  try {
    await work();
  } finally {
    setBusy(-1);
  }
  render();
  await pump();
  render();
}

function selectPatient(id) {
  patientId = id;
  shown.set(id, clinic.thread(id).length);
  weekDate = null;
  note = '';
  render();
}

function assign() {
  const text = $('instr').value.trim();
  if (!text) { $('instr').focus(); return undefined; }
  return act(async () => {
    note = '';
    await clinic.assign(patientId, text);
    weekDate = null;
    const v = current();
    if (v.row.state === 'handed_back') { note = 'Aevon did not text the patient. The task went to the front desk with a note.'; showTab('clinic'); } else showTab('patient');
  });
}

function sendReply(text) {
  const body = String(text).trim();
  if (!body) return undefined;
  return act(async () => {
    const before = current()?.row.state;
    const sent = await clinic.reply(patientId, body);
    $('reply').value = '';
    // The patient's own message goes on the phone at once.
    shown.set(patientId, Math.min(clinic.thread(patientId).length, (shown.get(patientId) ?? 0) + (sent.duplicate ? 0 : 1)));
    const v = current();
    note = sent.duplicate ? 'The same message sent twice in a row is read once.' : '';
    if (v && v.row.state !== before) {
      weekDate = null;
      if (v.row.state === 'booked') { flash = v.row.booked_start; markTab('clinic'); }
      if (v.row.state === 'handed_back') markTab('clinic');
    }
  });
}

function noReply() {
  return act(async () => {
    const id = taskId();
    note = 'The patient stays silent.';
    for (let i = 0; i < 3; i++) {
      const what = await clinic.waitForNext(id);
      if (!what) break;
      note = what === 'handed_back' ? 'No reply after two reminders. The task is with the front desk.' : what === 'reminder 1' ? 'One day later: first reminder.' : 'Three days later: second reminder.';
      render();
      await pump();
      if (what === 'handed_back') { markTab('clinic'); break; }
      await sleep(900);
    }
  });
}

function takeSlot() {
  return act(async () => {
    const offer = clinic.takeFirstOffer(taskId());
    if (!offer) return;
    weekDate = offer.date;
    note = 'Another patient was just booked into the first offered time. Reply 1 as the patient.';
    markTab('clinic');
  });
}

function reset() {
  if (busy > 0) return;
  clinic = createClinic();
  patientId = PATIENTS[0].id;
  shown = new Map();
  drawn = new Map();
  weekDate = null;
  note = '';
  $('instr').value = PRESETS[0];
  $('reply').value = '';
  for (const t of document.querySelectorAll('.dtab')) t.classList.remove('dot');
  showTab('doctor');
  render();
}

/* ---------- tabs (phones) ---------- */
function showTab(name) {
  $('cols').dataset.tab = name;
  for (const t of document.querySelectorAll('.dtab')) {
    const on = t.dataset.tab === name;
    t.setAttribute('aria-selected', on ? 'true' : 'false');
    if (on) t.classList.remove('dot');
  }
}
function markTab(name) {
  const t = document.querySelector(`.dtab[data-tab="${name}"]`);
  if (t && $('cols').dataset.tab !== name) t.classList.add('dot');
}

/* ---------- guided tour ---------- */
const TOUR = [
  { tab: 'doctor', target: 'col-doctor', text: 'You are the doctor. Pick a patient and an instruction, then press Assign to Aevon.', run: () => (taskId() ? null : assign()) },
  { tab: 'patient', target: 'col-patient', text: 'This is the patient’s phone. The text has three open times taken from the doctor’s schedule.' },
  { tab: 'patient', target: 'replybox', text: 'Reply as the patient. Tap 2, or type anything a patient might say.', run: () => (current()?.row.state === 'awaiting' ? sendReply('2') : null) },
  { tab: 'clinic', target: 'col-clinic', text: 'This is what the clinic sees. The appointment is in the schedule and the task is closed with a note.' },
  { tab: 'clinic', target: 'whatif', text: 'Now try the harder cases: a patient who does not reply, a time that gets taken, or a question about results.' },
];
let step = -1;
function tourShow(i) {
  for (const e of document.querySelectorAll('.tour-hi')) e.classList.remove('tour-hi');
  step = i;
  const card = $('tour');
  if (i < 0 || i >= TOUR.length) { card.hidden = true; document.body.classList.remove('touring'); return; }
  const s = TOUR[i];
  showTab(s.tab);
  $(s.target).classList.add('tour-hi');
  $('tour-n').textContent = `Step ${i + 1} of ${TOUR.length}`;
  $('tour-t').textContent = s.text;
  $('tour-next').textContent = i === TOUR.length - 1 ? 'Done' : 'Next';
  card.hidden = false;
  document.body.classList.add('touring');
  if (window.matchMedia('(max-width: 1039px)').matches) $(s.target).scrollIntoView({ block: 'nearest', behavior: reduced ? 'auto' : 'smooth' });
}
async function tourNext() {
  if (busy > 0) return;
  const s = TOUR[step];
  const next = step + 1;
  if (s?.run) await s.run();
  tourShow(next);
}

/* ---------- start ---------- */
buildPresets();
buildChips();
$('instr').value = PRESETS[0];
$('assign-form').addEventListener('submit', (e) => { e.preventDefault(); assign(); });
$('reply-form').addEventListener('submit', (e) => { e.preventDefault(); sendReply($('reply').value); });
$('btn-noreply').addEventListener('click', noReply);
$('btn-taken').addEventListener('click', takeSlot);
$('btn-reset').addEventListener('click', reset);
$('wk-prev').addEventListener('click', () => { weekDate = addDays(mondayOf(weekDate ?? defaultWeek()), -7); renderSched(); });
$('wk-next').addEventListener('click', () => { weekDate = addDays(mondayOf(weekDate ?? defaultWeek()), 7); renderSched(); });
for (const t of document.querySelectorAll('.dtab')) t.addEventListener('click', () => showTab(t.dataset.tab));
$('tour-next').addEventListener('click', tourNext);
$('tour-skip').addEventListener('click', () => tourShow(-1));
$('tour-again').addEventListener('click', () => tourShow(0));
showTab('doctor');
render();
tourShow(0);
document.body.dataset.ready = '1';
