/* W-8: THYROID-E04 改为先FNA后决定；W-9: LUMB-M51 改为先保守治疗 */
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const sgPath = path.join(ROOT, 'data/surgeries.json');
const sg = JSON.parse(fs.readFileSync(sgPath, 'utf8'));

// W-8: 甲状腺结节 TI-RADS 4a —— 先FNA，不直接手术
const thyroid = sg.cases['THYROID-E04'];
if (thyroid) {
  thyroid.standard = {
    decision: 'conservative',       // 不直接手术，先穿刺评估
    timing: 'elective',             // FNA择期安排，病理回报后再定
    procedure_id: 'FNA_first',
    conservative_ok: true            // 允许"暂不手术先穿刺/随访"
  };
  console.log('[surgeries.json] THYROID-E04: standard 改为先FNA（conservative）');
}

// W-9: 腰突 —— 首诊先保守3个月，严格手术指征
const lumb = sg.cases['LUMB-M51'];
if (lumb) {
  lumb.standard = {
    decision: 'conservative',       // 初发/无红旗征先保守
    timing: 'none',                  // 暂不手术，卧床+NSAIDs+康复
    procedure_id: 'conservative_physio',
    conservative_ok: true
  };
  console.log('[surgeries.json] LUMB-M51: standard 改为先保守治疗');
}

fs.writeFileSync(sgPath, JSON.stringify(sg, null, 2), 'utf8');

// 验证
const sg2 = JSON.parse(fs.readFileSync(sgPath, 'utf8'));
console.log('\n=== 验证 ===');
console.log('THYROID-E04 standard:', JSON.stringify(sg2.cases['THYROID-E04'].standard));
console.log('LUMB-M51 standard:', JSON.stringify(sg2.cases['LUMB-M51'].standard));
