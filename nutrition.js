'use strict';
// Раздел «Питание и прогресс»: экраны, ввод, фото, графики.
// Логика выводов — в analysis.js (чистые функции), здесь только интерфейс.

const A = Analysis;
const N = () => store.nutrition;
const todayKey = () => A.localKey();

// Быстрые кнопки белка: граммы и что это.
const PROTEIN_ADD = [
  { g: 25, label: 'мясо/курица' },
  { g: 6, label: 'яйцо' },
  { g: 18, label: 'пачка творога' },
  { g: 20, label: 'протеин' }
];
const ENERGY = ['😫', '😕', '😐', '🙂', '💪'];

function dayRec(key, create) {
  const days = N().days;
  if (!days[key] && create) days[key] = {};
  return days[key] || {};
}
function setDayField(key, field, value) {
  const d = dayRec(key, true);
  if (value == null) delete d[field]; else d[field] = value;
  if (!Object.keys(d).length) delete N().days[key];
  save();
}
function goals(today) {
  const s = N().settings;
  const weight = A.currentWeight(N().days, s, today);
  return { weight, protein: A.proteinGoal(s, weight), steps: A.stepsGoal(s), kcal: A.kcalHint(weight) };
}
function fmtDay(key) {
  const t = todayKey();
  if (key === t) return 'Сегодня';
  if (key === A.addDays(t, -1)) return 'Вчера';
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('ru-RU', { weekday: 'short', day: 'numeric', month: 'short' });
}

// ---------- Утреннее напоминание (баннер в приложении) ----------
// Push-уведомления без своего сервера невозможны, поэтому напоминаем при открытии приложения утром.
function morningReminder() {
  if (new Date().getHours() >= 12) return '';
  if (A.isNum(dayRec(todayKey()).weight)) return '';
  return `<button class="card remind" data-act="tab" data-view="nutrition">
    ⚖️ <b>Доброе утро! Взвесься натощак</b><span class="sub">после туалета, до еды и воды — так цифры честнее</span></button>`;
}

// ---------- Главный экран раздела ----------
function viewNutrition(arg) {
  const today = todayKey();
  const date = arg && arg <= today ? arg : today;
  const d = dayRec(date);
  const g = goals(today);
  const streak = A.streak(N().days, today);

  let html = `<div class="wrap">
    ${demoBanner()}${homeTabs('nutrition')}
    <div class="row between"><h1>Питание и прогресс</h1>
      <button class="icon-btn" data-act="n-settings" aria-label="Настройки">⚙️</button></div>
    <div class="sub">Цель: рекомпозиция — минус жир, плюс мышцы</div>
    ${date === today ? morningReminder() : ''}
    ${typeof verdictCard === 'function' ? verdictCard(today) : ''}`;

  // --- Ввод за день ---
  html += `<div class="card">
    <div class="row between">
      <button class="icon-btn" data-act="n-date" data-d="${A.addDays(date, -1)}" aria-label="Предыдущий день">‹</button>
      <div style="text-align:center"><b>${esc(fmtDay(date))}</b>
        <div class="sub">${streak ? `🔥 ${streak} ${plural(streak, 'день', 'дня', 'дней')} подряд` : 'начни серию сегодня'}</div></div>
      <button class="icon-btn" data-act="n-date" data-d="${A.addDays(date, 1)}" ${date >= today ? 'disabled style="opacity:.3"' : ''} aria-label="Следующий день">›</button>
    </div>

    <div class="field" style="margin-top:14px"><label>⚖️ Вес утром натощак, кг</label>
      <input class="num ${!A.isNum(d.weight) && date === today ? 'need' : ''}" inputmode="decimal" data-n="weight" data-date="${date}" value="${fmtNum(d.weight)}" placeholder="${fmtNum(g.weight) || '—'}"></div>

    <div style="margin-top:16px">${proteinBlock(date, d, g)}</div>

    <div class="grid3" style="margin-top:16px">
      <div class="field"><label>👟 Шаги</label>
        <input class="num" inputmode="numeric" data-n="steps" data-date="${date}" value="${fmtNum(d.steps)}" placeholder="${g.steps}"></div>
      <div class="field"><label>🔥 Ккал (необяз.)</label>
        <input class="num" inputmode="numeric" data-n="kcal" data-date="${date}" value="${fmtNum(d.kcal)}" placeholder="${g.kcal ? '≈' + g.kcal : '—'}"></div>
    </div>

    <div class="field" style="margin-top:16px"><label>Самочувствие и энергия</label>
      <div class="energy">${ENERGY.map((e, i) =>
        `<button class="${d.energy === i + 1 ? 'on' : ''}" data-act="n-energy" data-date="${date}" data-v="${i + 1}">${e}<small>${i + 1}</small></button>`).join('')}</div>
    </div>
  </div>`;

  html += weeklyCard(date, today);
  html += typeof chartsBlock === 'function' ? chartsBlock(today) : '';
  html += `<div class="footer-links">
      <button class="btn ghost small" data-act="n-settings">⚙️ Настройки и цели</button>
      ${isDemo() ? '' : '<button class="btn ghost small" data-act="n-demo">🧪 Посмотреть демо</button>'}
    </div></div>`;
  setTimeout(hydratePhotos, 0);
  return html;
}

