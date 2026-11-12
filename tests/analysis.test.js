// Тесты логики «Питание и прогресс». Запуск: node --test tests/
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const A = require('../analysis.js');
const Seed = require('../seed.js');

const TODAY = '2026-11-12';
const EXCLUDE = ['farmer_walk', 'dead_hang', 'treadmill'];

// ---------- Конструктор данных без шума — для точных проверок правил ----------
// slope — кг/нед; waistSlope — см/нед; strength — прирост рабочего веса за неделю.
function make({ days: n = 28, start = 80, slope = 0, waistSlope = 0, strength = 0, protein = 150, steps = 9000, skip = [], noWaist = false, exercises = 4 } = {}) {
  const days = {}, waist = {}, history = [];
  const first = A.addDays(TODAY, -(n - 1));
  for (let i = 0; i < n; i++) {
    const k = A.addDays(first, i);
    const d = {};
    if (!skip.includes(k)) d.weight = Math.round((start + (slope * i) / 7) * 100) / 100;
    if (k !== TODAY) {
      d.protein = typeof protein === 'function' ? protein(k) : protein;
      if (steps != null) d.steps = steps;
    }
    days[k] = d;
  }
  if (!noWaist) for (let i = n - 7; i >= 0; i -= 7) waist[A.addDays(first, i)] = 86 + (waistSlope * i) / 7;
  // Тренировки каждые 2 дня
  for (let i = 0; i < n - 1; i += 2) {
    const k = A.addDays(first, i);
    const [y, m, d] = k.split('-').map(Number);
    const f = 1 + (strength * i) / 7;
    const items = [];
    for (let e = 0; e < exercises; e++) items.push({ ex: 'ex' + e, sets: [{ w: 50 * f, r: 10 }] });
    items.push({ ex: 'farmer_walk', sets: [{ w: 20, r: 40 }] });
    history.push({ finishedAt: new Date(y, m - 1, d, 19).getTime(), items });
  }
  return { days, waist, history, settings: { weight: start, stepsGoal: 8000, proteinGoal: 140 }, today: TODAY, exclude: EXCLUDE };
}
const verdict = (opts) => A.analyze(make(opts));

// ---------- Базовые функции ----------
test('скользящее среднее за 7 дней игнорирует пропущенные дни', () => {
  const days = { '2026-11-06': { weight: 80 }, '2026-11-08': { weight: 81 }, '2026-11-12': { weight: 82 }, '2026-11-05': { weight: 99 } };
  const a = A.weightAvg(days, '2026-11-12', 7);
  assert.equal(a.count, 3);
  assert.equal(a.avg, 81); // 5 ноября вне окна
});

test('серия ввода не сгорает, пока сегодня ещё не введено', () => {
  const days = { '2026-11-09': { weight: 80 }, '2026-11-10': { protein: 100 }, '2026-11-11': { steps: 5000 } };
  assert.equal(A.streak(days, TODAY), 3);
  assert.equal(A.streak({ ...days, '2026-11-12': { weight: 80 } }, TODAY), 4);
  assert.equal(A.streak({ '2026-11-10': { weight: 80 } }, TODAY), 0);
});

test('цели: белок 1,8 × вес, ручная цель важнее; ориентир калорий вес × 30 − 250', () => {
  assert.equal(A.proteinGoal({}, 80), 144);
  assert.equal(A.proteinGoal({ proteinGoal: 130 }, 80), 130);
  assert.equal(A.kcalHint(80), 2150);
  assert.equal(A.stepsGoal({}), 8000);
});

test('условный максимум: с весом — формула Эпли, без веса — повторы', () => {
  assert.equal(A.e1rm(60, 10), 80);
  assert.equal(A.e1rm(null, 12), 12);
});

