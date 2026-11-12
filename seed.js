// Тестовые данные за 4 недели: питание, талия и тренировки.
// Используются в демо-режиме приложения и в тестах (tests/analysis.test.js) —
// поэтому то, что видно в демо, проверено тестами.
// Генератор детерминированный: один и тот же сценарий и дата дают одни и те же данные.
(function (root, factory) {
  const m = factory(typeof module === 'object' && module.exports ? require('./analysis.js') : root.Analysis);
  if (typeof module === 'object' && module.exports) module.exports = m;
  else root.Seed = m;
})(typeof self !== 'undefined' ? self : this, function (A) {
  'use strict';

  // weightPerWeek — кг/нед; waistPerWeek — см/нед; strength — прирост рабочих весов за неделю (доля).
  const SCENARIOS = [
    { id: 'ideal', title: '✅ Всё идеально', desc: 'Вес −0,35 кг/нед, талия уходит, сила растёт',
      weightPerWeek: -0.35, waistPerWeek: -0.3, strength: 0.02 },
    { id: 'recomp', title: '💪 Рекомпозиция', desc: 'Вес стоит, талия уменьшается, сила растёт',
      weightPerWeek: 0, waistPerWeek: -0.5, strength: 0.025 },
    { id: 'stall', title: '⏸ Застой', desc: 'Вес и талия стоят 3 недели, белок и шаги проседают',
      weightPerWeek: 0, waistPerWeek: 0, strength: 0, lowProteinDays: 4, steps: 5800 },
    { id: 'gain', title: '📈 Набор жира', desc: 'Вес и талия растут',
      weightPerWeek: 0.4, waistPerWeek: 0.4, strength: 0.01 },
    { id: 'too_fast', title: '⚠️ Слишком большой дефицит', desc: 'Вес −1 кг/нед, рабочие веса падают',
      weightPerWeek: -1.0, waistPerWeek: -0.4, strength: -0.03, energy: 2 },
    { id: 'collecting', title: '⏳ Первая неделя', desc: 'Данных всего 8 дней — анализ ещё не запущен',
      weightPerWeek: -0.3, waistPerWeek: -0.3, strength: 0.02, days: 8 },
    { id: 'gaps', title: '🕳 Пропуски', desc: 'На этой неделе взвешивался только 3 раза',
      weightPerWeek: -0.3, waistPerWeek: -0.3, strength: 0.02, gapsLastWeek: 4 }
  ];

  // Простой детерминированный генератор случайных чисел (mulberry32).
  function rng(seed) {
    let a = seed >>> 0;
    return () => {
      a = (a + 0x6D2B79F5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  const hash = (s) => [...s].reduce((h, c) => (Math.imul(h, 31) + c.charCodeAt(0)) >>> 0, 7);
  const r1 = (x) => Math.round(x * 10) / 10;
  const half = (x) => Math.round(x * 2) / 2;

  // Тренировки по дням плана: упражнение, стартовый рабочий вес, повторы (вес 0 — упражнение без веса).
  const WORKOUTS = {
    d1: { title: 'День 1', weekday: 2, items: [['pullover', 35, 12], ['smith_bench', 60, 9], ['machine_shoulder', 40, 11], ['lateral_raise', 8, 13], ['leg_press', 120, 11], ['ez_curl', 25, 12], ['cable_crunch', 30, 15]] },
    d2: { title: 'День 2', weekday: 4, items: [['leg_press', 120, 11], ['smith_incline', 50, 10], ['chest_row', 55, 10], ['db_shoulder', 18, 10], ['pushdown', 25, 12], ['hanging_raise', 0, 12], ['wrist_curl_bb', 20, 16]] },
    d3: { title: 'День 3', weekday: 6, items: [['hammer_row', 60, 11], ['hammer_press', 60, 10], ['lateral_raise', 8, 13], ['db_rdl', 22, 11], ['lying_leg_curl', 35, 12], ['hammer_curl', 14, 12], ['farmer_walk', 24, 40]] }
  };

  function build(id, today) {
    const sc = SCENARIOS.find((s) => s.id === id) || SCENARIOS[0];
    const rand = rng(hash(sc.id));
    const total = sc.days || 28;
    const first = A.addDays(today, -(total - 1));
    const startWeight = 78.6, startWaist = 86.0, goal = Math.round(78 * 1.8);
    const days = {}, waist = {}, history = [];

    // Питание и вес по дням
    const lowProtein = new Set();
    if (sc.lowProteinDays) { // пропуски белка — на последней завершённой неделе
      for (let i = 1; lowProtein.size < sc.lowProteinDays; i += 2) lowProtein.add(A.addDays(today, -i));
    }
    const gaps = new Set();
    if (sc.gapsLastWeek) for (let i = 0; i < sc.gapsLastWeek; i++) gaps.add(A.addDays(today, -(1 + i)));

    for (let i = 0; i < total; i++) {
      const k = A.addDays(first, i);
      const weeks = i / 7;
      const noise = (rand() - 0.5) * 0.5; // ±0.25 кг — вода и соль
      const d = {};
      if (!gaps.has(k)) d.weight = r1(startWeight + sc.weightPerWeek * weeks + noise);
      if (k !== today) { // сегодня день ещё идёт: только утренний вес
        d.protein = lowProtein.has(k) ? 95 + Math.round(rand() * 25) : goal + Math.round((rand() - 0.3) * 25);
        d.steps = Math.round(((sc.steps || 9200) + (rand() - 0.5) * 2400) / 10) * 10;
        d.energy = sc.energy ? Math.max(1, Math.min(5, sc.energy + Math.round(rand() - 0.5))) : 3 + Math.round(rand());
      }
      days[k] = d;
    }
    // Талия — раз в неделю, последний замер 6 дней назад
    for (let i = total - 1 - 6; i >= 0; i -= 7) {
      const k = A.addDays(first, i);
      waist[k] = half(startWaist + sc.waistPerWeek * (i / 7) + (rand() - 0.5) * 0.4);
    }
    // Тренировки: вт, чт, сб за весь период; рабочие веса меняются на sc.strength за неделю
    for (let i = 0; i < total; i++) {
      const k = A.addDays(first, i);
      const [y, m, dd] = k.split('-').map(Number);
      const date = new Date(y, m - 1, dd, 19, 0);
      const dayId = Object.keys(WORKOUTS).find((w) => WORKOUTS[w].weekday === date.getDay());
      if (!dayId || k >= today) continue;
      const w = WORKOUTS[dayId], f = 1 + sc.strength * (i / 7);
      const items = w.items.map(([ex, kg, reps]) => ({
        ex,
        sets: [0, 1, 2].map((s) => ({ w: kg ? half(kg * f) : null, r: kg ? reps - (s === 2 ? 1 : 0) : Math.round(reps * f) - (s === 2 ? 1 : 0) }))
      }));
      history.unshift({ id: date.getTime() - 3600000, dayId, title: w.title, startedAt: date.getTime() - 3600000, finishedAt: date.getTime(), items, water: 700 });
    }
    const last = {};
    for (const h of [...history].reverse()) for (const it of h.items) last[it.ex] = { sets: it.sets, date: h.finishedAt };

    return {
      v: 4, last, lastCardio: { min: 20, speed: 5.5, incline: 10 }, variant: {}, history, active: null,
      nutrition: { settings: { weight: startWeight, height: 180, proteinGoal: null, stepsGoal: 8000 }, days, waist, photos: [] }
    };
  }

  return { SCENARIOS, build };
});