function plural(n, one, few, many) {
  const m10 = n % 10, m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return one;
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return few;
  return many;
}

function proteinBlock(date, d, g) {
  const p = A.isNum(d.protein) ? d.protein : 0;
  const goal = g.protein;
  const pct = goal ? Math.min(100, Math.round((p / goal) * 100)) : 0;
  return `<div class="row between"><label class="sub">🥩 Белок за день</label>
      <span id="p-total"><b>${fmtNum(p)}</b>${goal ? ` / ${goal} г` : ' г'}</span></div>
    <div class="pbar"><i id="p-bar" style="width:${pct}%" class="${pct >= 100 ? 'full' : ''}"></i></div>
    <div class="qbtns">${PROTEIN_ADD.map((x) =>
      `<button class="btn small" data-act="n-protein" data-date="${date}" data-v="${x.g}">+${x.g} г<small>${x.label}</small></button>`).join('')}</div>
    <div class="row" style="margin-top:8px;gap:8px">
      <input class="num" style="max-width:none;flex:1" inputmode="numeric" data-n="protein" data-date="${date}" value="${fmtNum(d.protein)}" placeholder="или введи вручную, г">
      ${p ? `<button class="btn small ghost" data-act="n-protein-undo" data-date="${date}">↶ Отменить</button>` : ''}
    </div>
    ${goal ? '' : '<div class="sub" style="margin-top:6px">Введи вес — посчитаю цель по белку (1,8 г × вес)</div>'}`;
}

// Обновляет полоску белка без перерисовки экрана (чтобы не терять фокус в поле).
function refreshProtein(date) {
  const d = dayRec(date), g = goals(todayKey());
  const p = A.isNum(d.protein) ? d.protein : 0;
  const pct = g.protein ? Math.min(100, Math.round((p / g.protein) * 100)) : 0;
  const t = $('#p-total'), bar = $('#p-bar');
  if (t) t.innerHTML = `<b>${fmtNum(p)}</b>${g.protein ? ` / ${g.protein} г` : ' г'}`;
  if (bar) { bar.style.width = pct + '%'; bar.classList.toggle('full', pct >= 100); }
}

// ---------- Вердикт недели ----------
const STATUS = {
  green: { dot: '🟢', label: 'Всё идёт по плану' },
  yellow: { dot: '🟡', label: 'Нужна небольшая корректировка' },
  red: { dot: '🔴', label: 'Требует внимания' },
  gray: { dot: '⚪', label: 'Анализ недели' }
};
// Упражнения на время и кардио не участвуют в оценке силы.
const strengthExclude = () => Object.keys(EX).filter((k) => EX[k].timed || k === 'treadmill');

function runAnalysis(today) {
  const n = N();
  return A.analyze({ days: n.days, waist: n.waist, settings: n.settings, history: store.history, today, exclude: strengthExclude() });
}
const signed = (x, unit) => (x == null ? '—' : (x > 0 ? '+' : x < 0 ? '−' : '±') + fmtNum(Math.abs(x)) + unit);

