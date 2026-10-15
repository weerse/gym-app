'use strict';

// ---------- Хранилище ----------
const KEY = 'gym.v1';
let store = null; // загружается в самом конце, когда объявлены все функции

function load() {
  try {
    const s = JSON.parse(localStorage.getItem(KEY));
    if (s && typeof s === 'object') return migrate(Object.assign(blank(), s));
  } catch (e) {}
  return blank();
}
function blank() {
  return { last: {}, lastCardio: null, variant: {}, history: [], active: null };
}

// v1: выбор альтернативы и активная тренировка ссылались на номер упражнения в дне.
// В v2 план поменялся (новые упражнения в середине дня), поэтому привязываемся к основному упражнению.
const PLAN_V1 = {
  d1: ['leg_press', 'smith_bench', 'lat_pulldown', 'machine_shoulder', 'ez_curl', 'lying_leg_curl', 'cable_crunch', 'treadmill'],
  d2: ['leg_press', 'db_shoulder', 'cable_row', 'smith_incline', 'pushdown', 'hanging_raise', 'treadmill'],
  d3: ['leg_press', 'hammer_row', 'hammer_press', 'hammer_curl', 'butterfly', 'hyperext', 'treadmill']
};
function migrate(s) {
  if ((s.v || 1) < 2) {
    const variant = {};
    for (const [k, ex] of Object.entries(s.variant || {})) {
      const [dayId, slot] = k.split(':');
      const base = PLAN_V1[dayId] && PLAN_V1[dayId][+slot];
      if (base) variant[dayId + ':' + base] = ex;
    }
    s.variant = variant;
    const a = s.active;
    if (a && PLAN_V1[a.dayId] && dayById(a.dayId)) {
      const old = {};
      a.items.forEach((it) => { old[PLAN_V1[a.dayId][it.slot]] = it; });
      const curBase = PLAN_V1[a.dayId][a.items[a.idx] ? a.items[a.idx].slot : 0];
      const day = dayById(a.dayId);
      a.items = day.items.map((pi, slot) => {
        const o = old[pi.ex];
        if (o) return Object.assign(o, { slot });
        return newItem(a.dayId, pi, slot, variant, s);
      });
      a.idx = Math.max(0, day.items.findIndex((pi) => pi.ex === curBase));
    }
    s.v = 2;
    try { localStorage.setItem(KEY, JSON.stringify(s)); } catch (e) {}
  }
  return s;
}
function save() {
  try { localStorage.setItem(KEY, JSON.stringify(store)); } catch (e) {}
}

// ---------- Утилиты ----------
const $ = (sel) => document.querySelector(sel);
const app = $('#app');
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const dayById = (id) => PLAN.find((d) => d.id === id);
const maxReps = (reps) => (String(reps).split(/[–-]/).pop().match(/\d+/) || [''])[0];
const num = (v) => { const n = parseFloat(String(v).replace(',', '.')); return isFinite(n) ? n : null; };
const fmtNum = (n) => (n == null ? '' : String(Math.round(n * 100) / 100).replace('.', ','));

function fmtTime(sec) {
  sec = Math.max(0, Math.round(sec));
  const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60;
  const mm = String(m).padStart(h ? 2 : 1, '0'), ss = String(s).padStart(2, '0');
  return h ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}
function fmtDate(ts, withWeekday) {
  const d = new Date(ts);
  return d.toLocaleDateString('ru-RU', withWeekday
    ? { weekday: 'short', day: 'numeric', month: 'short' }
    : { day: 'numeric', month: 'short' });
}
function toast(msg) {
  const t = document.createElement('div');
  t.className = 'toast'; t.textContent = msg;
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 2200);
}

