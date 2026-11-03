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
    // FMT-01 ≤5种
    ['normal_rx','iv_rx'].forEach(k => {
      const rx = ctx[k];
      if (!rx) return;
      const n = totalItems(rx);
      if (n > 5) hits.push(hit(R['FMT-01'], 'error',
        `当前处方共 ${n} 种药品（含溶媒），超过 5 种上限。`,
        `删减至 ≤5 种；溶媒计入总数。`));
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
      const rx = ctx[k]; if (!rx) return;
      rx.items.forEach(it => {
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
    // IND-01 / IND-02：遍历治疗性药品，检查是否在 disease 推荐列表
    // 对症支持类药物（止咳/化痰/抗过敏/解热镇痛/缓解鼻塞）不判超适应症
    const symptomaticDrugs = /氨溴索|乙酰半胱氨酸|羧甲司坦|右美沙芬|复方甘草|可待因|氯雷他定|西替利嗪|苯海拉明|布洛芬|对乙酰氨基酚|双氯芬酸|塞来昔布|美洛昔康|酚咖|感冒灵|小柴胡|板蓝根|连花清瘟|肺力咳|急支|川贝|甲氧那明|茶碱|孟鲁司特|伪麻黄碱|氯苯那敏|银黄|清肺/;
    ['normal_rx','iv_rx'].forEach(k => {
      const rx = ctx[k]; if (!rx) return;
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
        } else {
          hits.push(hit(R['IND-01'], 'error',
            `「${g}」不在「${disease.name}」的一线/二线推荐列表中，可能超适应症。`,
            `核对药品说明书适应症；或更换为推荐用药。`));
        }
      });
    });

    // ====================== 3. 剂量 ======================
    ['normal_rx','iv_rx'].forEach(k => {
      const rx = ctx[k]; if (!rx) return;
      therapeuticItems(rx).forEach(it => {
        const dr = it.drug.dose_range_json || {};
        // 简单演示：若 single_dose 填了数字，检查是否在范围内
        if (it.single_dose && dr.single_min_mg != null) {
          const m = String(it.single_dose).match(/([\d.]+)\s*(mg|g)/i);
          if (m) {
            let v = parseFloat(m[1]);
            if (m[2].toLowerCase() === 'g') v *= 1000;
            if (v > dr.single_max_mg * 1.5) {
              hits.push(hit(R['DOSE-01'], 'error',
                `「${it.drug.generic_name}」单次剂量 ${v}mg 超过说明书上限 ${dr.single_max_mg}mg。`,
                `下调至说明书范围。`));
            } else if (v > dr.single_max_mg) {
              hits.push(hit(R['DOSE-01'], 'warn',
                `「${it.drug.generic_name}」单次剂量 ${v}mg 略超说明书上限 ${dr.single_max_mg}mg。`,
                `复核剂量。`));
            }
          }
        }
      });
    });

    // DOSE-02 肝肾功能（演示：patient.renal_insufficiency=true 时提示）
    if (patient.renal_insufficiency) {
      ['normal_rx','iv_rx'].forEach(k => {
        const rx = ctx[k]; if (!rx) return;
        therapeuticItems(rx).forEach(it => {
          if (it.drug.liver_renal_note && /减量|不全|慎用/.test(it.drug.liver_renal_note)) {
            hits.push(hit(R['DOSE-02'], 'warn',
              `患者肾功能不全，「${it.drug.generic_name}」需调整剂量：${it.drug.liver_renal_note}`,
              `按 eGFR 调整剂量。`));
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
    const hasFq = allRx.some(it => it.drug.pharmacology_class === '喹诺酮类');
    if (hasFq) {
      const antacid = allRx.find(it => /钙|铝|镁|铋|铁/.test(it.drug.generic_name));
      if (antacid) {
        hits.push(hit(R['INT-01'], 'error',
          `喹诺酮类与「${antacid.drug.generic_name}」同处方：二价阳离子螯合显著降低喹诺酮吸收。`,
          `间隔≥2小时服用，或更换方案。`));
      }
    }

    // INT-02 ACEI + 保钾利尿剂（演示）
    const hasACEI = allRx.some(it => /普利/.test(it.drug.generic_name));
    const hasKspare = allRx.some(it => /螺内酯|氨苯蝶啶/.test(it.drug.generic_name));
    if (hasACEI && hasKspare) {
      hits.push(hit(R['INT-02'], 'warn',
        `ACEI 与保钾利尿剂联用，警惕高钾血症。`, `监测血钾。`));
    }

    // TCM-01 占位
    hits.push(pass(R['TCM-01'], '本批次未含中药饮片，十八反十九畏规则占位。'));

    // ====================== 6. 特殊人群 ======================
    // POP-01 儿童喹诺酮
    if (patient.age < 18) {
      allRx.forEach(it => {
        if (it.drug.pharmacology_class === '喹诺酮类') {
          hits.push(hit(R['POP-01'], 'error',
            `患者实足年龄 ${patient.age} 岁（<18），禁用喹诺酮类「${it.drug.generic_name}」。`,
            `更换为青霉素/头孢类等儿童安全抗菌药。`));
        }
      });
    }

    // POP-02 老年输液速度
    if (patient.age >= 65 && iv && iv.items) {
      iv.items.forEach(it => {
        if (it.drug.dosage_form === 'solvent') return;
        const speed = parseFloat(iv.drip_speed_mlh);
        const max = it.drug.drip_speed_max_mlh;
        if (!isNaN(speed) && max && speed > 60) {
          hits.push(hit(R['POP-02'], 'warn',
            `老年患者滴速 ${speed}ml/h 偏快（建议≤60ml/h）。`, `减速并监测心肺。`));
        }
      });
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

      // IV-01 输液指征与疾病标签一致性（学生选了输液通道即视为有指征；usually_no_iv 给 warn 提醒而非 error）
      if (disease.iv_suitability === 'usually_no_iv') {
        hits.push(hit(R['IV-01'], 'warn',
          `疾病「${disease.name}」标签为 usually_no_iv（通常无需输液），学生选择了静脉通道。`,
          `请复核：是否确有脱水/不能进食/重症感染等客观指征？否则建议改口服方案。`));
      }

      // IV-02 口服替代可行性（学生已明确选择输液，不再警告）
      // （原规则已停用：避免对学生做重复提示）

      // IV-03 专项字段完整性（终浓度/输注时间已由医生按临床判断，不再强制）
      const missing = [];
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

      // IV-06 溶媒-药物配伍
      iv.items.forEach(it => {
        if (it.drug.dosage_form === 'solvent') return;
        const drugName = it.drug.generic_name;
        const solventName = iv.solvent_name;
        if (!solventName) return;
        // 1) 先看药品自带 allowed_solvents
        const allowed = it.drug.allowed_solvents_json || [];
        const hitAllowed = allowed.find(s => solventName.indexOf(s.replace(/\s*\d+(ml|g)/,'').trim()) >= 0 || s.indexOf(solventName.replace(/\s*\d+(ml|g)/,'').trim()) >= 0);
        if (allowed.length && !hitAllowed) {
          hits.push(hit(R['IV-06'], 'error',
            `「${drugName}」说明书允许溶媒为：${allowed.join('、')}；所选溶媒「${solventName}」不在内。`,
            `更换为说明书指定溶媒。`));
          return;
        }
        // 2) 再查 compat.json
        const rec = (compat.solvent_drug || []).find(r =>
          r.drug === drugName && (r.solvent === solventName || r.solvent.indexOf(solventName)>=0 || solventName.indexOf(r.solvent)>=0)
        );
        if (rec) {
          if (rec.compatibility === 'incompatible') {
            hits.push(hit(R['IV-06'], 'error',
              `溶媒-药物配伍禁忌：${solventName} + ${drugName}。${rec.note}`,
              `更换溶媒或药物。`));
          } else if (rec.compatibility === 'caution') {
            hits.push(hit(R['IV-06'], 'warn',
              `溶媒-药物配伍需谨慎：${solventName} + ${drugName}。${rec.note}`,
              `建议更换为首选溶媒。`));
          } else {
            hits.push(pass(R['IV-06'], `${solventName} + ${drugName} 配伍合规。`));
          }
        }
      });

      // IV-07 中药注射剂单独输注
      const tcmInPump = iv.items.filter(it => it.drug.is_tcm_injection);
      const therapeuticInPump = iv.items.filter(it => it.drug.dosage_form === 'iv_drip' && !it.drug.is_tcm_injection);
      if (tcmInPump.length && therapeuticInPump.length) {
        hits.push(hit(R['IV-07'], 'error',
          `中药注射剂「${tcmInPump.map(d=>d.drug.generic_name).join('、')}」与其他药物「${therapeuticInPump.map(d=>d.drug.generic_name).join('、')}」同瓶混合。`,
          `中药注射剂必须单独输注，严禁混合配伍。`));
      } else if (tcmInPump.length) {
        hits.push(pass(R['IV-07'], `中药注射剂「${tcmInPump.map(d=>d.drug.generic_name).join('、')}」单独输注，合规。`));
      }

      // IV-08 皮试（按现行抗菌药物临床应用指导原则，青霉素类等可在详细询问过敏史后免皮试，不再强制）
      iv.items.forEach(it => {
        if (!it.drug.skin_test_required) return;
        hits.push(pass(R['IV-08'],
          `「${it.drug.generic_name}」按说明书建议皮试，已按现行规范豁免强制皮试（须详细询问过敏史并记录）。`));
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
    const allRx = [ctx.normal_rx, ctx.iv_rx].filter(r => r && r.items && Array.isArray(r.items));
    const allDrugs = [];
    allRx.forEach(rx => rx.items.forEach(it => { if (it && it.drug) allDrugs.push(it.drug); }));
    // 降压药 vs 无高血压诊断
    const hasAntihypertensive = allDrugs.some(d => /氨氯地平|硝苯地平|美托洛尔|缬沙坦|厄贝沙坦|卡托普利|依那普利|氯沙坦/.test(d.generic_name||''));
    const hasHypertensionDx = /高血压|冠心病|心绞痛|TIA|短暂性脑缺血/.test(dxName);
    if (hasAntihypertensive && !hasHypertensionDx) {
      hits.push(hit(R['YN-02'], 'error',
        `开具了降压/心血管药物，但诊断「${disease.name}」不在高血压/冠心病适应症范围内，医保基金不予支付。`,
        `核对诊断与用药适应症，如为合并症需补充对应诊断。`));
    }
    // 降糖药 vs 无糖尿病诊断
    const hasAntidiabetic = allDrugs.some(d => /二甲双胍|格列美脲|格列齐特|胰岛素|阿卡波糖|西格列汀/.test(d.generic_name||''));
    const hasDiabetesDx = /糖尿病/.test(dxName);
    if (hasAntidiabetic && !hasDiabetesDx) {
      hits.push(hit(R['YN-02'], 'error',
        `开具了降糖药物，但诊断「${disease.name}」不在糖尿病适应症范围内，医保基金不予支付。`,
        `核对诊断与用药适应症，如为糖尿病需补充对应诊断。`));
    }

    return hits;
  }

  global.RxRuleEngine = { run };
})(window);