function verdictCard(today) {
  const v = runAnalysis(today);
  const f = v.facts, st = STATUS[v.status];
  let html = `<div class="card verdict ${v.status}">
    <div class="status">${st.dot} Вердикт недели · ${esc(st.label)}</div>
    <div class="main">${esc(v.title)}</div>`;
  if (v.id === 'collecting') {
    const pct = Math.min(100, Math.round((Math.min(f.status.span / A.THRESHOLDS.MIN_SPAN, f.status.weighIns / A.THRESHOLDS.MIN_WEIGHINS)) * 100));
    html += `<div class="pbar"><i class="full" style="width:${pct}%"></i></div>`;
  }
  html += `<div class="sub" style="margin-top:4px">Почему:</div><ul>${v.why.map((w) => `<li>${esc(w)}</li>`).join('')}</ul>`;
  if (v.actions.length) html += `<div class="sub" style="margin-top:8px">Что делать:</div><ul>${v.actions.map((w) => `<li>${esc(w)}</li>`).join('')}</ul>`;
  html += v.warnings.map((w) => `<div class="warn-line">${w.id === 'protein' ? '🥩' : '👟'} ${esc(w.text)}</div>`).join('');

  if (f.weekly.thisWeek != null) {
    const sArrow = { up: '↑ растёт', flat: '→ держится', down: '↓ падает', unknown: '— мало данных' }[f.strength.trend];
    html += `<div class="kpis">
      <div><b>${fmtNum(A.round(f.weekly.thisWeek, 1))} кг</b><span>неделя ${signed(f.weekly.delta, ' кг')}</span></div>
      <div><b>${f.waist.latest != null ? fmtNum(f.waist.latest) + ' см' : '—'}</b><span>талия ${f.waist.trend === 'unknown' ? '' : signed(f.waist.delta, ' см')}</span></div>
      <div><b>${sArrow}</b><span>сила${f.strength.compared ? ` · ${f.strength.ups}↑ ${f.strength.downs}↓ из ${f.strength.compared}` : ''}</span></div>
    </div>`;
  }
  if (f.strength.list.length) {
    const rows = [...f.strength.list].sort((a, b) => b.change - a.change).map((x) =>
      `<div class="row between" style="font-size:13px;padding:3px 0"><span>${esc(EX[x.ex] ? EX[x.ex].name : x.ex)}</span>
        <span style="color:${x.dir === 'up' ? 'var(--accent)' : x.dir === 'down' ? 'var(--danger)' : 'var(--muted)'}">${signed(A.round(x.change * 100, 1), '%')}</span></div>`).join('');
    html += `<details style="margin-top:10px"><summary class="sub">Сила по упражнениям: 2 недели к 2 предыдущим</summary>${rows}</details>`;
  }
  return html + '</div>';
}

// ---------- Графики (SVG, без библиотек — работает офлайн) ----------
function chartsBlock(today) {
  const n = N();
  const weighed = Object.keys(n.days).filter((k) => A.isNum(n.days[k].weight)).sort();
  let html = '';
  if (weighed.length) {
    const from = [weighed[0], A.addDays(today, -41)].sort()[1]; // не больше 6 недель
    html += `<div class="card"><b>⚖️ Вес</b><div class="sub">точки — дни, линия — среднее за 7 дней</div>
      ${weightChart(A.weightSeries(n.days, from, today))}
      <div class="legend"><span><i style="background:var(--muted)"></i>вес утром</span><span><i style="background:var(--accent)"></i>среднее 7 дней</span></div></div>`;
  }
  html += `<div class="card"><b>📏 Талия по неделям</b>${waistChart(n.waist, today)}</div>`;
  return html;
}