// ---------- Звук / вибрация / экран ----------
let audioCtx = null;
function unlockAudio() {
  if (!audioCtx) {
    try { audioCtx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) {}
  }
  if (audioCtx && audioCtx.state === 'suspended') audioCtx.resume();
}
function beep(times = 3) {
  if (!audioCtx) return;
  for (let i = 0; i < times; i++) {
    const t0 = audioCtx.currentTime + i * 0.35;
    const o = audioCtx.createOscillator(), g = audioCtx.createGain();
    o.type = 'sine'; o.frequency.value = i === times - 1 ? 1320 : 880;
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(0.5, t0 + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.25);
    o.connect(g).connect(audioCtx.destination);
    o.start(t0); o.stop(t0 + 0.3);
  }
}
function buzz() {
  if (navigator.vibrate) navigator.vibrate([300, 150, 300, 150, 600]);
}
let wakeLock = null;
async function keepAwake(on) {
  try {
    if (on && 'wakeLock' in navigator && !wakeLock && document.visibilityState === 'visible') {
      wakeLock = await navigator.wakeLock.request('screen');
      wakeLock.addEventListener('release', () => { wakeLock = null; });
    } else if (!on && wakeLock) {
      await wakeLock.release(); wakeLock = null;
    }
  } catch (e) {}
}
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') {
    keepAwake(!!store.active);
    tick();
  }
});

// ---------- Сессия ----------
function variantKey(dayId, planItem) { return dayId + ':' + planItem.ex; }

function makeSets(item, exKey, s = store) {
  const last = s.last[exKey];
  const sets = [];
  for (let i = 0; i < item.sets; i++) {
    const prev = last && (last.sets[i] || last.sets[last.sets.length - 1]);
    sets.push({ w: prev && prev.w != null ? fmtNum(prev.w) : '', r: '', done: false });
  }
  return sets;
}

function newItem(dayId, it, slot, variant, s) {
  if (it.cardio) {
    const lc = s.lastCardio || {};
    return { slot, ex: it.ex, cardio: { min: fmtNum(lc.min), speed: fmtNum(lc.speed), incline: fmtNum(lc.incline), done: false, timerEnd: null, timerLeft: null } };
  }
  const options = [it.ex, ...(it.alts || [])];
  const saved = variant[variantKey(dayId, it)];
  const ex = options.includes(saved) ? saved : it.ex;
  return { slot, ex, sets: makeSets(it, ex, s) };
}

function startWorkout(dayId) {
  const day = dayById(dayId);
  store.active = {
    dayId, startedAt: Date.now(), idx: 0, rest: null,
    items: day.items.map((it, slot) => newItem(dayId, it, slot, store.variant, store))
  };
  save();
  unlockAudio();
  keepAwake(true);
  go('workout');
}

function finishWorkout() {
  const a = store.active;
  if (!a) return;
  const day = dayById(a.dayId);
  const entry = { id: a.startedAt, dayId: a.dayId, title: day.title, startedAt: a.startedAt, finishedAt: Date.now(), items: [] };
  for (const it of a.items) {
    if (it.cardio) {
      const c = it.cardio;
      const rec = { min: num(c.min), speed: num(c.speed), incline: num(c.incline) };
      if (rec.min != null || rec.speed != null || rec.incline != null) {
        entry.items.push({ ex: it.ex, cardio: rec });
        store.lastCardio = rec;
      }
      continue;
    }
    const sets = it.sets.filter((s) => s.done).map((s) => ({ w: num(s.w), r: num(s.r) }));
    if (sets.length) {
      entry.items.push({ ex: it.ex, sets });
      store.last[it.ex] = { sets, date: entry.finishedAt };
    }
  }
  store.history.unshift(entry);
  store.active = null;
  save();
  keepAwake(false);
  go('summary', entry.id);
}

// ---------- Таймеры ----------
// kind: 'rest' — отдых между подходами, 'work' — таймер подхода на время (прогулка фермера, вис).
const REST_LABELS = {
  rest: ['Отдых', 'Отдых окончен — следующий подход!'],
  work: ['Подход', 'Время вышло — отметь подход ✓']
};
const restLabel = (r, over) => REST_LABELS[r.kind || 'rest'][over ? 1 : 0];

function startRest(sec, kind = 'rest') {
  const a = store.active;
  const old = $('#rest'); if (old) old.remove();
  a.rest = { endAt: Date.now() + sec * 1000, total: sec, alerted: false, kind };
  save();
  renderRest();
}
function stopRest() {
  if (store.active) { store.active.rest = null; save(); }
  const el = $('#rest'); if (el) el.remove();
}