test('тренд силы: рост, падение, упражнения на время не учитываются', () => {
  assert.equal(A.strengthTrend(make({ strength: 0.03 }).history, TODAY, EXCLUDE).trend, 'up');
  assert.equal(A.strengthTrend(make({ strength: -0.03 }).history, TODAY, EXCLUDE).trend, 'down');
  assert.equal(A.strengthTrend(make({ strength: 0 }).history, TODAY, EXCLUDE).trend, 'flat');
  const t = A.strengthTrend(make({ strength: 0.03 }).history, TODAY, EXCLUDE);
  assert.ok(!t.list.some((x) => x.ex === 'farmer_walk'));
  assert.equal(A.strengthTrend([], TODAY, EXCLUDE).trend, 'unknown');
});

test('талия сравнивается с замером минимум 10 дней назад', () => {
  const w = A.waistTrend({ '2026-10-29': 86, '2026-11-05': 85.6, '2026-11-12': 85 }, TODAY);
  assert.equal(w.trend, 'down');
  assert.equal(w.delta, -1);
  assert.equal(A.waistTrend({ '2026-11-12': 85 }, TODAY).trend, 'unknown');
  assert.equal(A.waistTrend({ '2026-10-01': 85, '2026-10-15': 84 }, TODAY).trend, 'unknown'); // старые замеры
});

// ---------- Качество данных ----------
test('меньше 14 дней данных → «Собираем данные»', () => {
  const v = verdict({ days: 10, slope: -0.4 });
  assert.equal(v.id, 'collecting');
  assert.equal(v.title, 'Собираем данные, продолжай вводить');
});

test('14 дней, но меньше 10 взвешиваний → ещё собираем', () => {
  const skip = [3, 5, 7, 9, 11].map((i) => A.addDays(TODAY, -i));
  assert.equal(verdict({ days: 14, skip }).id, 'collecting');
});

test('больше 3 пропусков веса за неделю → говорим о данных, а не делаем выводы', () => {
  const skip = [1, 2, 3, 5].map((i) => A.addDays(TODAY, -i));
  const v = verdict({ slope: -1.5, skip }); // даже при «опасном» темпе
  assert.equal(v.id, 'gaps');
  assert.match(v.why[0], /пропущено 4/);
});

test('ровно 3 пропуска — анализ идёт', () => {
  const skip = [1, 2, 3].map((i) => A.addDays(TODAY, -i));
  assert.notEqual(verdict({ slope: -0.35, waistSlope: -0.3, strength: 0.02, skip }).id, 'gaps');
});

// ---------- Правила вывода ----------
test('вес −0,2…−0,5 кг/нед и сила растёт → «Всё идеально»', () => {
  const v = verdict({ slope: -0.35, waistSlope: -0.3, strength: 0.02 });
  assert.equal(v.id, 'ideal');
  assert.equal(v.status, 'green');
  assert.equal(v.title, 'Всё идеально, ничего не меняй');
});

test('вес −0,3 кг/нед и сила держится → тоже «Всё идеально»', () => {
  assert.equal(verdict({ slope: -0.3, strength: 0 }).id, 'ideal');
});

test('вес стоит, талия уменьшается, сила растёт → рекомпозиция', () => {
  const v = verdict({ slope: 0, waistSlope: -0.5, strength: 0.02 });
  assert.equal(v.id, 'recomp');
  assert.equal(v.status, 'green');
  assert.equal(v.title, 'Идёт рекомпозиция — это лучший сценарий, продолжай');
});

test('вес и талия стоят 2+ недели → убрать ~200 ккал и проверить белок и шаги', () => {
  const v = verdict({ slope: 0, waistSlope: 0 });
  assert.equal(v.id, 'stall');
  assert.equal(v.status, 'yellow');
  assert.equal(v.title, 'Убери ~200 ккал: одна порция углеводов или перекус');
  assert.ok(v.actions.some((a) => a.startsWith('Белок')));
  assert.ok(v.actions.some((a) => a.startsWith('Шаги')));
});

test('вес стоит только одну неделю → ждём, а не режем калории', () => {
  // первые 2 недели −0,4 кг/нед, последняя неделя ровно
  const m = make({ slope: -0.4 });
  const flatFrom = A.addDays(TODAY, -6), base = m.days[A.addDays(TODAY, -7)].weight;
  for (const k of A.range(flatFrom, TODAY)) m.days[k].weight = base;
  const v = A.analyze(m);
  assert.equal(v.id, 'flat_wait');
});