function scaler(values, h, pad) {
  let lo = Math.min(...values), hi = Math.max(...values);
  if (hi - lo < 1) { const m = (hi + lo) / 2; lo = m - 0.5; hi = m + 0.5; }
  const span = hi - lo; lo -= span * 0.1; hi += span * 0.1;
  return { lo, hi, y: (v) => pad.t + (1 - (v - lo) / (hi - lo)) * (h - pad.t - pad.b) };
}
function shortDate(key) {
  const [, m, d] = key.split('-').map(Number);
  return `${d}.${String(m).padStart(2, '0')}`;
}
function gridAndAxis(sc, W, H, pad, labels) {
  let g = '';
  for (let i = 0; i <= 2; i++) {
    const v = sc.lo + ((sc.hi - sc.lo) * i) / 2, y = sc.y(v);
    g += `<line x1="${pad.l}" x2="${W - pad.r}" y1="${y}" y2="${y}" stroke="var(--line)" stroke-width="1"/>
      <text x="${pad.l - 6}" y="${y + 4}" text-anchor="end" font-size="10" fill="var(--muted)">${fmtNum(A.round(v, 1))}</text>`;
  }
  // Крайние подписи прижимаем к краям, чтобы не обрезались.
  for (const [x, t] of labels) {
    const anchor = x <= pad.l + 12 ? 'start' : x >= W - pad.r - 12 ? 'end' : 'middle';
    g += `<text x="${x}" y="${H - 4}" text-anchor="${anchor}" font-size="10" fill="var(--muted)">${t}</text>`;
  }
  return g;
}

function weightChart(series) {
  const W = 340, H = 170, pad = { l: 34, r: 8, t: 10, b: 20 };
  const vals = series.flatMap((p) => [p.weight, p.avg]).filter(A.isNum);
  if (!vals.length) return '';
  const sc = scaler(vals, H, pad);
  const x = (i) => pad.l + (series.length === 1 ? 0.5 : i / (series.length - 1)) * (W - pad.l - pad.r);
  const dots = series.map((p, i) => (A.isNum(p.weight) ? `<circle cx="${x(i)}" cy="${sc.y(p.weight)}" r="2.6" fill="var(--muted)"/>` : '')).join('');
  // Линию среднего рвём там, где среднего нет.
  let path = '', open = false;
  series.forEach((p, i) => {
    if (A.isNum(p.avg)) { path += `${open ? 'L' : 'M'}${x(i).toFixed(1)},${sc.y(p.avg).toFixed(1)} `; open = true; } else open = false;
  });
  const last = series.length - 1, mid = Math.floor(last / 2);
  const labels = [[x(0), shortDate(series[0].date)], [x(mid), shortDate(series[mid].date)], [x(last), shortDate(series[last].date)]];
  return `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="График веса">
    ${gridAndAxis(sc, W, H, pad, last ? labels : [labels[0]])}${dots}
    <path d="${path}" fill="none" stroke="var(--accent)" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round"/></svg>`;
}

// Талия: последний замер каждой недели (неделя — с понедельника).
function waistChart(waist, today) {
  const byWeek = {};
  for (const k of Object.keys(waist).filter((k) => k <= today && A.isNum(waist[k])).sort()) {
    const [y, m, d] = k.split('-').map(Number);
    const wd = (new Date(y, m - 1, d).getDay() + 6) % 7; // 0 = понедельник
    byWeek[A.addDays(k, -wd)] = waist[k];
  }
  const weeks = Object.keys(byWeek).sort().slice(-12);
  if (weeks.length < 2) return `<div class="sub" style="margin-top:6px">${weeks.length ? 'Есть 1 замер — график появится после второго.' : 'Замерь талию раз в неделю — здесь появится график.'}</div>`;
  const W = 340, H = 150, pad = { l: 34, r: 14, t: 16, b: 20 };
  const vals = weeks.map((w) => byWeek[w]);
  const sc = scaler(vals, H, pad);
  const x = (i) => pad.l + (i / (weeks.length - 1)) * (W - pad.l - pad.r);
  const pts = weeks.map((w, i) => `${x(i).toFixed(1)},${sc.y(byWeek[w]).toFixed(1)}`).join(' ');
  const labels = weeks.map((w, i) => [x(i), shortDate(w)]).filter((_, i) => weeks.length <= 6 || i % 2 === (weeks.length - 1) % 2);
  return `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="График талии">
    ${gridAndAxis(sc, W, H, pad, labels)}
    <polyline points="${pts}" fill="none" stroke="#60a5fa" stroke-width="2.5" stroke-linejoin="round"/>
    ${weeks.map((w, i) => `<circle cx="${x(i)}" cy="${sc.y(byWeek[w])}" r="4" fill="#60a5fa"/>
      <text x="${x(i)}" y="${sc.y(byWeek[w]) - 8}" text-anchor="middle" font-size="10" fill="var(--text)">${fmtNum(byWeek[w])}</text>`).join('')}
  </svg><div class="sub">подпись — понедельник недели замера</div>`;
}