function tick() {
  const a = store.active;
  if (!a) return;
  const el = $('#elapsed');
  if (el) el.textContent = fmtTime((Date.now() - a.startedAt) / 1000);

  if (a.rest) {
    const left = (a.rest.endAt - Date.now()) / 1000;
    const t = $('#rest-time'), bar = $('#rest-bar'), box = $('#rest');
    if (t) t.textContent = left > 0 ? fmtTime(Math.ceil(left)) : '+' + fmtTime(-left);
    if (bar) bar.style.width = Math.max(0, Math.min(100, (left / a.rest.total) * 100)) + '%';
    if (left <= 0 && !a.rest.alerted) {
      a.rest.alerted = true; save();
      buzz(); beep(3);
      if (box) { box.classList.add('over'); const lbl = $('#rest-label'); if (lbl) lbl.textContent = restLabel(a.rest, true); }
    }
  }

  const cur = a.items[a.idx];
  if (cur && cur.cardio && cur.cardio.timerEnd) {
    const left = (cur.cardio.timerEnd - Date.now()) / 1000;
    const t = $('#cardio-time');
    if (t) t.textContent = fmtTime(Math.max(0, Math.ceil(left)));
    if (left <= 0) {
      cur.cardio.timerEnd = null; cur.cardio.timerLeft = 0; save();
      buzz(); beep(4);
      toast('Кардио завершено 🎉');
      render();
    }
  }
}
setInterval(tick, 250);

// ---------- Навигация ----------
let view = { name: 'home', arg: null };
function go(name, arg) {
  view = { name, arg };
  history.pushState(view, '');
  render();
  window.scrollTo(0, 0);
}
window.addEventListener('popstate', (e) => {
  view = e.state || { name: 'home' };
  render();
});

function render() {
  const v = view.name;
  if (v === 'workout' && store.active) app.innerHTML = viewWorkout();
  else if (v === 'day') app.innerHTML = viewDay(view.arg);
  else if (v === 'summary') app.innerHTML = viewSummary(view.arg);
  else if (v === 'history') app.innerHTML = viewHistory();
  else app.innerHTML = viewHome();
  if (v === 'workout' && store.active && store.active.rest) renderRest();
  tick();
}

// ---------- Экраны ----------
function lastDoneOf(dayId) {
  const h = store.history.find((x) => x.dayId === dayId);
  return h ? h.finishedAt : null;
}
function nextDayId() {
  const today = new Date().getDay();
  const t = PLAN.find((d) => d.weekday === today);
  if (t) return t.id;
  if (!store.history.length) return PLAN[0].id;
  const i = PLAN.findIndex((d) => d.id === store.history[0].dayId);
  return PLAN[(i + 1) % PLAN.length].id;
}

function viewHome() {
  const a = store.active;
  const today = new Date().getDay();
  const next = nextDayId();
  let html = `<div class="wrap">
    <h1>Тренировки</h1>
    <div class="sub">${esc(new Date().toLocaleDateString('ru-RU', { weekday: 'long', day: 'numeric', month: 'long' }))}</div>`;
  if (a) {
    const d = dayById(a.dayId);
    html += `<div class="card" style="border-color:var(--warn)">
      <div class="row between"><div><b>Незавершённая тренировка</b><div class="sub">${esc(d.title)} · начата ${fmtTime((Date.now() - a.startedAt) / 1000)} назад</div></div></div>
      <div class="row" style="margin-top:12px">
        <button class="btn primary" style="flex:1" data-act="resume">Продолжить</button>
        <button class="btn ghost" data-act="discard">Сбросить</button>
      </div></div>`;
  }
  for (const d of PLAN) {
    const last = lastDoneOf(d.id);
    const strength = d.items.filter((i) => !i.cardio);
    const isToday = d.weekday === today;
    html += `<button class="card day-card ${d.id === next ? 'today' : ''}" data-act="open-day" data-id="${d.id}">
      <div class="row between">
        <h2>${esc(d.title)} <span class="sub" style="font-weight:400">· ${esc(d.weekdayName)}</span></h2>
        ${isToday ? '<span class="badge green">Сегодня</span>' : d.id === next ? '<span class="badge green">Следующая</span>' : ''}
      </div>
      <div class="sub" style="margin-top:6px">${strength.map((i) => esc(EX[i.ex].name)).join(' · ')} · дорожка</div>
      <div class="sub" style="margin-top:8px">${last ? 'Последний раз: ' + fmtDate(last, true) : 'Ещё не выполнялась'}</div>
    </button>`;
  }
  html += `<div class="sub" style="margin-top:4px">Силовая ≈ 70–80 минут, плюс 15–20 минут ходьбы после.</div>
    <div class="footer-links">
      <button class="btn ghost small" data-act="history">📈 История (${store.history.length})</button>
      <button class="btn ghost small" data-act="export">⬇ Резервная копия</button>
      <button class="btn ghost small" data-act="import">⬆ Восстановить</button>
    </div>
  </div>`;
  return html;
}

