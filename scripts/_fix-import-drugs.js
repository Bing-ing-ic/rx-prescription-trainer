// 修复新增进口药的字段一致性：
// 1. medical_insurance_class "乙类" -> "乙"（与原库 336 条规范一致）
// 2. 美罗培南那条补全缺失字段（brand_name/dose_range_json/otc_class/is_iv_capable 等）
const fs = require('fs');
const path = 'data/drugs.json';
const d = JSON.parse(fs.readFileSync(path, 'utf8'));

let fixed = 0;
d.drugs.forEach(x => {
  if (x.medical_insurance_class === '乙类') {
    x.medical_insurance_class = '乙';
    fixed++;
  }
  if (x.medical_insurance_class === '医保乙类') {
    x.medical_insurance_class = '乙';
    fixed++;
  }
});

// 修复美罗培南
const mero = d.drugs.find(x => x.generic_name === '注射用美罗培南');
if (mero && !mero.brand_name) {
  mero.brand_name = '美平';
  mero.unit = '支';
  mero.otc_class = '处方药';
  mero.essential_medicine = false;
  mero.liver_renal_note = '肾功能不全需根据肌酐清除率调整剂量';
  mero.is_iv_capable = true;
  mero.allowed_solvents_json = ['0.9%氯化钠注射液', '5%葡萄糖注射液'];
  mero.drip_speed_max_mlh = 100;
  mero.skin_test_required = false;
  mero.special_warnings_json = ['与丙戊酸联用可降低后者血药浓度', '中枢神经系统感染慎用'];
  mero.is_solvent = false;
  mero.is_tcm_injection = false;
  mero.aliases = ['美罗培南', '美平', 'Meropenem'];
  // 补 dose_range_json（如果缺）
  if (!mero.dose_range_json) {
    mero.dose_range_json = {
      single_min_mg: 500,
      single_max_mg: 1000,
      daily_max_mg: 3000,
      default_freq: 'q8h',
      default_duration_days: 7
    };
  }
  // jtc_batch 原来是 true，修正为空字符串
  if (typeof mero.jtc_batch === 'boolean') mero.jtc_batch = '';
  console.log('✓ 美罗培南字段已补全');
}

fs.writeFileSync(path, JSON.stringify(d, null, 2), 'utf8');
console.log('✓ 医保类别修复:', fixed, '条');
console.log('✓ 总药品数:', d.drugs.length);