// ---------- Еженедельное: талия и фото ----------
function weeklyCard(date, today) {
  const waist = N().waist;
  const keys = Object.keys(waist).sort();
  const lastKey = keys.filter((k) => k <= date).pop();
  const ago = lastKey ? A.daysBetween(lastKey, today) : null;
  const due = ago == null || ago >= 7;
  const photos = N().photos.filter((p) => p.date === date);
  return `<div class="card">
    <div class="row between"><b>📏 Раз в неделю</b>
      ${due && date === today ? '<span class="badge" style="background:var(--warn);color:#2b1d00">пора замерить</span>' : ''}</div>
    <div class="sub" style="margin:4px 0 10px">${lastKey ? `Последний замер: ${fmtNum(waist[lastKey])} см · ${esc(fmtDay(lastKey).toLowerCase())}` : 'Замеров талии ещё нет'}</div>
    <div class="field"><label>Обхват талии на уровне пупка, см (${esc(fmtDay(date).toLowerCase())})</label>
      <input class="num" inputmode="decimal" data-waist="${date}" value="${fmtNum(waist[date])}" placeholder="${lastKey ? fmtNum(waist[lastKey]) : 'см'}"></div>
    <div class="sub" style="margin-top:6px">Мерь утром, на выдохе, не втягивая живот, лента параллельно полу.</div>
    <div class="row" style="margin-top:12px;gap:8px;flex-wrap:wrap">
      ${photos.map((p) => `<button class="thumb" data-act="n-photo-open" data-id="${p.id}"><img data-photo-id="${p.id}" alt="Фото прогресса"></button>`).join('')}
      <label class="btn small ghost">📷 Фото прогресса<input type="file" accept="image/*" data-photo-date="${date}" hidden></label>
    </div>
    ${N().photos.length ? `<button class="btn small ghost" style="margin-top:8px" data-act="n-photos">🖼 Все фото (${N().photos.length})</button>` : ''}
  </div>`;
}

// ---------- Фото: IndexedDB ----------
// localStorage вмещает ~5 МБ, поэтому снимки лежат в IndexedDB, сжатые до ~1080 px.
const Photos = (() => {
  const dbName = () => (isDemo() ? 'gym-photos-demo' : 'gym-photos');
  let dbp = null, dbFor = null;
  function db() {
    if (dbp && dbFor === dbName()) return dbp;
    dbFor = dbName();
    dbp = new Promise((res, rej) => {
      const r = indexedDB.open(dbFor, 1);
      r.onupgradeneeded = () => r.result.createObjectStore('photos');
      r.onsuccess = () => res(r.result);
      r.onerror = () => rej(r.error);
    });
    return dbp;
  }
  async function tx(mode, fn) {
    const d = await db();
    return new Promise((res, rej) => {
      const t = d.transaction('photos', mode);
      const req = fn(t.objectStore('photos'));
      t.oncomplete = () => res(req && req.result);
      t.onerror = () => rej(t.error);
    });
  }
  const put = (id, data) => tx('readwrite', (s) => s.put(data, id));
  const get = (id) => tx('readonly', (s) => s.get(id));
  const del = (id) => tx('readwrite', (s) => s.delete(id));
  async function compress(file, max = 1080) {
    const img = await createImageBitmap(file);
    const k = Math.min(1, max / Math.max(img.width, img.height));
    const c = document.createElement('canvas');
    c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
    c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
    return c.toDataURL('image/jpeg', 0.8);
  }
  async function exportAll(list) {
    const out = {};
    for (const p of list || []) { try { const d = await get(p.id); if (d) out[p.id] = d; } catch (e) {} }
    return out;
  }
  async function importAll(map) {
    for (const [id, data] of Object.entries(map || {})) { try { await put(id, data); } catch (e) {} }
  }
  return { put, get, del, compress, exportAll, importAll };
})();