function viewDay(dayId) {
  const d = dayById(dayId);
  if (!d) return viewHome();
  let html = `<div class="topbar"><button class="icon-btn" data-act="back">←</button>
    <div class="title"><b>${esc(d.title)} · ${esc(d.weekdayName)}</b><span class="sub">${d.items.length} упражнений</span></div></div>
    <div class="wrap"><div class="card">`;
  for (const it of d.items) {
    const ex = EX[it.ex];
    if (it.cardio) {
      const lc = store.lastCardio;
      html += `<div class="ex-line"><div><b>${esc(ex.name)}</b><div class="sub">в конце тренировки${lc ? ` · прошлый раз: ${cardioText(lc)}` : ''}</div></div><div class="sub">кардио</div></div>`;
      continue;
    }
    const last = store.last[it.ex];
    html += `<div class="ex-line"><div><b>${esc(ex.name)}</b>
      <div class="sub">отдых ${esc(it.restText)}${it.alts && it.alts.length ? ' · альт: ' + it.alts.map((k) => esc(EX[k].name.toLowerCase())).join(', ') : ''}</div>
      ${last ? `<div class="sub">рабочий вес: ${setsText(last.sets, it.ex)}</div>` : ''}</div>
      <div style="white-space:nowrap">${it.sets} × ${esc(it.reps)}</div></div>`;
  }
  html += `</div></div>
    <div class="bottom"><div class="inner">
      ${store.active && store.active.dayId !== dayId
        ? '<button class="btn block" disabled>Сначала заверши текущую тренировку</button>'
        : store.active
          ? '<button class="btn primary block" data-act="resume">Продолжить тренировку</button>'
          : `<button class="btn primary block" data-act="start" data-id="${d.id}">▶ Начать тренировку</button>`}
    </div></div>`;
  return html;
}

function setsText(sets, exKey) {
  const timed = EX[exKey] && EX[exKey].timed;
  return sets.map((s) => {
    const w = s.w != null ? fmtNum(s.w) + ' кг' : (timed ? '' : '—');
    const r = s.r == null ? '' : timed ? fmtNum(s.r) + ' с' : '×' + fmtNum(s.r);
    return timed && w && r ? w + ' · ' + r : w + r;
  }).join(', ');
}
function cardioText(c) {
  const p = [];
  if (c.min != null) p.push(fmtNum(c.min) + ' мин');
  if (c.speed != null) p.push(fmtNum(c.speed) + ' км/ч');
  if (c.incline != null) p.push(fmtNum(c.incline) + '%');
  return p.join(' · ');
}

