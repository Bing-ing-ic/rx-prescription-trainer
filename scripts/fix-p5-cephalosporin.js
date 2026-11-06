// P5-2: 统一注射用头孢菌素类 skin_test_required=true
// 口服头孢保持原样（不强制改）
const fs = require('fs');
const path = require('path');

const FILE = path.join(__dirname, '..', 'data', 'drugs.json');
const raw = fs.readFileSync(FILE, 'utf8');
const hadBom = raw.charCodeAt(0) === 0xFEFF;
const data = JSON.parse(raw);

const list = data.drugs;
const changed = [];
const alreadyTrue = [];
const oral = [];
const skipped = [];

for (const x of list) {
  const name = x.generic_name || '';
  if (!name.includes('头孢')) continue;
  // 非抗菌药命中（如维生素C注射液备注提及），跳过
  if (x.abx_level === 'none') { skipped.push(name); continue; }

  const isInjectable = x.dosage_form === 'iv_drip' || x.dosage_form === 'iv_push' || /^注射用/.test(name);
  if (isInjectable) {
    if (x.skin_test_required === true) {
      alreadyTrue.push(name);
    } else {
      x.skin_test_required = true;
      changed.push(name);
    }
  } else {
    oral.push(`${name}(skin=${x.skin_test_required})`);
  }
}

// 2 空格缩进写回，保持 BOM 状态
const out = JSON.stringify(data, null, 2);
fs.writeFileSync(FILE, (hadBom ? '﻿' : '') + out, 'utf8');

console.log('=== 已改为 true ===');
changed.forEach(n => console.log('  + ' + n));
console.log('=== 原本已是 true（未动）===');
alreadyTrue.forEach(n => console.log('  = ' + n));
console.log('=== 口服头孢（保持原样）===');
oral.forEach(n => console.log('  o ' + n));
console.log('=== 非头孢命中跳过 ===');
skipped.forEach(n => console.log('  - ' + n));
console.log('\n共修改 ' + changed.length + ' 条');
