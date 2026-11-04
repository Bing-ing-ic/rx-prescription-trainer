/* 临时冒烟测试：验证8项P0修复行为（node 直接运行） */
const fs = require('fs');
const path = require('path');
global.window = global;
eval(fs.readFileSync(path.join(__dirname,'..','js','rule-engine.js'),'utf8'));
eval(fs.readFileSync(path.join(__dirname,'..','js','review.js'),'utf8'));
const rules = JSON.parse(fs.readFileSync(path.join(__dirname,'..','data','rules.json'),'utf8')).rules;
const compat = JSON.parse(fs.readFileSync(path.join(__dirname,'..','data','compat.json'),'utf8'));

const patient = { name:'测试', gender:'男', age:30 };
const disease = { name:'普通感冒', icd10:'J00', iv_suitability:'usually_no_iv', negative_list_hit:true, first_line_oral:['阿莫西林胶囊'], second_line_iv:[] };

function drug(over){ return Object.assign({ generic_name:'X', dosage_form:'iv_drip', pharmacology_class:'other', skin_test_required:false, is_tcm_injection:false }, over); }

let pass=0, fail=0;
function check(name, cond){ if(cond){pass++;console.log('  ✅',name);} else {fail++;console.log('  ❌',name);} }

// 1. 空处方 → 0分不合格
{
  const ctx = { disease, patient, normal_rx:{items:[]}, iv_rx:null, rulesMeta:rules, compatData:compat, restricted_confirmed:false };
  const hits = RxRuleEngine.run(ctx);
  const r = Reviewer.score(hits, ctx);
  check('空处方总分=0', r.total===0);
  check('空处方标记 emptyPrescription', r.emptyPrescription===true);
}

// 2. IV-01：普通感冒(usually_no_iv) + 指征发热 → error；脱水 → warn
{
  function ivCtx(reason){
    return { disease, patient, normal_rx:null, rulesMeta:rules, compatData:compat, restricted_confirmed:false,
      iv_rx:{ rx_id:'IV-1', iv_reason:reason, solvent_name:'0.9%氯化钠注射液 100ml/袋', drip_speed_mlh:60,
        items:[ {drug:drug({dosage_form:'solvent',generic_name:'0.9%氯化钠注射液'}),group:1},
                {drug:drug({generic_name:'注射用头孢呋辛钠',skin_test_required:true}),group:1, skin_test_result:'negative'} ] } };
  }
  const hFever = RxRuleEngine.run(ivCtx('fever'));
  check('IV-01 发热指征→error', hFever.some(h=>h.rule_id==='IV-01'&&h.severity==='error'));
  const hDeh = RxRuleEngine.run(ivCtx('severe_dehydration'));
  check('IV-01 脱水指征→warn', hDeh.some(h=>h.rule_id==='IV-01'&&h.severity==='warn'));
}

// 3. IV-08：需皮试药未填(pending)→error；阴性→pass
{
  const ctx = { disease:{...disease, iv_suitability:null, negative_list_hit:false}, patient, normal_rx:null, rulesMeta:rules, compatData:compat, restricted_confirmed:false,
    iv_rx:{ rx_id:'IV-1', iv_reason:'no_oral_alternative', solvent_name:'0.9%氯化钠注射液 100ml/袋', drip_speed_mlh:60,
      items:[ {drug:drug({dosage_form:'solvent',generic_name:'0.9%氯化钠注射液'}),group:1},
              {drug:drug({generic_name:'注射用头孢呋辛钠',skin_test_required:true}),group:1, skin_test_result:'pending'} ] } };
  const hits = RxRuleEngine.run(ctx);
  check('IV-08 pending→error', hits.some(h=>h.rule_id==='IV-08'&&h.severity==='error'));
}

// 4. drug_drug 同瓶禁忌：头孢呋辛钠 + 维生素C 同组 → error
{
  const ctx = { disease:{...disease, iv_suitability:null, negative_list_hit:false}, patient, normal_rx:null, rulesMeta:rules, compatData:compat, restricted_confirmed:false,
    iv_rx:{ rx_id:'IV-1', iv_reason:'no_oral_alternative', solvent_name:'0.9%氯化钠注射液 100ml/袋', drip_speed_mlh:60,
      items:[ {drug:drug({dosage_form:'solvent',generic_name:'0.9%氯化钠注射液'}),group:1},
              {drug:drug({generic_name:'注射用头孢呋辛钠'}),group:1},
              {drug:drug({generic_name:'维生素C注射液'}),group:1} ] } };
  const hits = RxRuleEngine.run(ctx);
  check('DD-01 头孢+VC同瓶→error', hits.some(h=>h.rule_id==='DD-01'&&h.severity==='error'));
}

// 5. 溶媒通用名匹配：头孢呋辛钠 + 5%GS 250ml → incompatible error（按通用名+体积）
{
  const ctx = { disease:{...disease, iv_suitability:null, negative_list_hit:false}, patient, normal_rx:null, rulesMeta:rules, compatData:compat, restricted_confirmed:false,
    iv_rx:{ rx_id:'IV-1', iv_reason:'no_oral_alternative', solvent_name:'5%葡萄糖注射液 250ml/袋', drip_speed_mlh:60,
      items:[ {drug:drug({dosage_form:'solvent',generic_name:'5%葡萄糖注射液',spec:'250ml/袋'}),group:1},
              {drug:drug({generic_name:'注射用头孢呋辛钠'}),group:1} ] } };
  const hits = RxRuleEngine.run(ctx);
  check('IV-06 头孢+5%GS→error(通用名匹配)', hits.some(h=>h.rule_id==='IV-06'&&h.severity==='error'&&/5%葡萄糖/.test(h.message)));
}

// 6. IV-07 跨组不误报：清开灵单独组 + 头孢另一组
{
  const ctx = { disease:{...disease, iv_suitability:null, negative_list_hit:false}, patient, normal_rx:null, rulesMeta:rules, compatData:compat, restricted_confirmed:false,
    iv_rx:{ rx_id:'IV-1', iv_reason:'no_oral_alternative', solvent_name:'0.9%氯化钠注射液 100ml/袋', drip_speed_mlh:60,
      items:[ {drug:drug({dosage_form:'solvent',generic_name:'5%葡萄糖注射液',spec:'250ml/袋'}),group:1},
              {drug:drug({generic_name:'清开灵注射液',is_tcm_injection:true}),group:1},
              {drug:drug({dosage_form:'solvent',generic_name:'0.9%氯化钠注射液',spec:'100ml/袋'}),group:2},
              {drug:drug({generic_name:'注射用头孢呋辛钠'}),group:2} ] } };
  const hits = RxRuleEngine.run(ctx);
  check('IV-07 跨组不混合→无error', !hits.some(h=>h.rule_id==='IV-07'&&h.severity==='error'));
}

// 7. FMT-01：>5种 → error（不再有FMT-01-EXT）
{
  const items = [];
  for(let i=0;i<7;i++) items.push({drug:drug({generic_name:'药'+i}),});
  const ctx = { disease:{...disease, iv_suitability:null, negative_list_hit:false}, patient, rulesMeta:rules, compatData:compat, restricted_confirmed:false,
    normal_rx:{ rx_id:'MZ-1', items }, iv_rx:null };
  const hits = RxRuleEngine.run(ctx);
  check('FMT-01 7种→error', hits.some(h=>h.rule_id==='FMT-01'&&h.severity==='error'));
  check('无残留FMT-01-EXT', !hits.some(h=>h.rule_id==='FMT-01-EXT'));
}

console.log(`\n结果: ${pass} 通过, ${fail} 失败`);
process.exit(fail?1:0);