function viewWorkout() {
  const a = store.active;
  const day = dayById(a.dayId);
  const it = a.items[a.idx];
  const planItem = day.items[it.slot];
  const ex = EX[it.ex];
  const isLast = a.idx === a.items.length - 1;

  const dots = a.items.map((x, i) => {
    const done = x.cardio ? x.cardio.done : x.sets.every((s) => s.done);
    return `<i class="${i === a.idx ? 'cur' : done ? 'on' : ''}"></i>`;
  }).join('');

  let html = `<div class="topbar">
      <button class="icon-btn" data-act="home">⌂</button>
      <div class="title"><b>${esc(day.title)} · ${a.idx + 1}/${a.items.length}</b><span class="sub">⏱ <span id="elapsed">0:00</span></span></div>
      <button class="btn small ghost" data-act="finish">Завершить</button>
    </div>
    <div class="wrap">
      <div class="dots">${dots}</div>
      <div class="gif"><img src="gif/${ex.gif}.gif" alt="${esc(ex.name)}" loading="eager"></div>
      <div class="muscles">🎯 ${esc(ex.muscles)}</div>
      <h1 style="font-size:22px;margin-top:12px">${esc(ex.name)}</h1>`;

  if (it.cardio) {
    html += viewCardio(it);
  } else {
    html += `<div class="sub">${planItem.sets} × ${esc(planItem.reps)} · отдых ${esc(planItem.restText)}</div>`;
    const options = [planItem.ex, ...(planItem.alts || [])];
    if (options.length > 1) {
      html += `<div class="chips">${options.map((k, i) =>
        `<button class="chip ${k === it.ex ? 'on' : ''}" data-act="variant" data-ex="${k}">${i ? 'Альт: ' : ''}${esc(EX[k].name)}</button>`).join('')}</div>`;
    }
    const last = store.last[it.ex];
    if (last) html += `<div class="last">Прошлый раз (${fmtDate(last.date)}): ${setsText(last.sets, it.ex)}</div>`;
    html += `<table class="sets"><tr><th>#</th><th>Вес, кг</th><th>${ex.timed ? 'Секунды' : 'Повторы'}</th><th></th></tr>`;
    it.sets.forEach((s, i) => {
      const lastR = last && last.sets[i] && last.sets[i].r != null ? fmtNum(last.sets[i].r) : maxReps(planItem.reps);
      html += `<tr class="${s.done ? 'done' : ''}">
        <td>${i + 1}</td>
        <td><input class="num" inputmode="decimal" data-field="w" data-i="${i}" value="${esc(s.w)}" placeholder="0"></td>
        <td><input class="num" inputmode="numeric" data-field="r" data-i="${i}" value="${esc(s.r)}" placeholder="${esc(lastR)}"></td>
        <td><button class="check" data-act="set-done" data-i="${i}">${s.done ? '✓' : ''}</button></td>
      </tr>`;
    });
    html += `</table>
      <div class="row" style="gap:8px">
        <button class="btn small ghost" data-act="add-set">+ подход</button>
        ${it.sets.length > 1 ? '<button class="btn small ghost" data-act="rm-set">− подход</button>' : ''}
        <span style="flex:1"></span>
        ${ex.timed ? `<button class="btn small" data-act="work-timer">▶ ${maxReps(planItem.reps)} с</button>` : ''}
        <button class="btn small ghost" data-act="rest-now">⏱ Отдых</button>
      </div>`;
  }

  html += `<div class="tips card">
      <h3>✅ Техника</h3><ul class="good">${ex.tips.map((t) => `<li>${esc(t)}</li>`).join('')}</ul>
      <h3>⚠️ Частые ошибки</h3><ul class="bad">${ex.mistakes.map((t) => `<li>${esc(t)}</li>`).join('')}</ul>
    </div>
  </div>
  <div class="bottom"><div class="inner">
    <button class="btn" data-act="prev" ${a.idx === 0 ? 'disabled' : ''}>←</button>
    ${isLast
      ? '<button class="btn primary" data-act="finish">🏁 Завершить тренировку</button>'
      : `<button class="btn primary" data-act="next">Далее: ${esc(EX[a.items[a.idx + 1].ex].name)} →</button>`}
  </div></div>`;
  return html;
}