function hydratePhotos() {
  document.querySelectorAll('img[data-photo-id]:not([src])').forEach(async (img) => {
    try { const d = await Photos.get(img.dataset.photoId); if (d) img.src = d; } catch (e) {}
  });
}

function viewPhotos() {
  const list = [...N().photos].sort((a, b) => (a.date < b.date ? 1 : -1));
  setTimeout(hydratePhotos, 0);
  return `<div class="topbar"><button class="icon-btn" data-act="back">←</button>
    <div class="title"><b>Фото прогресса</b><span class="sub">${list.length} шт.</span></div></div>
    <div class="wrap"><div class="photo-grid">${list.map((p) =>
      `<button class="thumb big" data-act="n-photo-open" data-id="${p.id}"><img data-photo-id="${p.id}" alt=""><span>${esc(fmtDay(p.date))}</span></button>`).join('') || '<div class="muted">Пока нет фото.</div>'}
    </div></div>`;
}

async function openPhoto(id) {
  const p = N().photos.find((x) => x.id === id);
  const data = await Photos.get(id).catch(() => null);
  const el = document.createElement('div');
  el.className = 'photo-view';
  el.innerHTML = `<img src="${data || ''}" alt="">
    <div class="row" style="justify-content:center;gap:10px">
      <span class="sub">${p ? esc(fmtDay(p.date)) : ''}</span>
      <button class="btn small" data-close>Закрыть</button>
      <button class="btn small ghost" style="color:var(--danger)" data-del>Удалить</button></div>`;
  el.addEventListener('click', async (e) => {
    if (e.target.closest('[data-del]')) {
      if (!confirm('Удалить это фото?')) return;
      await Photos.del(id).catch(() => {});
      N().photos = N().photos.filter((x) => x.id !== id); save();
      el.remove(); render();
    } else if (e.target.closest('[data-close]') || e.target === el) el.remove();
  });
  document.body.appendChild(el);
}

document.addEventListener('change', async (ev) => {
  const t = ev.target;
  if (!t.dataset || !t.dataset.photoDate || !t.files || !t.files[0]) return;
  try {
    const data = await Photos.compress(t.files[0]);
    const id = 'p' + Date.now().toString(36);
    await Photos.put(id, data);
    N().photos.push({ id, date: t.dataset.photoDate }); save();
    toast('Фото сохранено'); render();
  } catch (e) { alert('Не удалось сохранить фото'); }
});

// ---------- Настройки ----------
function viewNutriSettings() {
  const s = N().settings, today = todayKey(), g = goals(today);
  const f = (key, label, ph, mode = 'decimal', hint = '') => `<div class="field" style="margin-top:12px"><label>${label}</label>
    <input class="num" style="max-width:none" inputmode="${mode}" data-ns="${key}" value="${fmtNum(s[key])}" placeholder="${ph}">
    ${hint ? `<div class="sub" style="margin-top:4px">${hint}</div>` : ''}</div>`;
  const autoProtein = A.isNum(g.weight) ? Math.round(g.weight * A.PROTEIN_PER_KG) : null;
  return `<div class="topbar"><button class="icon-btn" data-act="back">←</button>
    <div class="title"><b>Настройки и цели</b><span class="sub">питание и прогресс</span></div></div>
    <div class="wrap"><div class="card">
      ${f('weight', 'Текущий вес, кг', 'например 78', 'decimal', 'Когда накопится неделя взвешиваний, для расчётов берётся среднее за 7 дней.')}
      ${f('height', 'Рост, см', 'например 180', 'numeric')}
      ${f('proteinGoal', 'Цель по белку, г/день', autoProtein ? `авто: ${autoProtein}` : 'авто: 1,8 × вес', 'numeric', 'Пусто — считается автоматически: 1,8 г × вес.')}
      ${f('stepsGoal', 'Цель по шагам', String(A.DEFAULT_STEPS), 'numeric')}
    </div>
    <div class="card">
      <b>🔥 Ориентир калорий</b>
      <div style="font-size:28px;font-weight:700;margin:6px 0">${g.kcal ? '≈ ' + g.kcal.toLocaleString('ru-RU') + ' ккал' : '—'}</div>
      <div class="sub">Вес × 30 − 250 — только стартовая подсказка. Считать калории не обязательно:
        дальше ориентируйся на вердикт недели, он скажет, когда что-то менять.</div>
    </div></div>`;
}

