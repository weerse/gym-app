// Анализ «Питание и прогресс». Только чистые функции: всё нужное приходит в аргументах
// (включая «сегодня»), ничего не читается из хранилища и не трогает экран.
// Работает и в браузере (window.Analysis), и в Node (require) — для тестов.
(function (root, factory) {
  const m = factory();
  if (typeof module === 'object' && module.exports) module.exports = m;
  else root.Analysis = m;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // ---------- Даты: ключи 'YYYY-MM-DD', арифметика в UTC, чтобы не мешал переход на летнее время ----------
  const DAY = 86400000;
  const toUTC = (key) => { const [y, m, d] = key.split('-').map(Number); return Date.UTC(y, m - 1, d); };
  const fromUTC = (ms) => new Date(ms).toISOString().slice(0, 10);
  const addDays = (key, n) => fromUTC(toUTC(key) + n * DAY);
  const daysBetween = (a, b) => Math.round((toUTC(b) - toUTC(a)) / DAY); // b − a
  const localKey = (date) => {
    const d = date || new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  };
  const range = (from, to) => { const out = []; for (let k = from; k <= to; k = addDays(k, 1)) out.push(k); return out; };
  const mean = (xs) => (xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : null);
  const isNum = (x) => typeof x === 'number' && isFinite(x);
  const round = (x, d = 1) => (x == null ? null : Math.round(x * 10 ** d) / 10 ** d);

  // ---------- Цели ----------
  const PROTEIN_PER_KG = 1.8;
  const DEFAULT_STEPS = 8000;

  // Вес для расчётов: среднее за 7 дней (если взвешиваний хотя бы 3),
  // иначе вес из настроек, иначе последнее взвешивание за 2 недели.
  function currentWeight(days, settings, today) {
    const avg = weightAvg(days, today, 7);
    if (avg.count >= 3) return round(avg.avg, 1);
    if (isNum(settings && settings.weight)) return settings.weight;
    const last = range(addDays(today, -13), today).reverse().find((k) => days[k] && isNum(days[k].weight));
    return last ? days[last].weight : null;
  }
  function proteinGoal(settings, weight) {
    if (settings && isNum(settings.proteinGoal)) return settings.proteinGoal;
    return isNum(weight) ? Math.round(weight * PROTEIN_PER_KG) : null;
  }
  const stepsGoal = (settings) => (settings && isNum(settings.stepsGoal) ? settings.stepsGoal : DEFAULT_STEPS);
  // Стартовый ориентир калорий — только подсказка, не цель.
  const kcalHint = (weight) => (isNum(weight) ? Math.round((weight * 30 - 250) / 10) * 10 : null);

  // ---------- Вес ----------
  // Среднее веса за n дней, заканчивая днём end (включительно).
  function weightAvg(days, end, n = 7) {
    const ws = range(addDays(end, -(n - 1)), end).map((k) => days[k] && days[k].weight).filter(isNum);
    return { avg: mean(ws), count: ws.length };
  }
  // Точки по дням и скользящее среднее за 7 дней — для графика.
  // Среднее рисуем, только если в окне хотя бы 3 взвешивания.
  function weightSeries(days, from, to) {
    return range(from, to).map((k) => {
      const a = weightAvg(days, k, 7);
      const w = days[k] && days[k].weight;
      return { date: k, weight: isNum(w) ? w : null, avg: a.count >= 3 ? round(a.avg, 2) : null };
    });
  }

  // ---------- Серия дней подряд с вводом ----------
  // День засчитывается, если введено хоть что-то. Если сегодня ещё пусто — серия не сгорает, считаем со вчера.
  function streak(days, today) {
    const filled = (k) => { const d = days[k]; return !!d && Object.values(d).some(isNum); };
    let k = filled(today) ? today : addDays(today, -1);
    let n = 0;
    while (filled(k)) { n++; k = addDays(k, -1); }
    return n;
  }

  // ---------- Пороги ----------
  const T = {
    MIN_SPAN: 14,        // анализ — не раньше, чем через 14 дней после первого взвешивания…
    MIN_WEIGHINS: 10,    // …и при 10+ взвешиваниях
    MAX_MISSED: 3,       // больше 3 пропусков веса за последние 7 дней — выводов не делаем
    MIN_WEEK_COUNT: 3,   // неделя считается, если в ней хотя бы 3 взвешивания
    FLAT: 0.2,           // |Δ| < 0.2 кг/нед — вес стоит
    IDEAL_MAX: 0.5,      // −0.2…−0.5 кг/нед — идеальный темп
    FAST: 0.7,           // быстрее −0.7 кг/нед — слишком большой дефицит
    WAIST_STEP: 0.5,     // изменение талии от 0.5 см — значимое
    WAIST_MIN_GAP: 10,   // талию сравниваем с замером, сделанным минимум 10 дней назад
    STRENGTH_STEP: 0.02, // ±2% к условному максимуму — «держится»
    PROTEIN_LOW_DAYS: 3  // белок ниже цели больше 3 дней из 7 — предупреждение
  };

  // ---------- Готовность и качество данных ----------
  function dataStatus(days, today) {
    const weighed = Object.keys(days).filter((k) => k <= today && isNum(days[k].weight)).sort();
    const first = weighed[0] || null;
    const span = first ? daysBetween(first, today) + 1 : 0;
    const lastWeek = range(addDays(today, -6), today).filter((k) => days[k] && isNum(days[k].weight)).length;
    return {
      first, span, weighIns: weighed.length,
      ready: span >= T.MIN_SPAN && weighed.length >= T.MIN_WEIGHINS,
      missedLastWeek: 7 - lastWeek
    };
  }

  // ---------- Тренд веса по неделям ----------
  // Неделя — последние 7 дней (включая сегодня), прошлая — 7 дней до неё, позапрошлая — ещё раньше.
  function weeklyWeights(days, today) {
    const wk = (i) => {
      const a = weightAvg(days, addDays(today, -7 * i), 7);
      return a.count >= T.MIN_WEEK_COUNT ? a.avg : null;
    };
    const w0 = wk(0), w1 = wk(1), w2 = wk(2);
    return {
      thisWeek: round(w0, 2), lastWeek: round(w1, 2), prevWeek: round(w2, 2),
      delta: w0 != null && w1 != null ? round(w0 - w1, 2) : null,     // кг за последнюю неделю
      prevDelta: w1 != null && w2 != null ? round(w1 - w2, 2) : null  // кг за неделю до неё
    };
  }
  const isFlat = (d) => d != null && Math.abs(d) < T.FLAT;

  // ---------- Талия ----------
  // Последний замер сравниваем с ближайшим замером, сделанным не позже чем за 10 дней до него.
  function waistTrend(waist, today) {
    const keys = Object.keys(waist || {}).filter((k) => k <= today && isNum(waist[k])).sort();
    const latest = keys[keys.length - 1];
    if (!latest || daysBetween(latest, today) > T.WAIST_MIN_GAP) return { trend: 'unknown', latest: latest ? waist[latest] : null };
    const ref = keys.filter((k) => k <= addDays(latest, -T.WAIST_MIN_GAP)).pop();
    if (!ref) return { trend: 'unknown', latest: waist[latest] };
    const delta = round(waist[latest] - waist[ref], 1);
    const trend = delta <= -T.WAIST_STEP ? 'down' : delta >= T.WAIST_STEP ? 'up' : 'flat';
    return { trend, latest: waist[latest], ref: waist[ref], delta, days: daysBetween(ref, latest) };
  }

  // ---------- Сила ----------
  // Условный максимум по формуле Эпли: вес × (1 + повторы/30). Без веса (вис, подъём ног) — просто повторы.
  const e1rm = (w, r) => (isNum(w) && w > 0 ? w * (1 + (isNum(r) ? r : 0) / 30) : isNum(r) ? r : 0);

  // Сравнивает лучший подход в каждом упражнении: последние 2 недели против 2 недель до них.
  // history — записи тренировок { finishedAt, items: [{ ex, sets: [{ w, r }] }] }.
  // exclude — упражнения на время и кардио, их не считаем.
  function strengthTrend(history, today, exclude) {
    const skip = new Set(exclude || []);
    const recentFrom = addDays(today, -13), earlyFrom = addDays(today, -27);
    const best = {}; // ex → { recent, early }
    for (const h of history || []) {
      const k = localKey(new Date(h.finishedAt));
      if (k > today || k < earlyFrom) continue;
      const slot = k >= recentFrom ? 'recent' : 'early';
      for (const it of h.items || []) {
        if (!it.sets || skip.has(it.ex)) continue;
        for (const s of it.sets) {
          const v = e1rm(s.w, s.r);
          if (!v) continue;
          const b = (best[it.ex] = best[it.ex] || {});
          b[slot] = Math.max(b[slot] || 0, v);
        }
      }
    }
    const list = Object.entries(best)
      .filter(([, b]) => b.recent && b.early)
      .map(([ex, b]) => {
        const change = (b.recent - b.early) / b.early;
        return { ex, change: round(change, 3), dir: change > T.STRENGTH_STEP ? 'up' : change < -T.STRENGTH_STEP ? 'down' : 'flat' };
      });
    const ups = list.filter((x) => x.dir === 'up').length;
    const downs = list.filter((x) => x.dir === 'down').length;
    let trend = 'unknown';
    if (list.length) {
      if (downs > ups && downs / list.length >= 1 / 3) trend = 'down';
      else if (ups > downs) trend = 'up';
      else trend = 'flat';
    }
    return { trend, compared: list.length, ups, downs, list };
  }

  // ---------- Белок, шаги, самочувствие ----------
  // Берём 7 завершённых дней: вчера и раньше. Сегодня ещё не закончилось.
  function habits(days, today, goal) {
    const keys = range(addDays(today, -7), addDays(today, -1));
    const pDays = keys.filter((k) => days[k] && isNum(days[k].protein));
    const sDays = keys.filter((k) => days[k] && isNum(days[k].steps));
    const eDays = keys.filter((k) => days[k] && isNum(days[k].energy));
    const lowProtein = goal.protein ? pDays.filter((k) => days[k].protein < goal.protein).length : 0;
    const stepsAvg = sDays.length ? Math.round(mean(sDays.map((k) => days[k].steps))) : null;
    return {
      proteinLogged: pDays.length,
      proteinLowDays: lowProtein,
      proteinAvg: pDays.length ? Math.round(mean(pDays.map((k) => days[k].protein))) : null,
      stepsLogged: sDays.length,
      stepsAvg,
      energyAvg: eDays.length ? round(mean(eDays.map((k) => days[k].energy)), 1) : null
    };
  }

  // ---------- Вердикт ----------
  // Возвращает { id, status: green|yellow|red|gray, title, why[], actions[], warnings[], facts }.
  function analyze(input) {
    const { days = {}, waist = {}, settings = {}, history = [], today, exclude = [] } = input;
    const weight = currentWeight(days, settings, today);
    const goal = { protein: proteinGoal(settings, weight), steps: stepsGoal(settings) };
    const status = dataStatus(days, today);
    const wk = weeklyWeights(days, today);
    const waistT = waistTrend(waist, today);
    const strength = strengthTrend(history, today, exclude);
    const hab = habits(days, today, goal);
    const facts = { status, weekly: wk, waist: waistT, strength, habits: hab, goal, weight };
    const dec = (x, d = 2) => String(round(Math.abs(x), d)).replace('.', ',');
    const fmt = (x, d = 2) => (x > 0 ? '+' : x < 0 ? '−' : '±') + dec(x, d);

    const warnings = [];
    if (hab.proteinLowDays > T.PROTEIN_LOW_DAYS) {
      warnings.push({ id: 'protein', text: `Белок — приоритет №1: ниже цели ${hab.proteinLowDays} из 7 дней (в среднем ${hab.proteinAvg} г при цели ${goal.protein} г). Без белка мышцы не растут даже при идеальном весе.` });
    }
    if (hab.stepsAvg != null && hab.stepsAvg < goal.steps) {
      const gap = goal.steps - hab.stepsAvg;
      warnings.push({ id: 'steps', text: `Шагов в среднем ${hab.stepsAvg.toLocaleString('ru-RU')} при цели ${goal.steps.toLocaleString('ru-RU')}. Добавь ходьбу: ещё ~${Math.ceil(gap / 100) * 100} шагов ≈ ${Math.ceil(gap / 100)} мин прогулки в день.` });
    }
    const out = (id, st, title, why, actions = []) => ({ id, status: st, title, why, actions, warnings, facts });

    // 1. Мало данных для выводов
    if (!status.ready) {
      const left = Math.max(T.MIN_SPAN - status.span, T.MIN_WEIGHINS - status.weighIns, 0);
      return out('collecting', 'gray', 'Собираем данные, продолжай вводить',
        [`Для анализа нужно минимум ${T.MIN_SPAN} дней и ${T.MIN_WEIGHINS} взвешиваний. Сейчас: ${status.span} ${status.span === 1 ? 'день' : 'дн.'}, взвешиваний ${status.weighIns}.`,
         left ? `Осталось примерно ${left} дн. — взвешивайся каждое утро.` : 'Почти готово.']);
    }
    if (status.missedLastWeek > T.MAX_MISSED || wk.delta == null) {
      return out('gaps', 'gray', 'Не хватает взвешиваний за неделю — выводы делать рано',
        [`За последние 7 дней пропущено ${status.missedLastWeek} ${status.missedLastWeek === 1 ? 'взвешивание' : 'взвешиваний'} из 7. Среднее по 2–3 точкам слишком зависит от воды.`],
        ['Взвешивайся каждое утро натощак — через несколько дней анализ вернётся.']);
    }

    const d = wk.delta;
    const strengthTxt = {
      up: `Сила растёт: рабочие веса выше в ${strength.ups} из ${strength.compared} упражнений`,
      flat: 'Сила держится',
      down: 'Сила падает',
      unknown: 'По силе мало данных: нужны тренировки за последние 4 недели'
    }[strength.trend];
    const waistTxt = waistT.trend === 'unknown' ? 'Талия: нет свежих замеров (нужны 2 замера с разницей 10+ дней)'
      : `Талия ${fmt(waistT.delta, 1)} см за ${waistT.days} дн.`;
    const base = [`Средний вес за неделю ${dec(wk.thisWeek, 1)} кг — ${fmt(d)} кг к прошлой неделе`, waistTxt, strengthTxt];

    // 2. Слишком большой дефицит: вес летит вниз или сила падает
    if (d < -T.FAST || strength.trend === 'down') {
      const why = [...base];
      if (d < -T.FAST) why.unshift(`Вес падает на ${dec(d)} кг/нед — быстрее безопасных 0,7 кг.`);
      if (strength.trend === 'down') why.unshift(`Рабочие веса снизились в ${strength.downs} из ${strength.compared} упражнений за 2 недели.`);
      if (hab.energyAvg != null && hab.energyAvg <= 2.5) why.push(`Самочувствие в среднем ${dec(hab.energyAvg, 1)} из 5 — тоже сигнал недоедания.`);
      return out('too_fast', 'red', 'Слишком большой дефицит — ешь больше, иначе теряешь мышцы', why,
        ['Добавь ~200–300 ккал в день: порцию углеводов (рис, гречка, картофель) в обед или перед тренировкой.', 'Держи белок на цели.']);
    }
    // 3. Вес и талия растут — набираешь жир
    if (d >= T.FLAT && waistT.trend === 'up') {
      return out('gain', 'red', 'Сократи порции, проверь перекусы и сладкое', base,
        ['Убери ~300 ккал: перекусы, сладкое, калорийные напитки и соусы — первые кандидаты.', 'Порции гарнира — на треть меньше.']);
    }
    // 4. Рекомпозиция: вес стоит, талия уходит, сила не падает
    if (isFlat(d) && waistT.trend === 'down') {
      return out('recomp', 'green', 'Идёт рекомпозиция — это лучший сценарий, продолжай', base,
        ['Ничего не меняй: жир уходит, мышцы растут, поэтому весы стоят.']);
    }
    // 5. Застой 2+ недели: вес и талия стоят
    if (isFlat(d) && isFlat(wk.prevDelta) && waistT.trend !== 'down') {
      const checks = [];
      checks.push(hab.proteinLowDays > T.PROTEIN_LOW_DAYS
        ? `Белок: ниже цели ${hab.proteinLowDays} дн. из 7 — сначала подтяни его.`
        : hab.proteinLogged ? `Белок: в норме (${hab.proteinLogged - hab.proteinLowDays} из ${hab.proteinLogged} дней на цели) ✓` : 'Белок: не вводился — проверь, что выходит на цель.');
      checks.push(hab.stepsAvg == null ? 'Шаги: не вводились — проверь, что выходит хотя бы цель.'
        : hab.stepsAvg < goal.steps ? `Шаги: ${hab.stepsAvg.toLocaleString('ru-RU')} — ниже цели, добавь ходьбу.` : `Шаги: ${hab.stepsAvg.toLocaleString('ru-RU')} — в норме ✓`);
      return out('stall', 'yellow', 'Убери ~200 ккал: одна порция углеводов или перекус',
        [`Вес стоит 2+ недели: ${fmt(wk.prevDelta)} и ${fmt(d)} кг/нед`, waistTxt, strengthTxt],
        ['Например: половина порции гарнира в ужин или без одного перекуса.', ...checks]);
    }
    // 6. Вес стоит только неделю — ждём
    if (isFlat(d)) {
      return out('flat_wait', 'yellow', 'Вес стоит неделю — подожди ещё неделю, ничего не меняй',
        [...base, 'Одна неделя без движения — это нормально: вода, соль, стресс. Решение — после второй недели.'],
        waistT.trend === 'unknown' ? ['Замерь талию — она покажет, не идёт ли рекомпозиция.'] : []);
    }
    // 7. Идеальный темп
    if (d <= -T.FLAT && d >= -T.IDEAL_MAX) {
      return out('ideal', 'green', 'Всё идеально, ничего не меняй', base, ['Темп −0,2…−0,5 кг в неделю — жир уходит, мышцы сохраняются.']);
    }
    // 8. Быстро, но в пределах
    if (d < -T.IDEAL_MAX) {
      return out('good_fast', 'green', 'Хороший темп, но не ускоряйся', base,
        ['Минус 0,5–0,7 кг в неделю — верхняя граница. Следи, чтобы рабочие веса не падали.']);
    }
    // 9. Вес растёт, талия не растёт
    return out('gain_watch', 'yellow', 'Вес растёт — проверь порции', base,
      [waistT.trend === 'unknown' ? 'Замерь талию: если она стоит, а сила растёт, это могут быть мышцы.'
        : 'Талия не растёт — возможно, часть прибавки — мышцы и вода. Если продолжится 2 недели, убери ~200 ккал.']);
  }

  return {
    // даты
    addDays, daysBetween, localKey, range, round, isNum,
    // цели
    PROTEIN_PER_KG, DEFAULT_STEPS, currentWeight, proteinGoal, stepsGoal, kcalHint,
    // вес и данные
    weightAvg, weightSeries, streak, dataStatus, weeklyWeights,
    // талия, сила, привычки
    waistTrend, e1rm, strengthTrend, habits,
    // вывод
    THRESHOLDS: T, analyze
  };
});