function viewCardio(it) {
  const c = it.cardio;
  const running = !!c.timerEnd;
  const target = num(c.min);
  let timerHtml = '';
  if (running) {
    timerHtml = `<div class="big-timer" id="cardio-time">${fmtTime((c.timerEnd - Date.now()) / 1000)}</div>
      <button class="btn block" data-act="cardio-stop">⏸ Пауза</button>`;
  } else if (c.timerLeft != null && c.timerLeft > 0) {
    timerHtml = `<div class="big-timer">${fmtTime(c.timerLeft)}</div>
      <div class="row"><button class="btn primary" style="flex:1" data-act="cardio-start">▶ Продолжить</button><button class="btn ghost" data-act="cardio-reset">Сброс</button></div>`;
  } else {
    timerHtml = `<button class="btn block" data-act="cardio-start" ${target ? '' : 'disabled'}>▶ Таймер на ${target ? fmtNum(target) + ' мин' : '…'}</button>`;
  }
  return `<div class="sub">В конце тренировки · укажи время, скорость и уклон</div>
    <div class="grid3" style="margin-top:14px">
      <div class="field"><label>Время, мин</label><input class="num" inputmode="decimal" data-cardio="min" value="${esc(c.min)}" placeholder="20"></div>
      <div class="field"><label>Скорость, км/ч</label><input class="num" inputmode="decimal" data-cardio="speed" value="${esc(c.speed)}" placeholder="5,5"></div>
      <div class="field"><label>Уклон, %</label><input class="num" inputmode="decimal" data-cardio="incline" value="${esc(c.incline)}" placeholder="8"></div>
    </div>
    ${store.lastCardio ? `<div class="last">Прошлый раз: ${cardioText(store.lastCardio)}</div>` : ''}
    <div style="margin-top:12px">${timerHtml}</div>
    <button class="btn block ${c.done ? 'primary' : 'ghost'}" style="margin-top:10px" data-act="cardio-done">${c.done ? '✓ Ходьба выполнена' : 'Отметить как выполнено'}</button>`;
}

function renderRest() {
  const a = store.active;
  if (!a || !a.rest || view.name !== 'workout') return;
  let el = $('#rest');
  if (!el) {
    el = document.createElement('div');
    el.id = 'rest'; el.className = 'rest';
    el.innerHTML = `<div class="inner">
      <div class="sub" id="rest-label">${restLabel(a.rest, false)}</div>
      <div class="time" id="rest-time">0:00</div>
      <div class="bar"><i id="rest-bar" style="width:100%"></i></div>
      <div class="btns">
        <button class="btn" data-act="rest-add" data-s="-15">−15с</button>
        <button class="btn" data-act="rest-add" data-s="15">+15с</button>
        <button class="btn primary" data-act="rest-skip">Готов</button>
      </div></div>`;
    document.body.appendChild(el);
  }
  if (a.rest.alerted) {
    el.classList.add('over');
    $('#rest-label').textContent = restLabel(a.rest, true);
  }
  tick();
}

function viewSummary(id) {
  const e = store.history.find((x) => x.id === id);
  if (!e) return viewHome();
  let vol = 0, sets = 0;
  for (const it of e.items) if (it.sets) for (const s of it.sets) { sets++; if (!(EX[it.ex] && EX[it.ex].timed)) vol += (s.w || 0) * (s.r || 0); }
  return `<div class="wrap" style="text-align:center">
    <div style="font-size:64px;margin-top:24px">🏆</div>
    <h1>Тренировка завершена!</h1>
    <div class="sub">${esc(e.title)} · ${fmtDate(e.finishedAt, true)}</div>
    <div class="stat">
      <div><b>${fmtTime((e.finishedAt - e.startedAt) / 1000)}</b><span>время</span></div>
      <div><b>${sets}</b><span>подходов</span></div>
      <div><b>${Math.round(vol).toLocaleString('ru-RU')}</b><span>кг тоннаж</span></div>
    </div>
    <div class="card" style="text-align:left">${historyItems(e)}</div>
    <button class="btn primary block" data-act="home">На главную</button>
  </div>`;
}

function historyItems(e) {
  return e.items.map((it) => `<div class="hist-ex"><b>${esc(EX[it.ex] ? EX[it.ex].name : it.ex)}</b><br>
    <span class="muted">${it.cardio ? cardioText(it.cardio) : setsText(it.sets, it.ex)}</span></div>`).join('') || '<div class="muted">Нет выполненных подходов</div>';
}