test('вес и талия растут → «Сократи порции»', () => {
  const v = verdict({ slope: 0.4, waistSlope: 0.4, strength: 0.01 });
  assert.equal(v.id, 'gain');
  assert.equal(v.status, 'red');
  assert.equal(v.title, 'Сократи порции, проверь перекусы и сладкое');
});

test('вес падает быстрее 0,7 кг/нед → «Слишком большой дефицит»', () => {
  const v = verdict({ slope: -1.0, waistSlope: -0.4, strength: 0.01 });
  assert.equal(v.id, 'too_fast');
  assert.equal(v.status, 'red');
  assert.equal(v.title, 'Слишком большой дефицит — ешь больше, иначе теряешь мышцы');
});

test('сила падает даже при идеальном весе → «Слишком большой дефицит»', () => {
  const v = verdict({ slope: -0.35, waistSlope: -0.3, strength: -0.03 });
  assert.equal(v.id, 'too_fast');
  assert.match(v.why[0], /Рабочие веса снизились/);
});

test('граница: −0,7 кг/нед ещё не «слишком быстро»', () => {
  assert.equal(verdict({ slope: -0.7, strength: 0.01 }).id, 'good_fast');
});

// ---------- Предупреждения ----------
test('белок ниже цели больше 3 дней из 7 → «Белок — приоритет №1»', () => {
  const low = new Set([1, 2, 4, 6].map((i) => A.addDays(TODAY, -i)));
  const v = verdict({ slope: -0.35, strength: 0.02, protein: (k) => (low.has(k) ? 100 : 150) });
  assert.equal(v.id, 'ideal'); // вердикт отдельно, предупреждение отдельно
  const w = v.warnings.find((x) => x.id === 'protein');
  assert.ok(w);
  assert.match(w.text, /^Белок — приоритет №1/);
});

test('белок ниже цели ровно 3 дня → без предупреждения', () => {
  const low = new Set([1, 2, 4].map((i) => A.addDays(TODAY, -i)));
  const v = verdict({ slope: -0.35, protein: (k) => (low.has(k) ? 100 : 150) });
  assert.ok(!v.warnings.some((x) => x.id === 'protein'));
});

test('шаги ниже цели → совет добавить ходьбу', () => {
  const v = verdict({ slope: -0.35, steps: 6000 });
  const w = v.warnings.find((x) => x.id === 'steps');
  assert.ok(w);
  assert.match(w.text, /Добавь ходьбу/);
  assert.ok(!verdict({ slope: -0.35, steps: 9000 }).warnings.some((x) => x.id === 'steps'));
});

test('сегодняшний (незавершённый) день не считается в белке', () => {
  const m = make({ slope: -0.35 });
  m.days[TODAY].protein = 10;
  assert.equal(A.habits(m.days, TODAY, { protein: 140 }).proteinLowDays, 0);
});

// ---------- Демо-сценарии (seed.js) ----------
test('демо-данные за 4 недели дают ожидаемые вердикты', () => {
  const expect = { ideal: 'ideal', recomp: 'recomp', stall: 'stall', gain: 'gain', too_fast: 'too_fast', collecting: 'collecting', gaps: 'gaps' };
  for (const s of Seed.SCENARIOS) {
    const data = Seed.build(s.id, TODAY);
    const n = data.nutrition;
    const v = A.analyze({ days: n.days, waist: n.waist, settings: n.settings, history: data.history, today: TODAY, exclude: EXCLUDE });
    assert.equal(v.id, expect[s.id], `сценарий ${s.id}: получили ${v.id} — ${v.title}`);
  }
  const stall = Seed.build('stall', TODAY).nutrition;
  const v = A.analyze({ days: stall.days, waist: stall.waist, settings: stall.settings, history: [], today: TODAY });
  assert.ok(v.warnings.some((w) => w.id === 'protein'));
  assert.ok(v.warnings.some((w) => w.id === 'steps'));
});
