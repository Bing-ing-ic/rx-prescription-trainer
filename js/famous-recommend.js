/* =====================================================================
 * famous-recommend.js  名方鉴赏「按症寻方」规则推荐引擎（纯函数，无 UI 依赖）
 *
 * 设计定位（教学演示，严谨优先）：
 *  - 主链路为规则 + 检索自动匹配，不接大模型、不出具处方决策。
 *  - 双轨结合：A 轨中医辨证（证型 / 脏腑 / 症状）；B 轨日本方证
 *    （目标症状群 / 気血水 / 虚实 / 腹证）作为知识性补充维度。
 *  - 中方条目偏重 A 轨，日韩条目偏重 B 轨；权重在 recommend 内按地区切换。
 *  - 未完成辨证（skipped）时，证型权重折半、症状权重上调，并在结果中显式标注。
 *
 * 暴露：global.FamousRecommendEngine
 * ===================================================================== */
(function (global) {
  'use strict';

  const VERSION = '1.0.0';

  // 阈值与展示上限（与方案 v2 一致）
  const THRESHOLD_RECOMMEND = 60;
  const THRESHOLD_REFERENCE = 40;
  const TOP_N = 6;

  /** 由词表构建 alias/label → 标准 label 索引 */
  function indexDef(tagDef) {
    const idx = {};
    const groups = ['syndromes', 'organs', 'treatments', 'symptoms', 'kyo_jitsu', 'ki_ketsu_sui', 'six_channel', 'fukushin'];
    groups.forEach(g => {
      const map = new Map();
      (tagDef[g] || []).forEach(x => {
        map.set(x.label, x.label);
        (x.aliases || []).forEach(a => map.set(a, x.label));
      });
      idx[g] = map;
    });
    return idx;
  }

  /** 在一组候选标签中，统计与查询命中的标准词；返回 { hit, miss } */
  function matchList(queryTags, entryTags, map) {
    const hit = [], miss = [];
    (queryTags || []).forEach(q => {
      const std = map.get(q) || q;
      if ((entryTags || []).includes(std)) hit.push(std);
      else miss.push(std);
    });
    return { hit, miss };
  }

  /**
   * 归一化输入。
   * @param {object} input { symptoms:[], syndromes:[], freeText:'' }
   * @param {Map[]} idx indexDef 结果
   * @returns {{symptoms:string[], syndromes:string[], freeText:string, freeHitSymptoms:string[], freeHitSyndromes:string[]}}
   */
  function normalizeInput(input, idx) {
    input = input || {};
    const symptoms = [...new Set((input.symptoms || []).map(s => idx.symptoms.get(s) || s).filter(Boolean))];
    const syndromes = [...new Set((input.syndromes || []).map(s => idx.syndromes.get(s) || s).filter(Boolean))];
    const freeText = (input.freeText || '').trim();

    // 自由文本二次扫描：若整串包含某标准词/别名，补挂到对应分组（帮助自然语言输入）
    const freeHitSymptoms = [];
    const freeHitSyndromes = [];
    if (freeText) {
      idx.symptoms.forEach((std, alias) => {
        if (freeText.includes(alias) && !symptoms.includes(std) && !freeHitSymptoms.includes(std)) freeHitSymptoms.push(std);
      });
      idx.syndromes.forEach((std, alias) => {
        if (freeText.includes(alias) && !syndromes.includes(std) && !freeHitSyndromes.includes(std)) freeHitSyndromes.push(std);
      });
    }
    return { symptoms, syndromes, freeText, freeHitSymptoms, freeHitSyndromes };
  }

  function ratio(hit, total) { return total > 0 ? hit / total : 1; }
  function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

  /** 文本兜底：自由文本与条目可见文本子串命中，附加 ≤10 分 */
  function textBonus(f, freeText) {
    if (!freeText) return { score: 0, fields: [] };
    const blob = [
      f.name, (f.aliases || []).join(' '), f.pinyin,
      f.functions || '', f.indications || '', f.syndrome_key || '', f.modern_use || ''
    ].join(' ').toLowerCase();
    const q = freeText.toLowerCase();
    const fields = [];
    if (f.name && f.name.toLowerCase().includes(q)) fields.push('方名');
    if ((f.aliases || []).some(a => a.toLowerCase().includes(q))) fields.push('别名');
    if (blob.includes(q)) fields.push('主治/功用');
    if (!fields.length) return { score: 0, fields: [] };
    return { score: clamp(4 * fields.length, 0, 10), fields };
  }

  /** 单条打分 */
  function scoreOne(f, q, idx, opts) {
    const tags = f.tags || {};
    const skipped = !!(opts && opts.skipped);

    const syn = matchList([...q.syndromes, ...q.freeHitSyndromes], tags.syndromes, idx.syndromes);
    const sym = matchList([...q.symptoms, ...q.freeHitSymptoms], tags.target_symptoms, idx.symptoms);
    const organ = matchList((opts && opts.organs) || [], tags.organs, idx.organs);
    const kk = matchList((opts && opts.kiKetsuSui) || [], tags.ki_ketsu_sui, idx.ki_ketsu_sui);
    const kyo = (opts && opts.kyoJitsu) ? (tags.kyo_jitsu === idx.kyo_jitsu.get(opts.kyoJitsu)) : true;
    const fk = (opts && opts.fukushin) ? (tags.fukushin === idx.fukushin.get(opts.fukushin)) : true;

    // 覆盖率（查询项被命中比例）+ 聚焦度（命中占条目自身标签比例，症状群越聚焦越精准）
    const qSynTotal = [...q.syndromes, ...q.freeHitSyndromes].length;
    const qSymTotal = [...q.symptoms, ...q.freeHitSymptoms].length;
    const synCov = ratio(syn.hit.length, qSynTotal);
    const symCov = ratio(sym.hit.length, qSymTotal);
    const synFocus = syn.hit.length / Math.max(1, (tags.syndromes || []).length);
    const symFocus = sym.hit.length / Math.max(1, (tags.target_symptoms || []).length);
    const synScore = 0.6 * synCov + 0.4 * synFocus;
    const symScore = 0.6 * symCov + 0.4 * symFocus;

    // A 轨：中医辨证。skipped 时证型权重折半、症状权重上调。
    let A;
    if (skipped) {
      A = 22.5 * synScore + 57.5 * symScore
        + 20 * ratio(organ.hit.length, organ.miss.length + organ.hit.length);
    } else {
      A = 45 * synScore + 35 * symScore
        + 20 * ratio(organ.hit.length, organ.miss.length + organ.hit.length);
    }

    // B 轨：日本方证（目标症状群 / 気血水 / 虚实 / 腹证）
    const B = 45 * symScore
      + 20 * ratio(kk.hit.length, kk.miss.length + kk.hit.length)
      + 15 * (kyo ? 1 : 0)
      + 20 * (fk ? 1 : 0);

    // 地区权重：中方偏重辨证 A，日韩偏重方证 B
    const wA = f.region === 'china' ? 0.65 : 0.40;
    const wB = 1 - wA;
    let base = wA * A + wB * B;

    const tb = textBonus(f, q.freeText);
    const score = clamp(Math.round(base + tb.score), 0, 100);

    // 命中理由（教学可见）；辨证状态由前端状态行统一提示，不在每条卡片重复
    const reasons = [];
    if (syn.hit.length) reasons.push(`证型契合：${syn.hit.join('、')}`);
    if (sym.hit.length) reasons.push(`对应症状：${sym.hit.join('、')}`);
    if (organ.hit.length) reasons.push(`归入脏腑：${organ.hit.join('、')}`);
    if (kk.hit.length) reasons.push(`気血水：${kk.hit.join('、')}`);
    if (tags.fukushin) reasons.push(`腹证所见：${tags.fukushin}`);
    if (tb.fields.length) reasons.push(`关键词“${q.freeText}”见于${tb.fields.join('/')}`);

    return {
      id: f.id,
      region: f.region,
      name: f.name,
      score,
      scoreA: Math.round(A),
      scoreB: Math.round(B),
      hit: {
        syndromes: syn.hit,
        symptoms: sym.hit,
        organs: organ.hit,
        kiKetsuSui: kk.hit
      },
      reasons
    };
  }

  function bandOf(score) {
    if (score >= THRESHOLD_RECOMMEND) return 'recommend';
    if (score >= THRESHOLD_REFERENCE) return 'reference';
    return 'hidden';
  }

  /**
   * 主入口：按症寻方。
   * @param {Array} prescriptions 名方数组（含 tags）
   * @param {object} tagDef 受控词表
   * @param {object} input { symptoms:[], syndromes:[], freeText:'' }
   * @param {object} opts { skipped, organs, kiKetsuSui, kyoJitsu, fukushin, topN }
   */
  function recommend(prescriptions, tagDef, input, opts) {
    opts = opts || {};
    const idx = indexDef(tagDef || {});
    const q = normalizeInput(input, idx);
    const hasQuery = q.symptoms.length || q.syndromes.length || q.freeText;

    if (!hasQuery) {
      return { results: [], bands: {}, input: q, empty: true };
    }

    const scored = (prescriptions || [])
      .map(f => scoreOne(f, q, idx, opts))
      .map(r => Object.assign(r, { band: bandOf(r.score) }))
      .filter(r => r.band !== 'hidden')
      .sort((a, b) => b.score - a.score || a.id.localeCompare(b.id));

    const topN = opts.topN || TOP_N;
    const results = scored.slice(0, topN);
    return {
      results,
      bands: { recommend: THRESHOLD_RECOMMEND, reference: THRESHOLD_REFERENCE },
      input: q,
      empty: results.length === 0
    };
  }

  /**
   * 归纳候选证型（规则映射 + 名方关联双来源）。
   * @returns {Array<{label, score, rule, related}>} 按相关度排序，Top 4
   */
  function deduceSyndromes(prescriptions, tagDef, input) {
    const idx = indexDef(tagDef || {});
    const q = normalizeInput(input, idx);
    const symSet = [...q.symptoms, ...q.freeHitSymptoms];
    if (!symSet.length) return [];

    const score = {};
    const add = (label, pts, viaRule) => {
      if (!score[label]) score[label] = { label, score: 0, rule: false, related: false };
      score[label].score += pts;
      if (viaRule) score[label].rule = true; else score[label].related = true;
    };

    // 来源 1：症状群 → 证型辨证规则映射
    (tagDef.symptom_rules || []).forEach(rule => {
      const hit = rule.symptoms.filter(s => symSet.includes(s));
      if (hit.length === 0) return;
      const ratio = hit.length / rule.symptoms.length;
      const pts = 2 + ratio * 3;
      rule.syndromes.forEach(s => add(s, pts, true));
    });

    // 来源 2：命中名方所挂证型的关联频次
    (prescriptions || []).forEach(f => {
      const t = f.tags || {};
      const hit = (t.target_symptoms || []).filter(s => symSet.includes(s)).length;
      if (hit > 0) (t.syndromes || []).forEach(s => add(s, hit * 0.8, false));
    });

    return Object.values(score)
      .sort((a, b) => b.score - a.score || a.label.localeCompare(b.label))
      .slice(0, 4)
      .map(r => ({ label: r.label, score: Math.round(r.score * 10) / 10, rule: r.rule, related: r.related }));
  }

  global.FamousRecommendEngine = {
    VERSION,
    indexDef,
    normalizeInput,
    recommend,
    deduceSyndromes,
    THRESHOLD_RECOMMEND,
    THRESHOLD_REFERENCE,
    TOP_N
  };
})(typeof window !== 'undefined' ? window : globalThis);