function viewHistory() {
  let html = `<div class="topbar"><button class="icon-btn" data-act="back">←</button>
    <div class="title"><b>История</b><span class="sub">${store.history.length} тренировок</span></div></div><div class="wrap">`;
  if (!store.history.length) html += '<div class="card muted">Здесь появятся завершённые тренировки.</div>';
  for (const e of store.history) {
    html += `<details class="card hist-item"><summary class="row between">
        <div><b>${esc(e.title)}</b><div class="sub">${fmtDate(e.finishedAt, true)} · ${fmtTime((e.finishedAt - e.startedAt) / 1000)}</div></div><span class="muted">▾</span>
      </summary>${historyItems(e)}
      <button class="btn small ghost" style="margin-top:10px;color:var(--danger)" data-act="del-hist" data-id="${e.id}">Удалить запись</button>
    </details>`;
  }
  return html + '</div>';
}

// ---------- События ----------
document.addEventListener('click', (ev) => {
  const b = ev.target.closest('[data-act]');
  if (!b) return;
  unlockAudio();
  const act = b.dataset.act;
  const a = store.active;
  const it = a && a.items[a.idx];

  switch (act) {
    case 'open-day': go('day', b.dataset.id); break;
    case 'start': startWorkout(b.dataset.id); break;
    case 'resume': keepAwake(true); go('workout'); break;
    case 'discard':
      if (confirm('Сбросить незавершённую тренировку? Данные этой тренировки пропадут.')) { store.active = null; save(); keepAwake(false); render(); }
      break;
    case 'back': history.back(); break;
    case 'home': stopRestOverlayOnly(); go('home'); break;
    case 'history': go('history'); break;

    case 'prev': if (a.idx > 0) { a.idx--; save(); stopRestOverlayOnly(); render(); window.scrollTo(0, 0); } break;
    case 'next': if (a.idx < a.items.length - 1) { a.idx++; save(); stopRestOverlayOnly(); render(); window.scrollTo(0, 0); } break;
    case 'finish': {
      const anyDone = a.items.some((x) => x.cardio ? x.cardio.done : x.sets.some((s) => s.done));
      if (confirm(anyDone ? 'Завершить и сохранить тренировку?' : 'Ни один подход не отмечен. Всё равно завершить?')) { stopRest(); finishWorkout(); }
      break;
    }

    case 'variant': {
      const k = b.dataset.ex;
      if (k === it.ex) break;
      const dirty = it.sets.some((s) => s.done);
      if (dirty && !confirm('Отмеченные подходы сбросятся. Переключить упражнение?')) break;
      it.ex = k;
      it.sets = makeSets(dayById(a.dayId).items[it.slot], k);
      store.variant[variantKey(a.dayId, dayById(a.dayId).items[it.slot])] = k;
      save(); render();
      break;
    }
    case 'set-done': {
      readInputs();
      const i = +b.dataset.i, s = it.sets[i];
      const planItem = dayById(a.dayId).items[it.slot];
      if (!s.done) {
        if (s.r === '') {
          const inp = document.querySelector(`input[data-field="r"][data-i="${i}"]`);
          s.r = inp ? inp.placeholder : maxReps(planItem.reps);
        }
        s.done = true;
        save(); render();
        const allDone = it.sets.every((x) => x.done);
        if (!(allDone && a.idx === a.items.length - 1)) startRest(planItem.rest);
      } else {
        s.done = false; save(); render();
      }
      break;
    }
    case 'add-set': readInputs(); { const l = it.sets[it.sets.length - 1]; it.sets.push({ w: l ? l.w : '', r: '', done: false }); } save(); render(); break;
    case 'rm-set': readInputs(); if (it.sets.length > 1) it.sets.pop(); save(); render(); break;
    case 'work-timer': startRest(+maxReps(dayById(a.dayId).items[it.slot].reps) || 40, 'work'); break;
    case 'rest-now': startRest(dayById(a.dayId).items[it.slot].rest || 90); break;
    case 'rest-add':
      if (a.rest) {
        a.rest.endAt += (+b.dataset.s) * 1000;
        a.rest.total = Math.max(1, a.rest.total + (+b.dataset.s));
        if (a.rest.endAt > Date.now()) { a.rest.alerted = false; const el = $('#rest'); if (el) { el.classList.remove('over'); $('#rest-label').textContent = restLabel(a.rest, false); } }
        save(); tick();
      }
      break;
    case 'rest-skip': stopRest(); break;

    case 'cardio-start': {
      readInputs();
      const c = it.cardio;
      const sec = c.timerLeft != null && c.timerLeft > 0 ? c.timerLeft : (num(c.min) || 0) * 60;
      if (sec > 0) { c.timerEnd = Date.now() + sec * 1000; c.timerLeft = null; save(); render(); }
      break;
    }
    case 'cardio-stop': { const c = it.cardio; c.timerLeft = Math.max(0, Math.ceil((c.timerEnd - Date.now()) / 1000)); c.timerEnd = null; save(); render(); break; }
    case 'cardio-reset': { const c = it.cardio; c.timerLeft = null; c.timerEnd = null; save(); render(); break; }
    case 'cardio-done': readInputs(); it.cardio.done = !it.cardio.done; save(); render(); break;

    case 'del-hist':
      if (confirm('Удалить эту тренировку из истории?')) {
        store.history = store.history.filter((x) => String(x.id) !== b.dataset.id);
        save(); render();
      }
      break;
    case 'export': exportData(); break;
    case 'import': importData(); break;
  }
});

