/* =====================================================================
 * rule-engine.js  处方规则引擎
 * 输入: visit_ctx = {
 *   disease, patient, normal_rx, iv_rx, rulesMeta, compatData
 * }
 * 输出: hits = [{rule_id, group, severity, title, message, basis, suggestion}]
 * ===================================================================== */
(function (global) {
  'use strict';

  // ---------- 工具 ----------
  function byId(list, id) { return list.find(r => r.rule_id === id); }
  function hit(rule, severity, message, suggestion) {
    rule = rule || { rule_id: 'UNKNOWN', group: 'FORMAT', title: '未知规则', basis: '' };
    return {
      rule_id: rule.rule_id,
      group: rule.group,
      title: rule.title,
      severity: severity,
      message: message,
      basis: rule.basis,
      suggestion: suggestion || ''
    };
  }
  function pass(rule, msg) { return hit(rule, 'pass', msg || '通过', ''); }

  // 判断药品是否在处方里（按通用名匹配）
  function hasDrug(rx, genericName) {
    if (!rx || !rx.items) return false;
    return rx.items.some(it => it.drug.generic_name === genericName);
  }
  // 收集某处方内所有某 pharmacology_class 的药
  function drugsOfClass(rx, cls) {
    if (!rx || !rx.items) return [];
    return rx.items.filter(it => it.drug.pharmacology_class === cls);
  }
  // 收集 visit 内所有口服药 & 所有静脉药
  function collectRoutes(ctx) {
    const oral = [], iv = [];
    [ctx.normal_rx, ctx.iv_rx].forEach(rx => {
      if (!rx || !rx.items || !Array.isArray(rx.items)) return;
      rx.items.forEach(it => {
        if (!it || !it.drug) return;
        if (it.drug.dosage_form === 'solvent') return;
        if (['oral','sublingual','topical','im','sc'].includes(it.drug.dosage_form)) oral.push(it);
        if (it.drug.dosage_form === 'iv_drip') iv.push(it);
      });
    });
    return { oral, iv };
  }

  // ---------- 通用辅助 ----------
  // 喹诺酮类识别（兼容中文“喹诺酮类”与英文 quinolone 分类名）
  function isQuinolone(drug) {
    if (!drug) return false;
    const c = drug.pharmacology_class || '';
    return c === '喹诺酮类' || /quinol/i.test(c);
  }
  // 从剂量字符串解析出 mg 数值（兼容 mg/g/ug/μg）
  function parseDoseMg(str) {
    if (str == null) return null;
    const m = String(str).match(/([\d.]+)\s*(mg|g|ug|μg)/i);
    if (!m) return null;
    let v = parseFloat(m[1]);
    if (isNaN(v)) return null;
    const u = m[2].toLowerCase();
    if (u === 'g') v *= 1000;
    else if (u === 'ug' || u === 'μg') v /= 1000;
    return v;
  }
  // 单次最大剂量（mg），兼容 dose_range_json 中 mg / g 两种字段
  function doseMaxMg(drug) {
    const dr = (drug && drug.dose_range_json) || {};
    if (dr.single_max_mg != null) return dr.single_max_mg;
    if (dr.single_max_g != null) return dr.single_max_g * 1000;
    return null;
  }
  function doseMinMg(drug) {
    const dr = (drug && drug.dose_range_json) || {};
    if (dr.single_min_mg != null) return dr.single_min_mg;
    if (dr.single_min_g != null) return dr.single_min_g * 1000;
    return null;
  }
  // 输液指征强弱：弱指征 → error，强客观指征 → warn
  function isWeakIvReason(reason) {
    if (!reason) return true;
    const weak = ['fever', 'patient_request', 'patient', 'other', 'other_without_note', '患者要求', '发热', '其他'];
    return weak.includes(reason);
  }

  // 溶媒名归一化：把 "0.9%氯化钠注射液 100ml/袋" 拆成 { base(通用名), volMl(体积) }
  // compat.json 溶媒名带体积规格，而药品库通用名不带，必须按通用名+体积匹配，避免字符串整体相等 miss
  function splitSolvent(name) {
    if (!name) return { base: '', volMl: null };
    let s = String(name).trim();
    s = s.replace(/[/／]\s*(袋|瓶|支)$/g, '').trim();
    const m = s.match(/^(.*?)[\s,，]*(\d+(?:\.\d+)?)\s*(ml|mL|ML|毫升)\s*$/);
    if (m) return { base: m[1].replace(/\s+/g, ''), volMl: parseFloat(m[2]) };
    return { base: s.replace(/\s+/g, ''), volMl: null };
  }
  // 两条溶媒记录是否指同一溶媒（通用名相同；记录有明确体积时体积须一致，保留100ml/250ml区分）
  function solventMatch(recSolvent, selectedSolvent) {
    const a = splitSolvent(recSolvent), b = splitSolvent(selectedSolvent);
    if (!a.base || !b.base || a.base !== b.base) return false;
    if (a.volMl != null && b.volMl != null && a.volMl !== b.volMl) return false;
    return true;
  }

  // =====================================================================
  // 主入口
  // =====================================================================
  function run(ctx) {
    const hits = [];
    const R = {};
    ctx.rulesMeta.forEach(r => R[r.rule_id] = r);

    const disease = ctx.disease;
    const patient = ctx.patient;
    const normal = ctx.normal_rx;
    const iv = ctx.iv_rx;
    const compat = ctx.compatData;

    // ---------- 工具：统计药品项总数（含溶媒） ----------
    function totalItems(rx) { return rx && rx.items && Array.isArray(rx.items) ? rx.items.length : 0; }
    function therapeuticItems(rx) {
      if (!rx || !rx.items || !Array.isArray(rx.items)) return [];
      return rx.items.filter(it => it && it.drug && it.drug.dosage_form !== 'solvent');
    }

    // ====================== 1. 格式类 ======================
    // FMT-01 每张处方≤5种药品（含溶媒）：>5种 直接 error（已与原 FMT-01-EXT 合并，删除矛盾分级）
    ['normal_rx','iv_rx'].forEach(k => {
      const rx = ctx[k];
      if (!rx) return;
      const n = totalItems(rx);
      if (n > 5) {
        hits.push(hit(R['FMT-01'], 'error',
          `当前处方共 ${n} 种药品（含溶媒），超过每张处方≤5种的法定上限。`,
          `删减至≤5种；确需超过须注明理由并经上级医师审核签字。`));
      }
    });

    // FMT-02 通用名
    ['normal_rx','iv_rx'].forEach(k => {
      const rx = ctx[k]; if (!rx || !rx.items || !Array.isArray(rx.items)) return;
      rx.items.forEach(it => {
        if (!it || !it.drug) return;
        if (!it.drug.generic_name) hits.push(hit(R['FMT-02'], 'error',
          `存在未填通用名的药品（仅商品名）。`, `必须使用药品通用名。`));
      });
    });

    // FMT-03 模糊用法
    ['normal_rx','iv_rx'].forEach(k => {
      const rx = ctx[k]; if (!rx || !rx.items || !Array.isArray(rx.items)) return;
      rx.items.forEach(it => {
        if (!it || !it.drug) return;
        const txt = (it.frequency || '') + ' ' + (it.single_dose || '');
        if (/遵医嘱|自用|照说明|酌量/.test(txt)) {
          hits.push(hit(R['FMT-03'], 'error',
            `药品「${it.drug.generic_name}」用法中出现模糊表述：${txt.trim()}`,
            `必须写清频次与单次剂量。`));
        }
      });
    });

    // FMT-04 法定公制单位 — 演示：剂量必须带单位
    ['normal_rx','iv_rx'].forEach(k => {
      const rx = ctx[k]; if (!rx || !Array.isArray(rx.items)) return;
      rx.items.forEach(it => {
        if (!it || !it.drug) return;
        if (it.drug.dosage_form === 'solvent') return;
        if (it.single_dose && !/\d+\s*(mg|g|ml|ug|μg|U|IU)/.test(it.single_dose)) {
          hits.push(hit(R['FMT-04'], 'warn',
            `「${it.drug.generic_name}」单次剂量「${it.single_dose}」未使用法定公制单位。`,
            `使用 mg/g/ml/μg 等法定单位。`));
        }
      });
    });

    // FMT-05 前记字段完整性
    if (!patient.name || !patient.gender || patient.age == null || !disease.name) {
      hits.push(hit(R['FMT-05'], 'error', '处方前记字段不完整（姓名/性别/年龄/诊断）。',
        '补全前记。'));
    }

    // FMT-06 编号规则
    if (iv && iv.rx_id && !/^IV-/.test(iv.rx_id)) {
      hits.push(hit(R['FMT-06'], 'warn', '输液处方编号应以 IV- 开头。', '按 科室代码-YYYYMMDD-6位流水号 重编。'));
    }

    // ====================== 2. 适应症 ======================
    // IND-01 / IND-02 / IND-03：遍历治疗性药品，检查是否在 disease 推荐列表
    // 对症支持类药物（止咳/化痰/抗过敏/解热镇痛/缓解鼻塞）不判超适应症
    const symptomaticDrugs = /氨溴索|乙酰半胱氨酸|羧甲司坦|右美沙芬|复方甘草|可待因|氯雷他定|西替利嗪|苯海拉明|布洛芬|对乙酰氨基酚|双氯芬酸|塞来昔布|美洛昔康|酚咖|感冒灵|小柴胡|板蓝根|连花清瘟|肺力咳|急支|川贝|甲氧那明|茶碱|孟鲁司特|伪麻黄碱|氯苯那敏|银黄|清肺/;
    ['normal_rx','iv_rx'].forEach(k => {
      const rx = ctx[k]; if (!rx || !Array.isArray(rx.items)) return;
      therapeuticItems(rx).forEach(it => {
        const g = it.drug.generic_name;
        // 对症药不判超适应症
        if (symptomaticDrugs.test(g)) {
          hits.push(pass(R['IND-01'], `「${g}」为对症支持用药，合规。`));
          return;
        }
        const inFirst = (disease.first_line_oral || []).includes(g);
        const inSecond = (disease.second_line_iv || []).includes(g);
        if (inFirst || inSecond) {
          hits.push(pass(R['IND-01'], `「${g}」与诊断「${disease.name}」适应症匹配。`));
          // IND-03：乙类药品即使适应症匹配，也提示核对医保限定支付范围
          if (it.drug.medical_insurance_class === '乙') {
            hits.push(hit(R['IND-03'], 'warn',
              `「${g}」为医保乙类药品，须核对其限定支付范围是否覆盖「${disease.name}」。`,
              `如诊断不在医保限定支付目录，需补充诊断或由患者自费。`));
          }
        } else {
          // IND-01：不在一线/二线推荐 → 超适应症 error
          hits.push(hit(R['IND-01'], 'error',
            `「${g}」不在「${disease.name}」的一线/二线推荐列表中，可能超适应症。`,
            `核对药品说明书适应症；或更换为推荐用药。`));
          // IND-02：超说明书用药提示（与 IND-01 互补，提醒循证/审批）
          hits.push(hit(R['IND-02'], 'warn',
            `「${g}」未列入本病种推荐目录，属超说明书用药，须有循证依据并经审批。`,
            `超说明书用药应循证并经医院药事管理与药物治疗学委员会审批。`));
        }
      });
    });

    // ====================== 3. 剂量 ======================
    ['normal_rx','iv_rx'].forEach(k => {
      const rx = ctx[k]; if (!rx || !Array.isArray(rx.items)) return;
      therapeuticItems(rx).forEach(it => {
        const maxMg = doseMaxMg(it.drug);
        const minMg = doseMinMg(it.drug);
        // 简单演示：若 single_dose 填了数字，检查是否在范围内
        if (it.single_dose && maxMg != null) {
          const v = parseDoseMg(it.single_dose);
          if (v != null) {
            if (v > maxMg * 1.5) {
              hits.push(hit(R['DOSE-01'], 'error',
                `「${it.drug.generic_name}」单次剂量 ${v}mg 超过说明书上限 ${maxMg}mg（1.5倍）。`,
                `下调至说明书范围。`));
            } else if (v > maxMg) {
              hits.push(hit(R['DOSE-01'], 'warn',
                `「${it.drug.generic_name}」单次剂量 ${v}mg 略超说明书上限 ${maxMg}mg。`,
                `复核剂量。`));
            } else if (minMg != null && v < minMg * 0.5) {
              hits.push(hit(R['DOSE-01'], 'warn',
                `「${it.drug.generic_name}」单次剂量 ${v}mg 低于说明书下限 ${minMg}mg 的一半，可能剂量不足。`,
                `复核给药剂量。`));
            }
          }
        }
      });
    });

    // DOSE-02 肝肾功能（演示：patient.renal_insufficiency / hepatic_insufficiency=true 时提示）
    if (patient.renal_insufficiency || patient.hepatic_insufficiency) {
      ['normal_rx','iv_rx'].forEach(k => {
        const rx = ctx[k]; if (!rx || !Array.isArray(rx.items)) return;
        therapeuticItems(rx).forEach(it => {
          if (it.drug.liver_renal_note && /减量|不全|慎用/.test(it.drug.liver_renal_note)) {
            hits.push(hit(R['DOSE-02'], 'warn',
              `患者肝/肾功能不全，「${it.drug.generic_name}」需调整剂量：${it.drug.liver_renal_note}`,
              `按 eGFR/Child-Pugh 调整剂量。`));
          }
        });
      });
    }

    // ====================== 4. 疗程 ======================
    // DUR-01
    ['normal_rx','iv_rx'].forEach(k => {
      const rx = ctx[k]; if (!rx) return;
      therapeuticItems(rx).forEach(it => {
        const d = parseFloat(it.duration_days);
        if (isNaN(d)) return;
        if (k === 'normal_rx' && d > 7) {
          hits.push(hit(R['DUR-01'], 'warn',
            `普通处方疗程 ${d} 天，超过 7 日上限。`, `一般≤7日。`));
        }
      });
    });

    // ====================== 5. 配伍 / 重复 ======================
    // DUP-01 处方内同类
    ['normal_rx','iv_rx'].forEach(k => {
      const rx = ctx[k]; if (!rx) return;
      const map = {};
      therapeuticItems(rx).forEach(it => {
        const c = it.drug.pharmacology_class;
        if (!map[c]) map[c] = [];
        map[c].push(it.drug.generic_name);
      });
      Object.keys(map).forEach(c => {
        if (map[c].length > 1) {
          hits.push(hit(R['DUP-01'], 'warn',
            `处方内药理分类「${c}」重复：${map[c].join(' + ')}`,
            `避免同类重复用药。`));
        }
      });
    });

    // DUP-02 跨通道口服+静脉同类
    const { oral, iv: ivDrugs } = collectRoutes(ctx);
    const oralClasses = new Set(oral.map(it => it.drug.pharmacology_class));
    const ivClasses = new Set(ivDrugs.map(it => it.drug.pharmacology_class));
    const overlap = [...oralClasses].filter(c => ivClasses.has(c));
    if (overlap.length) {
      const reason = iv && iv.iv_reason;
      if (reason !== 'sequential_therapy') {
        overlap.forEach(c => {
          const oNames = oral.filter(it => it.drug.pharmacology_class === c).map(it => it.drug.generic_name);
          const iNames = ivDrugs.filter(it => it.drug.pharmacology_class === c).map(it => it.drug.generic_name);
          hits.push(hit(R['DUP-02'], 'warn',
            `同次就诊口服+静脉同类交叉：口服[${oNames.join(',')}] + 静滴[${iNames.join(',')}]，且 iv_reason 未选择"序贯治疗"。`,
            `如确为序贯治疗，请将 iv_reason 改为"序贯治疗"；否则删除其中一组。`));
        });
      } else {
        overlap.forEach(c => {
          hits.push(pass(R['DUP-02'], `iv_reason=序贯治疗，同类口服+静脉联用合规。`));
        });
      }
    }

    // INT-01 喹诺酮 + 钙铝抗酸剂（演示：若处方内同时有喹诺酮和"含钙/铝"关键词药）
    const allRx = [...oral, ...ivDrugs];
    const hasFq = allRx.some(it => isQuinolone(it.drug));
    if (hasFq) {
      const antacid = allRx.find(it => /钙|铝|镁|铋|铁/.test(it.drug.generic_name || ''));
      if (antacid) {
        hits.push(hit(R['INT-01'], 'error',
          `喹诺酮类与「${antacid.drug.generic_name}」同处方：二价阳离子螯合显著降低喹诺酮吸收。`,
          `间隔≥2小时服用，或更换方案。`));
      }
    }

    // INT-02 ACEI/ARB + 保钾利尿剂（演示）
    const hasACEI_ARB_legacy = allRx.some(it => /普利|沙坦/.test(it.drug.generic_name || ''));
    const hasKspare = allRx.some(it => /螺内酯|氨苯蝶啶|阿米洛利/.test(it.drug.generic_name || ''));
    if (hasACEI_ARB_legacy && hasKspare) {
      hits.push(hit(R['INT-02'], 'warn',
        `ACEI/ARB 与保钾利尿剂联用，警惕高钾血症。`, `监测血钾。`));
    }

    // TCM-01 占位
    hits.push(pass(R['TCM-01'], '本批次未含中药饮片，十八反十九畏规则占位。'));

    // ====================== 6. 特殊人群 ======================
    // POP-01 儿童喹诺酮
    if (patient.age < 18) {
      allRx.forEach(it => {
        if (isQuinolone(it.drug)) {
          hits.push(hit(R['POP-01'], 'error',
            `患者实足年龄 ${patient.age} 岁（<18），禁用喹诺酮类「${it.drug.generic_name}」。`,
            `更换为青霉素/头孢类等儿童安全抗菌药。`));
        }
      });
    }

    // POP-02 老年输液速度/入量（每条处方只报一次）
    if (patient.age >= 65 && iv && Array.isArray(iv.items) && iv.items.length) {
      const speed = parseFloat(iv.drip_speed_mlh);
      if (!isNaN(speed) && speed > 60) {
        hits.push(hit(R['POP-02'], 'warn',
          `老年患者滴速 ${speed}ml/h 偏快（建议≤60ml/h）。`, `减速并监测心肺。`));
      }
      const tv = parseFloat(iv.total_volume_ml);
      if (!isNaN(tv) && tv > 1000) {
        hits.push(hit(R['POP-02'], 'warn',
          `老年患者单次输液总量 ${tv}ml 偏大（建议≤500ml）。`, `分次输注或改口服。`));
      }
    }

    // ====================== 7. 抗菌药物分级 ======================
    // ABX-01 special 门诊拦截
    allRx.forEach(it => {
      if (it.drug.abx_level === 'special') {
        hits.push(hit(R['ABX-01'], 'error',
          `「${it.drug.generic_name}」属特殊使用级抗菌药（${it.drug.abx_level}），门诊不得直接使用。`,
          `需住院治疗并经高级职称会诊审批；本处方应删除该药。`));
      }
    });

    // ABX-02 restricted 模拟确认
    const restrictedList = allRx.filter(it => it.drug.abx_level === 'restricted');
    if (restrictedList.length && ctx.restricted_confirmed) {
      restrictedList.forEach(it => {
        hits.push(pass(R['ABX-02'], `「${it.drug.generic_name}」为限制使用级，已由中级以上职称确认。`));
      });
    } else if (restrictedList.length && !ctx.restricted_confirmed) {
      restrictedList.forEach(it => {
        hits.push(hit(R['ABX-02'], 'warn',
          `「${it.drug.generic_name}」为限制使用级抗菌药，需中级以上职称确认。`,
          `请在弹窗中完成模拟确认。`));
      });
    }

    // ====================== 8. 静脉输液专项 IV-01 ~ IV-09 ======================
    if (iv && iv.items && iv.items.length) {

      // IV-01 输液指征与疾病标签一致性
      // 弱指征（发热/患者要求/其他/未填）→ error；有客观证据（脱水/不能口服/序贯）→ warn
      if (disease.iv_suitability === 'usually_no_iv') {
        if (isWeakIvReason(iv.iv_reason)) {
          hits.push(hit(R['IV-01'], 'error',
            `疾病「${disease.name}」通常无需输液（usually_no_iv），且输液指征不充分（${iv.iv_reason || '未填写'}）。`,
            `请复核：确有脱水/不能进食/重症感染等客观指征？否则建议改口服方案。`));
        } else {
          hits.push(hit(R['IV-01'], 'warn',
            `疾病「${disease.name}」通常无需输液，学生选择了静脉通道（指征：${iv.iv_reason}）。`,
            `请补充客观指征证据；否则建议改口服方案。`));
        }
      }

      // IV-02 口服/肌注替代可行性：有一线口服方案却无充分理由选静脉 → warn
      if (Array.isArray(disease.first_line_oral) && disease.first_line_oral.length > 0 &&
          iv.items.some(it => it.drug && it.drug.dosage_form === 'iv_drip')) {
        if (isWeakIvReason(iv.iv_reason)) {
          hits.push(hit(R['IV-02'], 'warn',
            `「${disease.name}」有一线口服方案（${disease.first_line_oral.slice(0,3).join('、')}），却无充分理由选择静脉给药。`,
            `遵循“能口服不肌注，能肌注不输液”原则；如确需静脉，请补充指征。`));
        } else {
          hits.push(pass(R['IV-02'], `有客观输液指征（${iv.iv_reason}），口服替代不适用。`));
        }
      }

      // IV-03 专项字段完整性
      const missing = [];
      if (!iv.iv_reason) missing.push('iv_reason');
      if (!iv.solvent_name) missing.push('solvent_name');
      if (!iv.drip_speed_mlh) missing.push('drip_speed_mlh');
      if (missing.length) {
        hits.push(hit(R['IV-03'], 'error',
          `输液专项字段缺失：${missing.join('、')}`,
          `补全所有输液专项字段。`));
      } else {
        hits.push(pass(R['IV-03'], '输液专项字段完整。'));
      }

      // IV-04 输液量与速度个体化
      const speed = parseFloat(iv.drip_speed_mlh);
      const special = patient.age >= 65 || patient.age <= 3 || patient.heart_renal_insufficiency;
      iv.items.forEach(it => {
        if (it.drug.dosage_form === 'solvent') return;
        const max = it.drug.drip_speed_max_mlh;
        if (!isNaN(speed) && max && speed > max) {
          const sev = special ? 'error' : 'warn';
          hits.push(hit(R['IV-04'], sev,
            `${special ? '老年/儿童/心肺肾功能不全患者' : '患者'}滴速 ${speed}ml/h 超过「${it.drug.generic_name}」说明书上限 ${max}ml/h。`,
            `按说明书减速。`));
        }
      });
      if (special) {
        const tv = parseFloat(iv.total_volume_ml);
        if (!isNaN(tv) && tv > 1000) {
          hits.push(hit(R['IV-04'], 'warn',
            `特殊人群单次输液总量 ${tv}ml 偏大（建议≤500ml）。`, `分次或改口服。`));
        }
      }

      // IV-05 门诊负面清单
      if (disease.negative_list_hit) {
        const hasIVDrug = iv.items.some(it => it.drug.dosage_form === 'iv_drip');
        if (hasIVDrug) {
          hits.push(hit(R['IV-05'], 'error',
            `诊断「${disease.name}」命中《门诊输液负面清单》（普通感冒/轻症高血压复诊/功能性消化不良/术后复诊等），却开具静脉给药。`,
            `门诊限输：改为口服/外用/随访。`));
        }
      }

      // 把拍平的 items 按输液组 group 分桶（同组=同一输液瓶）
      const ivGroupsMap = {};
      iv.items.forEach(it => {
        if (!it || !it.drug) return;
        const g = it.group || 1;
        (ivGroupsMap[g] = ivGroupsMap[g] || []).push(it);
      });

      // IV-06 溶媒-药物配伍（按输液组分别判定；溶媒按通用名+体积匹配，不再整串相等）
      Object.keys(ivGroupsMap).forEach(gk => {
        const gItems = ivGroupsMap[gk];
        const solventItem = gItems.find(it => it.drug.dosage_form === 'solvent');
        if (!solventItem) return;
        const solventName = (solventItem.drug.generic_name || '') + ' ' + (solventItem.drug.spec || '');
        gItems.forEach(it => {
          if (it.drug.dosage_form === 'solvent') return;
          const drugName = it.drug.generic_name;
          // 1) 先看药品自带 allowed_solvents_json（按通用名匹配）
          const allowed = it.drug.allowed_solvents_json || [];
          const hitAllowed = allowed.some(s => solventMatch(s, solventName));
          if (allowed.length && !hitAllowed) {
            hits.push(hit(R['IV-06'], 'error',
              `「${drugName}」说明书允许溶媒为：${allowed.join('、')}；所选溶媒「${solventName}」不在内。`,
              `更换为说明书指定溶媒。`));
            return;
          }
          // 2) 再查 compat.json（按通用名+体积匹配）
          const rec = (compat.solvent_drug || []).find(r => r.drug === drugName && solventMatch(r.solvent, solventName));
          if (rec) {
            if (rec.compatibility === 'incompatible') {
              hits.push(hit(R['IV-06'], 'error',
                `溶媒-药物配伍禁忌：${solventName} + ${drugName}。${rec.note}`,
                `更换溶媒或药物。`));
            } else if (rec.compatibility === 'caution') {
              hits.push(hit(R['IV-06'], 'warn',
                `溶媒-药物配伍需谨慎：${solventName} + ${drugName}。${rec.note}`,
                `建议更换为首选溶媒。`));
            }
          }
        });
      });

      // IV-07 中药注射剂单独输注（按输液组判定：跨组不视为同瓶混合）
      Object.keys(ivGroupsMap).forEach(gk => {
        const gItems = ivGroupsMap[gk].filter(it => it.drug && it.drug.dosage_form !== 'solvent');
        const tcm = gItems.filter(it => it.drug.is_tcm_injection);
        const others = gItems.filter(it => it.drug.dosage_form === 'iv_drip' && !it.drug.is_tcm_injection);
        if (tcm.length && others.length) {
          hits.push(hit(R['IV-07'], 'error',
            `第${gk}组：中药注射剂「${tcm.map(d=>d.drug.generic_name).join('、')}」与其他药物「${others.map(d=>d.drug.generic_name).join('、')}」同瓶混合。`,
            `中药注射剂必须单独成组、单独输注，严禁混合配伍。`));
        }
      });

      // DD-01 同瓶药物-药物配伍（compat.json drug_drug，按输液组判定同瓶组合）
      const DD = compat.drug_drug || [];
      Object.keys(ivGroupsMap).forEach(gk => {
        const gDrugs = ivGroupsMap[gk]
          .filter(it => it.drug && it.drug.dosage_form === 'iv_drip' && !it.drug.is_tcm_injection)
          .map(it => it.drug.generic_name);
        for (let i = 0; i < gDrugs.length; i++) {
          for (let j = i + 1; j < gDrugs.length; j++) {
            const a = gDrugs[i], b = gDrugs[j];
            const rec = DD.find(r => (r.drug_a === a && r.drug_b === b) || (r.drug_a === b && r.drug_b === a));
            if (!rec) continue;
            if (rec.compatibility === 'incompatible') {
              hits.push(hit(R['DD-01'], 'error',
                `同瓶药物配伍禁忌（第${gk}组）：${a} + ${b}。${rec.note}`,
                `严禁同瓶混合，须分瓶分开输注。`));
            } else if (rec.compatibility === 'caution') {
              hits.push(hit(R['DD-01'], 'warn',
                `同瓶药物配伍需谨慎（第${gk}组）：${a} + ${b}。${rec.note}`,
                `建议分瓶输注并加强监测。`));
            }
          }
        }
      });

      // IV-08 皮试核查：需皮试药品未填皮试结果或皮试阳性仍使用 → error；阴性 → pass
      iv.items.forEach(it => {
        if (!it || !it.drug || !it.drug.skin_test_required) return;
        const result = it.skin_test_result;
        if (result == null || result === '' || result === 'pending') {
          hits.push(hit(R['IV-08'], 'error',
            `「${it.drug.generic_name}」需皮试，但未填写皮试结果。`,
            `用药前必须完成皮试并记录阴性结果。`));
        } else if (result === 'positive' || result === '阳性') {
          hits.push(hit(R['IV-08'], 'error',
            `「${it.drug.generic_name}」皮试阳性，严禁使用。`,
            `更换为非青霉素/头孢类替代药物。`));
        } else {
          hits.push(pass(R['IV-08'],
            `「${it.drug.generic_name}」皮试阴性（${result}），可使用。`));
        }
      });

      // IV-09 门诊输液处方量
      iv.items.forEach(it => {
        const d = parseFloat(it.duration_days);
        if (!isNaN(d) && d > 1) {
          hits.push(hit(R['IV-09'], 'warn',
            `门诊静脉输液疗程 ${d} 天，超过当日单次常规。`,
            `门诊输液一般≤1日量；超量须医务科审批。`));
        }
      });

      // 儿童体重必填
      if (patient.age <= 14 && (!patient.weight || patient.weight <= 0)) {
        hits.push(hit(R['IV-04'], 'error',
          `儿童输液未填写体重。`, `按体重计算剂量与补液量。`));
      }
    }

    // ====================== 9. 云南省医保智能审方规则（第七批两库 2026.10） ======================
    // YN-01: 诊断与患者性别不符
    const femaleOnlyDx = ['妇科','月经','子宫','卵巢','输卵管','乳腺','妊娠','分娩','产后','盆腔炎','阴道炎','宫颈炎','更年期'];
    const maleOnlyDx = ['前列腺','睾丸','附睾','精囊','阴茎','包皮','勃起','早泄','遗精'];
    const dxName = (disease.name || '');
    if (patient.gender === '男' && femaleOnlyDx.some(k => dxName.includes(k))) {
      hits.push(hit(R['YN-01'], 'error',
        `诊断「${disease.name}」为女性专属疾病，但患者性别为男。`,
        `核对患者性别与诊断是否一致，如为鉴别诊断需说明理由。`));
    }
    if (patient.gender === '女' && maleOnlyDx.some(k => dxName.includes(k))) {
      hits.push(hit(R['YN-01'], 'error',
        `诊断「${disease.name}」为男性专属疾病，但患者性别为女。`,
        `核对患者性别与诊断是否一致。`));
    }

    // YN-02: 医保限适应症药品超范围支付（简化版：关键治疗药与诊断大类不匹配）
    const allRx2 = [ctx.normal_rx, ctx.iv_rx].filter(r => r && r.items && Array.isArray(r.items));
    const allDrugs2 = [];
    allRx2.forEach(rx => rx.items.forEach(it => { if (it && it.drug) allDrugs2.push(it.drug); }));
    // 合并症文本（P2-2：如 T2DM 合并高血压，患者 comorbidities 含"高血压"时，ACEI/CCB 仍属医保合理用药）
    const comorbsTxt = (Array.isArray(patient.comorbidities) ? patient.comorbidities.join(' ') : (patient.comorbidities||'')) + ' ' + (patient.note||'');
    // 降压药 vs 无高血压诊断
    const hasAntihypertensive = allDrugs2.some(d => /氨氯地平|硝苯地平|美托洛尔|缬沙坦|厄贝沙坦|卡托普利|依那普利|氯沙坦/.test(d.generic_name||''));
    const hasHypertensionDx = /高血压|冠心病|心绞痛|TIA|短暂性脑缺血/.test(dxName) || /高血压|冠心病|心绞痛/.test(comorbsTxt);
    if (hasAntihypertensive && !hasHypertensionDx) {
      hits.push(hit(R['YN-02'], 'error',
        `开具了降压/心血管药物，但诊断「${disease.name}」不在高血压/冠心病适应症范围内，医保基金不予支付。`,
        `核对诊断与用药适应症，如为合并症需补充对应诊断。`));
    }
    // 降糖药 vs 无糖尿病诊断
    const hasAntidiabetic = allDrugs2.some(d => /二甲双胍|格列美脲|格列齐特|胰岛素|阿卡波糖|西格列汀/.test(d.generic_name||''));
    const hasDiabetesDx = /糖尿病/.test(dxName) || /糖尿病/.test(comorbsTxt);
    if (hasAntidiabetic && !hasDiabetesDx) {
      hits.push(hit(R['YN-02'], 'error',
        `开具了降糖药物，但诊断「${disease.name}」不在糖尿病适应症范围内，医保基金不予支付。`,
        `核对诊断与用药适应症，如为糖尿病需补充对应诊断。`));
    }

    // ====================== 10. 新增：特殊人群与相互作用增强 ======================
    // （原 FMT-01-EXT 已合并入 FMT-01：>5种药品一律 error，不再重复分级扣分）

    // SPEC-01: 特殊人群剂量自动换算与调整
    const isElderly = patient.age >= 65;
    const isChild = patient.age <= 14;
    const hasRenalIssue = patient.renal_insufficiency;
    const hasLiverIssue = patient.hepatic_insufficiency;

    if (isElderly || isChild || hasRenalIssue || hasLiverIssue) {
      const popDesc = isElderly ? '老年患者（≥65岁）' : isChild ? '儿童患者' :
                      hasRenalIssue ? '肾功能不全患者' : '肝功能不全患者';
      ['normal_rx','iv_rx'].forEach(k => {
        const rx = ctx[k]; if (!rx || !Array.isArray(rx.items)) return;
        therapeuticItems(rx).forEach(it => {
          // 检查老年患者是否用了成人常规剂量（简化判断：有single_dose且超过上限的70%）
          const maxMg = doseMaxMg(it.drug);
          if (isElderly && it.single_dose && maxMg != null) {
            const v = parseDoseMg(it.single_dose);
            if (v != null && v > maxMg * 0.7) {
              hits.push(hit(R['SPEC-01'], 'warn',
                `${popDesc}「${it.drug.generic_name}」单次剂量 ${v}mg，建议从常规剂量的半量开始滴定（约 ${Math.round(maxMg*0.5)}mg）。`,
                `老年患者起始剂量宜减半，根据耐受情况逐步调整。`));
            }
          }
          // 儿童未按体重换算提示
          if (isChild && !patient.weight) {
            hits.push(hit(R['SPEC-01'], 'warn',
              `儿童患者「${it.drug.generic_name}」未填写体重，无法按 mg/kg 换算剂量。`,
              `请填写患儿体重，按 mg/kg 精确计算单次剂量。`));
          }
          // 肝肾功能不全提示
          if ((hasRenalIssue || hasLiverIssue) && it.drug.liver_renal_note) {
            if (/减量|不全|慎用|禁用/.test(it.drug.liver_renal_note)) {
              hits.push(hit(R['SPEC-01'], 'warn',
                `${popDesc}「${it.drug.generic_name}」需调整剂量：${it.drug.liver_renal_note}`,
                `根据 eGFR/Child-Pugh 分级调整剂量，必要时更换药物。`));
            }
          }
        });
      });
    }

    // SPEC-02: 禁忌症自动识别
    // 收集所有药品的禁忌症关键词
    const allWarnings = [];
    allDrugs2.forEach(d => {
      (d.special_warnings_json || []).forEach(w => allWarnings.push({drug: d.generic_name, warning: w}));
    });
    // 患者已知基础疾病/状态（简化：从disease.contraindications和patient推断）
    const patientFlags = {
      pregnancy: patient.pregnancy === true || /孕妇|妊娠/.test(patient.note||''),
      glaucoma: /青光眼/.test(patient.note||''),
      pepticUlcer: /消化性溃疡|胃溃疡|十二指肠溃疡/.test(patient.note||''),
      renalArteryStenosis: /肾动脉狭窄/.test(patient.note||''),
      hypotension: patient.bp_low === true,
      asthma: /哮喘/.test((disease.name||'') + (patient.note||'')),
    };
    // 检查禁忌症匹配
    allWarnings.forEach(({drug, warning}) => {
      if (patientFlags.pregnancy && /孕妇|妊娠|哺乳/.test(warning)) {
        hits.push(hit(R['SPEC-02'], 'error',
          `患者为孕妇/哺乳期，「${drug}」禁忌症：${warning}`,
          `妊娠期禁用药物，更换为妊娠安全级别更高的替代药。`));
      }
      if (patientFlags.glaucoma && /青光眼/.test(warning)) {
        hits.push(hit(R['SPEC-02'], 'error',
          `患者有青光眼，「${drug}」禁忌症：${warning}`,
          `青光眼禁用抗胆碱能药物，更换替代药。`));
      }
      if (patientFlags.pepticUlcer && /消化性溃疡|胃溃疡/.test(warning)) {
        hits.push(hit(R['SPEC-02'], 'warn',
          `患者有消化性溃疡病史，「${drug}」注意：${warning}`,
          `NSAIDs类药物可诱发消化道出血，建议联用PPI或更换为COX-2选择性抑制剂。`));
      }
      if (patientFlags.renalArteryStenosis && /肾动脉狭窄/.test(warning)) {
        hits.push(hit(R['SPEC-02'], 'error',
          `患者双侧肾动脉狭窄，「${drug}」禁忌症：${warning}`,
          `ACEI/ARB类药物在双侧肾动脉狭窄时禁用，更换为CCB类。`));
      }
    });

    // INTER-01: 药物相互作用深度审查（关键组合）
    const drugNames = allDrugs2.map(d => d.generic_name);
    const hasDrug = (name) => drugNames.some(n => n.includes(name));

    // SSRI + MAOI（5-羟色胺综合征）
    const hasSSRI = drugNames.some(n => /氟西汀|帕罗西汀|艾司西酞普兰|舍曲林|氟伏沙明/.test(n));
    const hasMAOI = drugNames.some(n => /吗氯贝胺|苯乙肼|反苯环丙胺/.test(n));
    if (hasSSRI && hasMAOI) {
      hits.push(hit(R['INTER-01'], 'error',
        `SSRI类抗抑郁药与MAOI类单胺氧化酶抑制剂合用，可致5-羟色胺综合征（高热、肌强直、意识障碍）。`,
        `两类药物禁用合用；停药后需间隔14天方可换用。`));
    }
    // ACEI/ARB + 保钾利尿剂（高钾血症）
    const hasACEI_ARB = drugNames.some(n => /卡托普利|依那普利|贝那普利|缬沙坦|厄贝沙坦|氯沙坦|替米沙坦/.test(n));
    const hasKSpareDiuretic = drugNames.some(n => /螺内酯|氨苯蝶啶|阿米洛利/.test(n));
    if (hasACEI_ARB && hasKSpareDiuretic) {
      hits.push(hit(R['INTER-01'], 'error',
        `ACEI/ARB与保钾利尿剂合用，可致严重高钾血症（心律失常风险）。`,
        `合用时需监测血钾，或更换为噻嗪类利尿剂。`));
    }
    // 华法林 + NSAIDs（出血风险）
    const hasWarfarin = hasDrug('华法林');
    const hasNSAID = drugNames.some(n => /布洛芬|双氯芬酸|萘普生|塞来昔布|美洛昔康|阿司匹林/.test(n));
    if (hasWarfarin && hasNSAID) {
      hits.push(hit(R['INTER-01'], 'error',
        `华法林与NSAIDs合用，显著增加消化道出血和颅内出血风险。`,
        `如需镇痛建议改用对乙酰氨基酚，或联用PPI保护胃黏膜。`));
    }
    // 他汀 + 大环内酯类（横纹肌溶解）
    const hasStatin = drugNames.some(n => /阿托伐他汀|瑞舒伐他汀|辛伐他汀|普伐他汀/.test(n));
    const hasMacrolide = drugNames.some(n => /红霉素|克拉霉素|阿奇霉素/.test(n));
    if (hasStatin && hasMacrolide) {
      hits.push(hit(R['INTER-01'], 'error',
        `他汀类与大环内酯类抗生素合用，可显著增加横纹肌溶解风险（CYP3A4抑制）。`,
        `建议暂停他汀，或更换为头孢类/喹诺酮类抗生素。`));
    }
    // 两种以上中枢抑制药合用（镇静叠加）
    const CNSDepressants = drugNames.filter(n => /阿普唑仑|佐匹克隆|艾司唑仑|地西泮|氯硝西泮|曲马多|奥氮平|利培酮/.test(n));
    if (CNSDepressants.length >= 2) {
      hits.push(hit(R['INTER-01'], 'warn',
        `同时使用多种中枢抑制药（${CNSDepressants.join('、')}），可致过度镇静、呼吸抑制。`,
        `避免联用两种以上中枢抑制剂；确需合用时需监测呼吸和意识状态。`));
    }

    // ====================== 11. 检验检查单（LAB） ======================
    const labRx = ctx.lab_rx;
    const labItems = (labRx && Array.isArray(labRx.items)) ? labRx.items : [];
    const diseaseLabMap = ctx.disease_lab_map || {};
    const expectedRows = (disease && disease.code && diseaseLabMap[disease.code]) ? diseaseLabMap[disease.code] : [];
    const expectedCodes = new Set(expectedRows.map(r => r.exam_code));
    // 本病种是否存在异常指标（abnormal/high/low）
    const hasAbnormalInCase = expectedRows.some(r => r.status === 'abnormal' || r.status === 'high' || r.status === 'low');

    // 并列开具模型：医生有权只开药不开检验；未开检验时给 pass 级中性提示，不扣分
    if (labItems.length === 0) {
      hits.push(hit(R['LAB-03'], 'pass',
        `本次未开具检验检查项目。${hasAbnormalInCase ? '（本病例已有异常指标，如条件允许建议后续复查追踪。）' : ''}`,
        ''));
    } else {
      // LAB-01 重复开具：同一 exam_code 出现 >1 次
      const codeCount = {};
      labItems.forEach(it => {
        const c = it.exam_code || (it.name || '');
        codeCount[c] = (codeCount[c] || 0) + 1;
      });
      const dupCodes = Object.keys(codeCount).filter(c => codeCount[c] > 1);
      if (dupCodes.length) {
        const dupNames = dupCodes.map(c => {
          const it = labItems.find(x => (x.exam_code || x.name) === c);
          return (it && it.name) ? it.name : c;
        });
        hits.push(hit(R['LAB-01'], 'error',
          `检验检查单存在重复项目：${dupNames.join('、')}（同一项目开具 ${dupCodes.map(c => codeCount[c]).join('、')} 次）。`,
          `删除重复行；同一申请单内一个检验项目只应开具一次，复查应在病程中另行申请。`));
      }

      // LAB-02 过度检查/适应症不符：已开项目不在本病种预期 exam_code 列表内
      const offTarget = labItems.filter(it => it.exam_code && !expectedCodes.has(it.exam_code));
      if (offTarget.length) {
        const names = offTarget.map(it => it.name + (it.abbr ? `（${it.abbr}）` : ''));
        hits.push(hit(R['LAB-02'], 'warn',
          `开具的检验检查项目「${names.join('、')}」与本病种「${disease.name}」常规评估项目无明显对应关系，存在无指征检查可能。`,
          `检验项目应与临床诊断相适应；如为鉴别诊断或合并症需要，请在病历中说明理由，否则建议删减。`));
      }
    }

    // ====================== 12. 手术指征判断（SURGERY） ======================
    // ctx.surgery_rx = {decision, timing, procedure_id}；ctx.surgeryCase 为 surgeries.json 对应病例。
    // 未做手术决策（纯处方/纯检验就诊）时整组跳过，不扣分。
    const surgeryRx = ctx.surgery_rx;
    const surgeryCase = ctx.surgeryCase;
    if (surgeryRx && surgeryRx.decision && surgeryCase) {
      const std = surgeryCase.standard || {};
      const dxNameS = disease.name || '';
      const tLabel = id => (surgeryCase.timing_options || []).find(t => t.id === id)?.label || id || '';
      const pLabel = id => (surgeryCase.procedure_options || []).find(p => p.id === id)?.name || id || '';

      // SUR-01：有手术指征却选保守（延误治疗）
      if (std.decision === 'surgery' && surgeryRx.decision === 'conservative') {
        hits.push(hit(R['SUR-01'], 'error',
          `「${dxNameS}」具有明确手术指征，你选择了保守治疗，可能延误病情（穿孔/坏死/感染扩散等风险）。`,
          `本病种一经确诊应及时手术干预；仅在患者存在明确禁忌症不能耐受手术时方可保守，并须在病历中说明理由。`));
      }
      // SUR-02：无手术指征却选手术（过度医疗）
      else if (std.decision === 'conservative' && surgeryRx.decision === 'surgery') {
        hits.push(hit(R['SUR-02'], 'error',
          `「${dxNameS}」适宜保守治疗，你选择了手术治疗，存在过度医疗指征。`,
          `本例应先行保守治疗并随访；确有手术指征须有充分影像学/病情依据并经上级医师会诊。`));
      }
      // 决策方向正确 → 正向通过提示
      else if (std.decision === surgeryRx.decision) {
        hits.push(pass(R['SUR-01'],
          `手术指征决策与本病种标准一致（${std.decision === 'surgery' ? '拟手术治疗' : '保守治疗'}）。`));
      }

      // 以下仅在医生选择手术时进一步核对时机与术式
      if (std.decision === 'surgery' && surgeryRx.decision === 'surgery') {
        // SUR-03：手术时机选择错误
        if (surgeryRx.timing && surgeryRx.timing !== std.timing) {
          hits.push(hit(R['SUR-03'], 'warn',
            `手术时机选择欠妥：你选「${tLabel(surgeryRx.timing)}」，本病种宜「${tLabel(std.timing)}」。`,
            `按病情紧急程度定时机：急腹症/穿孔/大出血应急诊手术，限期病变完善检查后24-48小时内手术，择期病变可待炎症控制后手术。`));
        }
        // SUR-04：术式选择不当（未选首选术式）
        if (surgeryRx.procedure_id && surgeryRx.procedure_id !== std.procedure_id) {
          hits.push(hit(R['SUR-04'], 'warn',
            `术式与首选方案不一致：你选「${pLabel(surgeryRx.procedure_id)}」，本病种首选「${pLabel(std.procedure_id)}」。`,
            `首选术式通常创伤小、恢复快；改变术式须有术中发现或患者个体化依据（如穿孔、严重粘连）。`));
        }
        // SUR-05（禁忌症仍安排手术）：本病种 contraindications 为一般性禁忌宣教，
        // 具体患者是否真的存在禁忌由 SUR-01/SUR-02 决策方向覆盖；此处不重复扣分，避免对正确答案误报。
      }
    }

    // ====================== 13. 儿童体重 mg/kg 剂量核算（DOSAGE-WT） ======================
    // 仅当患者有体重且药品有 pediatric_dose 时触发；避免对成人无体重患者误报。
    const patientWeight = parseFloat(patient.weight);
    const hasWeight = !isNaN(patientWeight) && patientWeight > 0 && patientWeight < 200;
    if (hasWeight) {
      ['normal_rx','iv_rx'].forEach(k => {
        const rx = ctx[k]; if (!rx || !Array.isArray(rx.items)) return;
        therapeuticItems(rx).forEach(it => {
          const pd = it.drug.pediatric_dose;
          if (!pd) return;
          const g = it.drug.generic_name;
          // 解析单次剂量（mg 或 U）
          const doseStr = it.single_dose || '';
          // 胰岛素类用 U
          if (pd.basis === 'per_hour' && /胰岛素/.test(g)) {
            const m = String(doseStr).match(/([\d.]+)\s*(U|IU|u)/i);
            if (!m) return;
            const uPerHr = parseFloat(m[1]);
            const perKg = uPerHr / patientWeight;
            if (perKg > pd.unit_per_kg_max * 1.5) {
              hits.push(hit(R['DOSAGE-WT'], 'error',
                `「${g}」按 ${uPerHr} U/h 给予，患者 ${patientWeight}kg 折合 ${perKg.toFixed(3)} U/kg/h，超过儿童/DKA 推荐 ${pd.unit_per_kg_min}-${pd.unit_per_kg_max} U/kg/h 上限。`,
                `按 0.05-0.1 U/kg/h 静脉泵入，每小时复测血糖与血钾。`));
            } else if (perKg > pd.unit_per_kg_max) {
              hits.push(hit(R['DOSAGE-WT'], 'warn',
                `「${g}」折合 ${perKg.toFixed(3)} U/kg/h，略高于推荐上限 ${pd.unit_per_kg_max} U/kg/h。`,
                `复核胰岛素泵速与血糖下降速率（每小时 3.9-6.1 mmol/L）。`));
            }
            return;
          }
          const v = parseDoseMg(doseStr);
          if (v == null) return;
          // fixed_dose：布地奈德雾化等，按固定单次剂量区间
          if (pd.basis === 'fixed_dose') {
            if (v > pd.per_dose_mg_max) {
              hits.push(hit(R['DOSAGE-WT'], 'warn',
                `「${g}」单次 ${v}mg 超过儿童常用单次 ${pd.per_dose_mg_min}-${pd.per_dose_mg_max}mg 上限。`,
                `建议 ${pd.per_dose_mg_min}-${pd.per_dose_mg_max}mg/次 ${pd.interval||''}。`));
            }
            return;
          }
          if (pd.basis === 'age_banded') {
            // 蒙脱石散：按年龄分档，不按体重核算，跳过重量计算但提示
            return;
          }
          // per_dose：单次 mg/kg
          if (pd.basis === 'per_dose') {
            const perKg = v / patientWeight;
            const cap = pd.max_single_mg;
            if (cap && v > cap) {
              hits.push(hit(R['DOSAGE-WT'], 'error',
                `「${g}」单次 ${v}mg 超过单次封顶 ${cap}mg（${pd.note||''}）。`,
                `下调至单次 ≤${cap}mg。`));
            } else if (perKg > pd.mg_per_kg_max * 1.5) {
              hits.push(hit(R['DOSAGE-WT'], 'error',
                `「${g}」单次 ${v}mg / ${patientWeight}kg = ${perKg.toFixed(1)} mg/kg，超过儿童推荐 ${pd.mg_per_kg_min}-${pd.mg_per_kg_max} mg/kg/次 1.5 倍。`,
                `按 ${pd.mg_per_kg_max} mg/kg/次 折算，约 ${Math.round(pd.mg_per_kg_max*patientWeight)}mg/次 ${pd.interval||''}。`));
            } else if (perKg > pd.mg_per_kg_max) {
              hits.push(hit(R['DOSAGE-WT'], 'warn',
                `「${g}」折合 ${perKg.toFixed(1)} mg/kg/次，略高于推荐上限 ${pd.mg_per_kg_max} mg/kg。`,
                `复核剂量：${pd.note||''}`));
            } else if (perKg < pd.mg_per_kg_min * 0.5) {
              hits.push(hit(R['DOSAGE-WT'], 'warn',
                `「${g}」折合 ${perKg.toFixed(1)} mg/kg/次，低于推荐下限 ${pd.mg_per_kg_min} mg/kg 的一半，可能剂量不足。`,
                `建议 ${pd.mg_per_kg_min}-${pd.mg_per_kg_max} mg/kg/次。`));
            }
            return;
          }
          // per_day：日剂量 = 单次 × 日次数；与 mg_per_kg_min/max 比较
          if (pd.basis === 'per_day') {
            const freqPerDay = ({'qd':1,'bid':2,'tid':3,'qid':4,'q8h':3,'q12h':2,'qn':1,'st':1,'prn':1,'q6h':4,'q12h':2})[it.frequency] || pd.doses_per_day || 3;
            const dailyMg = v * freqPerDay;
            const perKgPerDay = dailyMg / patientWeight;
            if (perKgPerDay > pd.mg_per_kg_max * 1.5) {
              hits.push(hit(R['DOSAGE-WT'], 'error',
                `「${g}」日剂量 ${dailyMg}mg / ${patientWeight}kg = ${perKgPerDay.toFixed(1)} mg/kg/天，超过儿童推荐 ${pd.mg_per_kg_min}-${pd.mg_per_kg_max} mg/kg/天 1.5 倍。`,
                `按 ${pd.mg_per_kg_max} mg/kg/天 分 ${pd.doses_per_day||freqPerDay} 次，约 ${Math.round(pd.mg_per_kg_max*patientWeight/freqPerDay)}mg/次。`));
            } else if (perKgPerDay > pd.mg_per_kg_max) {
              hits.push(hit(R['DOSAGE-WT'], 'warn',
                `「${g}」日剂量折合 ${perKgPerDay.toFixed(1)} mg/kg/天，略高于推荐上限 ${pd.mg_per_kg_max} mg/kg/天。`,
                `复核：${pd.note||''}`));
            }
            return;
          }
        });
      });
    }

    // ====================== 14. 过敏史 / 合并症 / 妊娠 ======================
    // ALLERGY-01：患者过敏史关键词匹配处方药品
    const allergyRaw = (patient.allergies || patient.allergy || '').toString().trim();
    if (allergyRaw) {
      // 拆关键词：按逗号/顿号/分号/空格切分；同时识别大类
      const allergyKeywords = allergyRaw.split(/[,，、;；\s]+/).map(s => s.trim()).filter(Boolean);
      // 大类扩展：青霉素类过敏 → 阿莫西林/氨苄西林/哌拉西林/头孢类（提示交叉）
      const betaLactamAllergy = allergyKeywords.some(k => /青霉素|阿莫西林|氨苄|哌拉西林|β内酰胺|内酰胺/.test(k));
      const sulfonamideAllergy = allergyKeywords.some(k => /磺胺|复方新诺明|柳氮/.test(k));
      const nsaidAllergy = allergyKeywords.some(k => /NSAID|非甾体|布洛芬|双氯芬酸|阿司匹林|对乙酰氨基酚/.test(k));
      allDrugs2.forEach(d => {
        const name = d.generic_name || '';
        // 1) 精确命中通用名
        const hitKw = allergyKeywords.find(k => k && (name.includes(k) || k.includes(name)));
        if (hitKw) {
          hits.push(hit(R['ALLERGY-01'], 'error',
            `患者既往药物过敏史：${allergyRaw}；本次处方「${name}」命中过敏关键词「${hitKw}」。`,
            `立即停用该药，更换为非交叉过敏替代药；必要时行皮试。`));
          return;
        }
        // 2) 青霉素类过敏 → 任何青霉素/头孢类（教学提示交叉过敏）
        if (betaLactamAllergy && /阿莫西林|氨苄|哌拉西林|青霉素|苯唑西林|氯唑西林/.test(name)) {
          hits.push(hit(R['ALLERGY-01'], 'error',
            `患者自述青霉素类过敏，本次处方「${name}」同属青霉素类，禁用。`,
            `更换为大环内酯类/呼吸喹诺酮（成人）等非β-内酰胺类替代。`));
        }
        // 3) 磺胺过敏 → 磺胺类
        if (sulfonamideAllergy && /磺胺|复方磺胺|柳氮|塞来昔布|格列/.test(name)) {
          hits.push(hit(R['ALLERGY-01'], 'error',
            `患者自述磺胺类过敏，本次处方「${name}」含磺胺结构。`,
            `更换为非磺胺类替代。`));
        }
        // 4) NSAID 过敏 → 同类 NSAID
        if (nsaidAllergy && /布洛芬|双氯芬酸|萘普生|塞来昔布|美洛昔康|阿司匹林|洛索洛芬/.test(name)) {
          hits.push(hit(R['ALLERGY-01'], 'error',
            `患者自述 NSAID/解热镇痛药过敏，本次处方「${name}」同类。`,
            `如需镇痛考虑对乙酰氨基酚（若未过敏）或阿片类。`));
        }
      });
    }

    // COMORBID-01~04：合并症禁忌
    const comorbs = Array.isArray(patient.comorbidities) ? patient.comorbidities :
                    (patient.comorbidities ? patient.comorbidities.toString().split(/[,，、;；]+/).map(s=>s.trim()).filter(Boolean) : []);
    const hasCom = (k) => comorbs.some(c => c.includes(k));
    if (comorbs.length) {
      // COMORBID-01 G6PD 缺乏
      if (hasCom('G6PD') || hasCom('蚕豆')) {
        const g6pdDrugs = allDrugs2.filter(d => /伯氨喹|磺胺|呋喃妥因|呋喃唑酮|蚕豆|萘啶酸|维生素K3|维生素K4/.test(d.generic_name||''));
        g6pdDrugs.forEach(d => {
          hits.push(hit(R['COMORBID-01'], 'error',
            `患者 G6PD 缺乏（蚕豆病），「${d.generic_name}」为氧化性药物，可诱发急性溶血。`,
            `禁用；感染时选用青霉素/头孢类等非氧化性抗菌药。`));
        });
      }
      // COMORBID-02 青光眼
      if (hasCom('青光眼')) {
        const glaucomDrugs = allDrugs2.filter(d => /阿托品|山莨菪碱|东莨菪碱|托吡卡胺|苯海拉明|异丙嗪|麻黄碱|伪麻黄碱|复方甘草/.test(d.generic_name||''));
        glaucomDrugs.forEach(d => {
          hits.push(hit(R['COMORBID-02'], 'error',
            `患者青光眼，「${d.generic_name}」具抗胆碱作用，可升高眼压诱发闭角型青光眼急性发作。`,
            `更换为无抗胆碱作用替代药；如需解痉用选择性平滑肌松弛药。`));
        });
      }
      // COMORBID-03 前列腺增生
      if (hasCom('前列腺')) {
        const bphDrugs = allDrugs2.filter(d => /阿托品|山莨菪碱|东莨菪碱|苯海拉明|异丙嗪|麻黄碱|伪麻黄碱|氯苯那敏|抗组胺/.test(d.generic_name||''));
        bphDrugs.forEach(d => {
          hits.push(hit(R['COMORBID-03'], 'warn',
            `患者前列腺增生，「${d.generic_name}」具抗胆碱/减充血作用，可能致急性尿潴留。`,
            `如必须使用需监测排尿；优先选用无抗胆碱副作用替代药。`));
        });
      }
    }
    // COMORBID-04 妊娠禁忌（独立判断：patient.pregnant=true 或 comorbidities 含妊娠）
    const isPregnant = patient.pregnant === true || patient.pregnancy === true ||
                       comorbs.some(c => /妊娠|孕/.test(c)) || /孕妇|妊娠/.test(patient.note||'');
    if (isPregnant) {
      const pregRe = /卡托普利|依那普利|贝那普利|缬沙坦|厄贝沙坦|氯沙坦|替米沙坦|阿托伐他汀|瑞舒伐他汀|辛伐他汀|左氧氟沙星|环丙沙星|莫西沙星|四环素|多西环素|米诺环素|华法林|异维A酸|甲氨蝶呤|利巴韦林|雌激素|孕激素|口服避孕药/;
      allDrugs2.forEach(d => {
        if (pregRe.test(d.generic_name||'')) {
          hits.push(hit(R['COMORBID-04'], 'error',
            `患者妊娠状态，「${d.generic_name}」为妊娠禁忌/D-X 类药物，可致胎儿畸形或流产。`,
            `更换为妊娠安全级别高（B/C 类）替代药；用药需产科医师会诊。`));
        }
      });
    }

    // ====================== 15. 经济性提示（ECON-01，仅 warn 不扣分） ======================
    // 规则：若处方中某药 jtc_batch 为空，且同 pharmacology_class 存在集采品种，则提示
    try {
      const classHasJtc = {};
      (ctx.drugDb || []).forEach(d => {
        if (d && d.pharmacology_class && d.jtc_batch) classHasJtc[d.pharmacology_class] = true;
      });
      allDrugs2.forEach(d => {
        if (!d || !d.pharmacology_class) return;
        if (!d.jtc_batch && classHasJtc[d.pharmacology_class]) {
          hits.push(hit(R['ECON-01'], 'warn',
            `「${d.generic_name}」（${d.spec||''}）未列入国家/地方集采中选目录，同类药理分类（${d.pharmacology_class}）已有集采品种，价格更低。`,
            `在疗效相当前提下，优先选用集采中选药品以降低患者负担。`));
        }
      });
    } catch (e) { /* drugDb 未注入时静默跳过 */ }

    return hits;
  }

  global.RxRuleEngine = { run };
})(window);
