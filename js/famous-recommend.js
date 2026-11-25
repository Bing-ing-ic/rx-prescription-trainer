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
        // 派生简称：证型去掉尾缀「证」（如「血虚证」→「血虚」），便于自然语言互认；短于 2 字不收录，不覆盖既有键
        if (/证$/.test(x.label)) {
          const stem = x.label.replace(/证$/, '');
          if (stem.length >= 2 && !map.has(stem)) map.set(stem, x.label);
        }
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

  /** 自由文本扫描：文本包含某标准词/别名/派生简称即补挂到对应分组；键长 <2 不参与子串匹配以防误命中 */
  function collectFree(map, freeText, queryStds, bucket) {
    map.forEach((std, key) => {
      if (key.length < 2) return;
      if (freeText.includes(key) && !queryStds.includes(std) && !bucket.includes(std)) bucket.push(std);
    });
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

    // 自由文本二次扫描：若整串包含某标准词/别名/简称，补挂到对应分组（帮助自然语言输入）
    const freeHitSymptoms = [];
    const freeHitSyndromes = [];
    if (freeText) {
      collectFree(idx.symptoms, freeText, symptoms, freeHitSymptoms);
      collectFree(idx.syndromes, freeText, syndromes, freeHitSyndromes);
    }
    return { symptoms, syndromes, freeText, freeHitSymptoms, freeHitSyndromes };
  }

  function ratio(hit, total) { return total > 0 ? hit / total : 1; }
  function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

  /** 拆分自由文本为可匹配词项：滤除纯数字、年龄片段与单字噪声 */
  function splitQueryTerms(text) {
    return (text || '').toLowerCase()
      .split(/[^a-z0-9一-龥]+/)
      .map(s => s.trim())
      .filter(s => s.length >= 2 && !/^\d+$/.test(s) && !/^\d+岁?$/.test(s));
  }

  /** 文本兜底：按词项与条目可见文本子串命中，附加 ≤10 分；返回命中词项供理由展示 */
  function textBonus(f, freeText) {
    if (!freeText) return { score: 0, fields: [], terms: [] };
    const terms = splitQueryTerms(freeText);
    if (!terms.length) return { score: 0, fields: [], terms: [] };
    const name = (f.name || '').toLowerCase();
    const aliases = (f.aliases || []).map(a => a.toLowerCase());
    const blob = [
      name, aliases.join(' '), f.pinyin,
      f.functions || '', f.indications || '', f.syndrome_key || '', f.modern_use || ''
    ].join(' ');
    const fields = new Set();
    const hitTerms = [];
    terms.forEach(t => {
      let hit = false;
      if (name.includes(t)) { fields.add('方名'); hit = true; }
      if (aliases.some(a => a.includes(t))) { fields.add('别名'); hit = true; }
      if (blob.includes(t)) { fields.add('主治/功用'); hit = true; }
      if (hit) hitTerms.push(t);
    });
    if (!fields.size) return { score: 0, fields: [], terms: [] };
    return { score: clamp(4 * fields.size, 0, 10), fields: [...fields], terms: [...new Set(hitTerms)] };
  }

  /** 按有效维度做权重归一：未查询的维度不计分，其权重在同轨有效维度间重新分配；全空返回 0 */
  function weightedDims(dims) {
    const active = dims.filter(d => d.active);
    const totalW = active.reduce((s, d) => s + d.w, 0);
    if (totalW <= 0) return 0;
    return active.reduce((s, d) => s + d.w * d.score, 0) / totalW;
  }

  /** 单条打分 */
  function scoreOne(f, q, idx, opts) {
    const tags = f.tags || {};
    const skipped = !!(opts && opts.skipped);

    const syn = matchList([...q.syndromes, ...q.freeHitSyndromes], tags.syndromes, idx.syndromes);
    const sym = matchList([...q.symptoms, ...q.freeHitSymptoms], tags.target_symptoms, idx.symptoms);
    const organ = matchList((opts && opts.organs) || [], tags.organs, idx.organs);
    const kk = matchList((opts && opts.kiKetsuSui) || [], tags.ki_ketsu_sui, idx.ki_ketsu_sui);

    // 可选维度是否被用户实际查询；未查询的维度中性不计分，避免空查询白给满分
    const organQueried = Array.isArray(opts.organs) && opts.organs.length > 0;
    const kkQueried = Array.isArray(opts.kiKetsuSui) && opts.kiKetsuSui.length > 0;
    const kyoQueried = !!(opts && opts.kyoJitsu);
    const fkQueried = !!(opts && opts.fukushin);
    const kyo = kyoQueried && tags.kyo_jitsu === idx.kyo_jitsu.get(opts.kyoJitsu);
    const fk = fkQueried && tags.fukushin === idx.fukushin.get(opts.fukushin);

    // 覆盖率（查询项被命中比例）；查询项为空时覆盖率按 0 计，不视为满分
    const qSynTotal = [...q.syndromes, ...q.freeHitSyndromes].length;
    const qSymTotal = [...q.symptoms, ...q.freeHitSymptoms].length;
    const synCov = qSynTotal > 0 ? syn.hit.length / qSynTotal : 0;
    const symCov = qSymTotal > 0 ? sym.hit.length / qSymTotal : 0;
    const synFocus = syn.hit.length / Math.max(1, (tags.syndromes || []).length);
    const symFocus = sym.hit.length / Math.max(1, (tags.target_symptoms || []).length);
    const synScore = 0.6 * synCov + 0.4 * synFocus;
    const symScore = 0.6 * symCov + 0.4 * symFocus;
    const organCov = organQueried ? ratio(organ.hit.length, organ.miss.length + organ.hit.length) : 0;
    const kkCov = kkQueried ? ratio(kk.hit.length, kk.miss.length + kk.hit.length) : 0;

    // A 轨：中医辨证（证型 / 症状 / 脏腑）。skipped 时证型权重下调、症状权重上调。
    const A = 100 * weightedDims([
      { score: synScore, w: skipped ? 22.5 : 45, active: qSynTotal > 0 },
      { score: symScore, w: skipped ? 57.5 : 35, active: qSymTotal > 0 },
      { score: organCov, w: 20, active: organQueried }
    ]);

    // B 轨：日本方证（目标症状群 / 気血水 / 虚实 / 腹证）
    const B = 100 * weightedDims([
      { score: symScore, w: 45, active: qSymTotal > 0 },
      { score: kkCov, w: 20, active: kkQueried },
      { score: kyo ? 1 : 0, w: 15, active: kyoQueried },
      { score: fk ? 1 : 0, w: 20, active: fkQueried }
    ]);

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
    if (tb.fields.length && tb.terms.length) reasons.push(`关键词“${tb.terms.join('、')}”见于${tb.fields.join('/')}`);

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
