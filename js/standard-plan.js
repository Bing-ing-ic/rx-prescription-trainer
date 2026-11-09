/* =====================================================================
 * standard-plan.js  参考标准方案模块（点评后对照学习）
 *
 * 定位：处方点评报告下方新增"📋 参考标准方案"区域，针对本次病例的
 *       疾病，展示指南推荐的首选/次选药物、剂量频次疗程、辅助治疗、
 *       注意事项与禁忌，并按患者性别/年龄/孕哺/生命体征做个性化调整，
 *       最后与用户实际处方做差异对照（已覆盖/缺失/额外用药）。
 *
 * 数据：data/standard-plans.json，按疾病 code 索引。
 * 接口：
 *   window.StandardPlan.setPlans(plansObj)   // app.js 加载数据后注入
 *   window.StandardPlan.render(container, ctx, review)
 *       ctx: { disease:{code,name,icd10}, patient:{gender,age,weight,
 *              pregnant, allergies, comorbidities[], vitals:{hr,temp,bp}},
 *              normal_rx:{items:[{drug:{generic_name},single_dose,frequency}]},
 *              iv_rx:{items:[...]} }
 * 纯静态、无构建、无外部依赖；无方案时优雅降级（不破坏点评页）。
 * ===================================================================== */
(function (global) {
  'use strict';

  let PLANS = null;           // { disease_code: plan }
  let ALIAS_INDEX = null;     // 归一化药名 -> generic_name，用于模糊匹配

  function setPlans(obj) {
    PLANS = (obj && typeof obj === 'object') ? (obj.plans || obj) : {};
    ALIAS_INDEX = buildAliasIndex(PLANS);
  }

  // 药名归一化：去剂型后缀、空白、括号注释，便于"苯磺酸氨氯地平片"≈"氨氯地平片"
  function normName(name) {
    return String(name || '')
      .replace(/（[^）]*）/g, '').replace(/\([^)]*\)/g, '')
      .replace(/(缓释片|控释片|肠溶片|分散片|注射液|注射用|片|胶囊|颗粒|口服液|软膏|滴眼液|气雾剂|混悬液|咀嚼片)/g, '')
      .replace(/\s+/g, '')
      .trim();
  }

  function buildAliasIndex(plans) {
    const idx = new Map();
    Object.keys(plans || {}).forEach(code => {
      const p = plans[code];
      (p.first_line || []).concat(p.second_line || []).forEach(d => {
        const gn = d.generic_name;
        if (!gn) return;
        const k = normName(gn);
        if (k && !idx.has(k)) idx.set(k, gn);
      });
    });
    return idx;
  }

  // 根据用户药名，匹配到标准方案里的 generic_name；匹配不到返回 null
  function matchStdDrug(userName) {
    if (!userName) return null;
    // 1) 精确
    // 2) 归一化精确
    const nk = normName(userName);
    if (ALIAS_INDEX && ALIAS_INDEX.has(nk)) return ALIAS_INDEX.get(nk);
    // 3) 包含关系
    if (ALIAS_INDEX) {
      for (const [k, gn] of ALIAS_INDEX.entries()) {
        if (k && (nk.includes(k) || k.includes(nk))) return gn;
      }
    }
    return null;
  }

  // ------------------------------------------------------------------
  // 个性化：特殊人群 + 生命体征调整
  // ------------------------------------------------------------------
  function buildAlerts(plan, patient) {
    const alerts = [];
    const age = Number(patient.age) || 0;
    const preg = !!patient.pregnant;
    const sp = plan.special_pop || {};
    const va = plan.vital_adjust || {};

    if (preg && sp.pregnant) {
      alerts.push({ level: 'danger', title: '🤰 妊娠期用药警示', text: sp.pregnant });
    }
    if (age > 0 && age < 18 && sp.pediatric) {
      alerts.push({ level: 'warn', title: '👶 儿童剂量调整', text: sp.pediatric });
    }
    if (age >= 65 && sp.elderly) {
      alerts.push({ level: 'warn', title: '👴 老年患者调整', text: sp.elderly });
    }

    const v = patient.vitals || {};
    const temp = parseFloat(v.temp);
    if (!isNaN(temp) && temp >= 38.5 && va.fever) {
      alerts.push({ level: 'warn', title: '🌡 发热 ≥38.5℃', text: va.fever });
    }
    const bpParts = String(v.bp || '').split('/');
    const sys = parseFloat(bpParts[0]), dia = parseFloat(bpParts[1]);
    if (!isNaN(sys) && !isNaN(dia)) {
      if (sys >= 160 || dia >= 100) {
        if (va.hypertension) alerts.push({ level: 'warn', title: '🩸 血压升高 ' + sys + '/' + dia + 'mmHg', text: va.hypertension });
      } else if (sys < 90 || dia < 60) {
        alerts.push({ level: 'warn', title: '🩸 低血压 ' + sys + '/' + dia + 'mmHg', text: '注意血容量与灌注，补液并评估病因；降压/扩血管药物需暂停或减量。' });
      }
    }
    const hr = parseFloat(v.hr);
    if (!isNaN(hr) && hr > 100 && va.tachycardia) {
      alerts.push({ level: 'info', title: '❤️ 心率 ' + hr + 'bpm', text: va.tachycardia });
    }
    return alerts;
  }

  // ------------------------------------------------------------------
  // 用户处方 vs 标准方案 差异对照
  // ------------------------------------------------------------------
  function buildCompare(plan, ctx) {
    const userItems = []
      .concat((ctx.normal_rx && ctx.normal_rx.items) ? ctx.normal_rx.items : [])
      .concat((ctx.iv_rx && ctx.iv_rx.items) ? ctx.iv_rx.items : []);
    // 排除溶媒
    const userDrugs = [];
    userItems.forEach(it => {
      const d = it && it.drug;
      if (!d) return;
      if (d.dosage_form === 'solvent') return;
      userDrugs.push({ name: d.generic_name, single_dose: it.single_dose || '', frequency: it.frequency || '' });
    });

    const first = plan.first_line || [];
    const second = plan.second_line || [];
    const stdNames = new Set(first.concat(second).map(d => d.generic_name));

    const covered = [];   // 用户已开且在标准方案里
    const missingFirst = []; // 首选未开
    const missingSecond = [];
    const extra = [];     // 用户开了但不在标准方案

    userDrugs.forEach(u => {
      const matched = matchStdDrug(u.name);
      if (matched && stdNames.has(matched)) {
        covered.push({ user: u, std: matched });
      } else {
        extra.push(u);
      }
    });
    first.forEach(d => {
      const hit = covered.find(c => c.std === d.generic_name);
      if (!hit) missingFirst.push(d);
    });
    second.forEach(d => {
      const hit = covered.find(c => c.std === d.generic_name);
      if (!hit) missingSecond.push(d);
    });

    return { covered, missingFirst, missingSecond, extra, userDrugs };
  }

  // HTML 转义
  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function drugRowHtml(d) {
    return `<tr>
      <td class="sp-drug-name">${esc(d.generic_name)}</td>
      <td>${esc(d.dose)}</td>
      <td>${esc(d.frequency)}</td>
      <td>${esc(d.route)}</td>
      <td>${esc(d.duration)}</td>
      <td class="sp-note">${esc(d.note || '')}<div class="sp-why">${esc(d.rationale || '')}</div></td>
    </tr>`;
  }

  // ------------------------------------------------------------------
  // 主渲染
  // ------------------------------------------------------------------
  function render(container, ctx, review) {
    if (!container) return;
    ctx = ctx || {};
    const disease = ctx.disease || {};
    const patient = ctx.patient || {};
    const code = disease.code;

    const plan = PLANS ? PLANS[code] : null;
    if (!plan) {
      container.innerHTML = `<div class="sp-empty">📋 本病种（${esc(disease.name || code || '未知')}）的参考标准方案正在整理中，敬请期待。</div>`;
      container.style.display = '';
      return;
    }

    const alerts = buildAlerts(plan, patient);
    const cmp = buildCompare(plan, ctx);

    const alertsHtml = alerts.length
      ? `<div class="sp-alerts">` + alerts.map(a =>
          `<div class="sp-alert sp-${a.level}"><span class="sp-alert-t">${esc(a.title)}</span><span>${esc(a.text)}</span></div>`
        ).join('') + `</div>`
      : '';

    const firstRows = (plan.first_line || []).map(drugRowHtml).join('');
    const secondRows = (plan.second_line || []).map(drugRowHtml).join('');

    // 📋 推荐检验检查（对齐 lab-exams/disease-lab-map）
    const labs = Array.isArray(plan.recommended_labs) ? plan.recommended_labs : [];
    const labsHtml = labs.length ? `<div class="sp-block">
        <div class="sp-block-t">🧪 推荐检验检查（${labs.length} 项）</div>
        <table class="sp-table sp-lab-table">
          <thead><tr><th>检查项目</th><th>类别</th><th>临床意义</th></tr></thead>
          <tbody>${labs.map(l => `<tr>
            <td class="sp-drug-name">${esc(l.name)}</td>
            <td>${esc(l.category || '')}</td>
            <td class="sp-note">${esc(l.why || '')}</td>
          </tr>`).join('')}</tbody>
        </table>
      </div>` : '';

    // 🔪 手术指征判断（对齐 surgeries.json；非手术疾病显示保守治疗说明）
    const si = plan.surgery_indication || null;
    let surgHtml = '';
    if (si) {
      if (si.needed) {
        const tl = si.timing_label ? `<span class="sp-surg-timing">⏱ ${esc(si.timing_label)}</span>` : '';
        const proc = si.procedure ? `<span class="sp-surg-proc">首选术式：${esc(si.procedure)}</span>` : '';
        const inds = (si.indications || []).map(x => `<li>${esc(x)}</li>`).join('');
        const ctrs = (si.contraindications || []).map(x => `<li>${esc(x)}</li>`).join('');
        const tps = (si.teaching_points || []).map(x => `<li>${esc(x)}</li>`).join('');
        surgHtml = `<div class="sp-block sp-surg">
          <div class="sp-block-t">🔪 手术指征判断</div>
          <div class="sp-surg-head">${tl} ${proc}${si.department ? `<span class="sp-surg-dept">科室：${esc(si.department)}</span>` : ''}</div>
          <div class="sp-surg-cols">
            <div class="sp-surg-box sp-surg-ind"><h4>✅ 手术适应症</h4><ul>${inds}</ul></div>
            <div class="sp-surg-box sp-surg-ctr"><h4>🚫 手术禁忌症</h4><ul>${ctrs}</ul></div>
          </div>
          ${tps ? `<div class="sp-surg-tp">💡 教学要点：<ul>${tps}</ul></div>` : ''}
        </div>`;
      } else {
        surgHtml = `<div class="sp-block sp-surg sp-surg-no">
          <div class="sp-block-t">🔪 手术指征判断</div>
          <div class="sp-note">ℹ️ ${esc(si.note || '本病以内科保守治疗为主。')}</div>
        </div>`;
      }
    }

    // 对照差异块
    let cmpHtml = '<div class="sp-compare">';
    if (cmp.covered.length) {
      cmpHtml += `<div class="sp-cmp sp-ok">✅ 已按指南用药：${cmp.covered.map(c => esc(c.user.name)).join('、')}</div>`;
    }
    if (cmp.missingFirst.length) {
      cmpHtml += `<div class="sp-cmp sp-miss">❌ 缺少首选方案：${cmp.missingFirst.map(d => esc(d.generic_name + '（' + d.dose + ' ' + d.frequency + '）')).join('；')}</div>`;
    } else if (firstRows) {
      cmpHtml += `<div class="sp-cmp sp-ok">✅ 指南首选药物已全部覆盖</div>`;
    }
    if (cmp.missingSecond.length) {
      cmpHtml += `<div class="sp-cmp sp-warn">◻️ 备选/次选方案（视病情选用）：${cmp.missingSecond.map(d => esc(d.generic_name)).join('、')}</div>`;
    }
    if (cmp.extra.length) {
      cmpHtml += `<div class="sp-cmp sp-extra">⚠️ 额外用药（非本病种标准首选，请评估指征）：${cmp.extra.map(u => esc(u.name)).join('、')}</div>`;
    }
    cmpHtml += '</div>';

    const adjuvantHtml = (plan.adjuvant || []).length
      ? `<div class="sp-col"><h4>🩺 辅助治疗与非药物措施</h4><ul>${plan.adjuvant.map(x => `<li>${esc(x)}</li>`).join('')}</ul></div>` : '';
    const precHtml = (plan.precautions || []).length
      ? `<div class="sp-col"><h4>⚠️ 注意事项</h4><ul>${plan.precautions.map(x => `<li>${esc(x)}</li>`).join('')}</ul></div>` : '';
    const contraHtml = (plan.contraindications || []).length
      ? `<div class="sp-col"><h4>🚫 禁忌症</h4><ul class="sp-contra">${plan.contraindications.map(x => `<li>${esc(x)}</li>`).join('')}</ul></div>` : '';

    container.innerHTML = `
      <div class="sp-head">
        <div class="sp-title">📋 参考标准方案 · ${esc(plan.disease_name || disease.name || '')}
          <span class="sp-icd">${esc(plan.icd10 || disease.icd10 || '')}</span>
        </div>
        <div class="sp-guide">📖 指南依据：${esc(plan.guideline || '临床诊疗指南')}</div>
      </div>
      ${alertsHtml}
      <div class="sp-overview">${esc(plan.overview || '')}
        ${plan.target ? `<div class="sp-target">🎯 治疗目标：${esc(plan.target)}</div>` : ''}
      </div>
      ${labsHtml}
      ${surgHtml}
      <div class="sp-block">
        <div class="sp-block-t">✅ 首选方案（一线）</div>
        <table class="sp-table">
          <thead><tr><th>药物（通用名）</th><th>剂量</th><th>频次</th><th>途径</th><th>疗程</th><th>说明与依据</th></tr></thead>
          <tbody>${firstRows || '<tr><td colspan="6" class="sp-no-drug">本病以非药物/手术治疗为主</td></tr>'}</tbody>
        </table>
      </div>
      ${secondRows ? `<div class="sp-block">
        <div class="sp-block-t">🔄 次选 / 备选方案</div>
        <table class="sp-table">
          <thead><tr><th>药物（通用名）</th><th>剂量</th><th>频次</th><th>途径</th><th>疗程</th><th>说明与依据</th></tr></thead>
          <tbody>${secondRows}</tbody>
        </table>
      </div>` : ''}
      ${cmpHtml}
      <div class="sp-cols">${adjuvantHtml}${precHtml}${contraHtml}</div>
    `;
    container.style.display = '';
  }

  global.StandardPlan = { setPlans, render };
})(window);