// ---------- Демо ----------
function viewDemo() {
  return `<div class="topbar"><button class="icon-btn" data-act="back">←</button>
    <div class="title"><b>Демо-режим</b><span class="sub">4 недели тестовых данных</span></div></div>
    <div class="wrap">
      <div class="sub" style="margin-bottom:8px">Выбери сценарий — приложение заполнится тестовыми данными (питание и тренировки),
        и ты увидишь, что скажет анализ. Твои настоящие данные хранятся отдельно и не изменятся.</div>
      ${Seed.SCENARIOS.map((s) => `<button class="card day-card" data-act="demo-start" data-s="${s.id}">
        <b>${esc(s.title)}</b><div class="sub">${esc(s.desc)}</div></button>`).join('')}
    </div>`;
}

// ---------- Регистрация в app.js ----------
VIEWS.nutrition = viewNutrition;
VIEWS['nutri-settings'] = viewNutriSettings;
VIEWS['nutri-photos'] = viewPhotos;
VIEWS['nutri-demo'] = viewDemo;

Object.assign(ACTIONS, {
  'n-date': (b) => { view = { name: 'nutrition', arg: b.dataset.d }; history.replaceState(view, ''); render(); },
  'n-protein': (b) => {
    const d = dayRec(b.dataset.date, true);
    const add = +b.dataset.v;
    d.protein = (A.isNum(d.protein) ? d.protein : 0) + add;
    (d.proteinLog = d.proteinLog || []).push(add);
    save(); render();
    toast(`+${add} г белка`);
  },
  'n-protein-undo': (b) => {
    const d = dayRec(b.dataset.date);
    const last = d.proteinLog && d.proteinLog.length ? d.proteinLog.pop() : d.protein;
    const left = Math.max(0, (d.protein || 0) - (last || 0));
    setDayField(b.dataset.date, 'protein', left || null);
    render();
  },
  'n-energy': (b) => {
    const v = +b.dataset.v, d = dayRec(b.dataset.date);
    setDayField(b.dataset.date, 'energy', d.energy === v ? null : v);
    render();
  },
  'n-settings': () => go('nutri-settings'),
  'n-photos': () => go('nutri-photos'),
  'n-photo-open': (b) => openPhoto(b.dataset.id),
  'n-demo': () => go('nutri-demo'),
  'demo-start': (b) => {
    const data = Seed.build(b.dataset.s, todayKey());
    try {
      localStorage.setItem('gym.demo', JSON.stringify(data));
      localStorage.setItem(MODE_KEY, 'demo');
    } catch (e) { alert('Не удалось включить демо'); return; }
    store = load();
    view = { name: 'nutrition', arg: null }; history.replaceState(view, ''); render(); window.scrollTo(0, 0);
  }
});

// Поля ввода раздела: сохраняем сразу, без перерисовки.
INPUT_HOOKS.push((t) => {
  if (t.dataset.n) {
    const v = num(t.value);
    setDayField(t.dataset.date, t.dataset.n, v);
    if (t.dataset.n === 'protein') { const d = dayRec(t.dataset.date); if (d.proteinLog) delete d.proteinLog; save(); refreshProtein(t.dataset.date); }
    if (t.dataset.n === 'weight') t.classList.remove('need');
    return true;
  }
  if (t.dataset.waist) {
    const v = num(t.value), w = N().waist;
    if (v == null) delete w[t.dataset.waist]; else w[t.dataset.waist] = v;
    save();
    return true;
  }
  if (t.dataset.ns) {
    N().settings[t.dataset.ns] = num(t.value);
    save();
    return true;
  }
  return false;
});