function stopRestOverlayOnly() {
  // Таймер продолжает идти в данных; убираем только панель, вернётся на экране тренировки.
  const el = $('#rest'); if (el) el.remove();
}

// Значения полей сохраняем сразу, без перерисовки, чтобы не терять фокус.
document.addEventListener('input', (ev) => {
  const t = ev.target;
  const a = store.active;
  if (!a) return;
  const it = a.items[a.idx];
  if (t.dataset.field && it.sets) {
    const i = +t.dataset.i;
    it.sets[i][t.dataset.field] = t.value;
    // Рабочий вес переносим на следующие неотмеченные подходы.
    if (t.dataset.field === 'w') {
      for (let j = i + 1; j < it.sets.length; j++) {
        if (it.sets[j].done) continue;
        it.sets[j].w = t.value;
        const inp = document.querySelector(`input[data-field="w"][data-i="${j}"]`);
        if (inp) inp.value = t.value;
      }
    }
    save();
  } else if (t.dataset.cardio && it.cardio) {
    it.cardio[t.dataset.cardio] = t.value;
    save();
    if (t.dataset.cardio === 'min' && !it.cardio.timerEnd && !(it.cardio.timerLeft > 0)) {
      const btn = document.querySelector('[data-act="cardio-start"]');
      const m = num(t.value);
      if (btn) { btn.disabled = !m; btn.textContent = '▶ Таймер на ' + (m ? fmtNum(m) + ' мин' : '…'); }
    }
  }
});
document.addEventListener('focusin', (ev) => {
  if (ev.target.classList && ev.target.classList.contains('num')) setTimeout(() => ev.target.select(), 0);
});

function readInputs() {
  const a = store.active; if (!a) return;
  const it = a.items[a.idx];
  document.querySelectorAll('input[data-field]').forEach((inp) => { if (it.sets && it.sets[+inp.dataset.i]) it.sets[+inp.dataset.i][inp.dataset.field] = inp.value; });
  document.querySelectorAll('input[data-cardio]').forEach((inp) => { if (it.cardio) it.cardio[inp.dataset.cardio] = inp.value; });
}

// ---------- Резервная копия ----------
function exportData() {
  const blob = new Blob([JSON.stringify(store, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url; link.download = 'trenirovki-' + new Date().toISOString().slice(0, 10) + '.json';
  document.body.appendChild(link); link.click(); link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function importData() {
  const inp = document.createElement('input');
  inp.type = 'file'; inp.accept = 'application/json,.json';
  inp.onchange = async () => {
    try {
      const data = JSON.parse(await inp.files[0].text());
      if (!data || !Array.isArray(data.history)) throw new Error();
      if (!confirm('Заменить текущие данные данными из файла?')) return;
      store = migrate(Object.assign(blank(), data)); save(); render(); toast('Данные восстановлены');
    } catch (e) { alert('Не удалось прочитать файл'); }
  };
  inp.click();
}

// ---------- Старт ----------
store = load();
history.replaceState(view, '');
if (store.active) view = { name: 'workout' }, history.replaceState(view, '');
render();
if (store.active) keepAwake(true);

if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
