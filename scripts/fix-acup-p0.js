// 修复针灸推拿模块 3 个 P0：A-1 心包经编码、A-2 ACUP-007 加列缺、A-3 补5个缺失穴位
const fs = require('fs');
const path = require('path');

const DATA = path.join(__dirname, '..', 'data');
const ptsPath = path.join(DATA, 'acup-points.json');
const casesPath = path.join(DATA, 'acup-cases.json');
const rulesPath = path.join(DATA, 'acup-rules.json');

// ---------- 1. acup-points.json ----------
const pts = JSON.parse(fs.readFileSync(ptsPath, 'utf8'));
const beforeCount = pts.points.length;
const log = [];

// A-1: 间使 code PC-06 -> PC-05
const jianshi = pts.points.find(p => p.name === '间使');
if (jianshi) {
  log.push(`A-1 间使: ${jianshi.code} -> PC-05`);
  jianshi.code = 'PC-05';
}
// A-1: 内关 code PC-06B -> PC-06
const neiguan = pts.points.find(p => p.name === '内关');
if (neiguan) {
  log.push(`A-1 内关: ${neiguan.code} -> PC-06`);
  neiguan.code = 'PC-06';
}

// A-3: 补 5 个穴位
const newPoints = [
  {
    code: 'LI-06',
    name: '偏历',
    pinyin: 'pianli',
    meridian: '手阳明大肠经',
    location: '屈肘，前臂背面桡侧，阳溪与曲池连线上，腕横纹上3寸',
    category: '络穴',
    functions: '清热利咽，通络止痛，通调水道',
    indications: ['耳鸣', '耳聋', '鼻衄', '目赤', '牙痛', '喉痛', '手臂酸痛', '水肿'],
    needling_method: '直刺0.5-0.8寸',
    special_note: '大肠经络穴；原络配穴常与肺经原穴太渊配对（肺先病取太渊配偏历）'
  },
  {
    code: 'BL-11',
    name: '大杼',
    pinyin: 'dazhu',
    meridian: '足太阳膀胱经',
    location: '第1胸椎棘突下，后正中线旁开1.5寸',
    category: '八会穴（骨会）',
    functions: '疏风解表，宣肺定喘，强筋骨',
    indications: ['咳嗽', '发热', '头痛', '项强', '肩背痛', '颈项强急', '骨节酸痛'],
    needling_method: '斜刺0.5-0.8寸，不可向内深刺（深部为肺脏，防气胸）',
    special_note: '八会穴之骨会；手足太阳经交会穴；骨病取之'
  },
  {
    code: 'LR-13',
    name: '章门',
    pinyin: 'zhangmen',
    meridian: '足厥阴肝经',
    location: '侧腹部，第11肋游离端下方',
    category: '八会穴（脏会）/脾募',
    functions: '疏肝健脾，化积消滞，软坚散结',
    indications: ['腹痛', '腹胀', '肠鸣', '泄泻', '呕吐', '胁痛', '痞块', '小儿疳积'],
    needling_method: '斜刺0.5-0.8寸，不可深刺（左侧深部为脾，右侧为肝右叶）',
    special_note: '八会穴之脏会；脾募穴；足厥阴、足少阳交会穴；脏病取之'
  },
  {
    code: 'ST-39',
    name: '下巨虚',
    pinyin: 'xiajuxu',
    meridian: '足阳明胃经',
    location: '犊鼻下9寸，胫骨前嵴外一横指（约中指横径）',
    category: '下合穴（小肠）',
    functions: '调理肠胃，清利湿热，通经活络',
    indications: ['小腹痛', '泄泻', '痢疾', '乳痈', '下肢痿痹', '腰脊痛引睾丸'],
    needling_method: '直刺1-1.5寸',
    special_note: '小肠之下合穴；《灵枢·邪气脏腑病形》"合治内腑"'
  },
  {
    code: 'BL-39',
    name: '委阳',
    pinyin: 'weiyang',
    meridian: '足太阳膀胱经',
    location: '腘横纹外端，股二头肌腱内缘',
    category: '下合穴（三焦）',
    functions: '通利三焦，舒筋利节',
    indications: ['腹满', '小便不利', '水肿', '小腹胀痛', '腰脊强痛', '腿足挛痛'],
    needling_method: '直刺1-1.5寸，避开腘动静脉及股二头肌腱',
    special_note: '三焦之下合穴；调理三焦气机、通利水道要穴'
  }
];

// 检查是否已存在（按 name 或 code）
for (const np of newPoints) {
  const exists = pts.points.find(p => p.name === np.name || p.code === np.code);
  if (exists) {
    log.push(`A-3 跳过（已存在）: ${np.name} ${np.code}`);
  } else {
    pts.points.push(np);
    log.push(`A-3 新增: ${np.code} ${np.name} (${np.category})`);
  }
}

// 写回（2 空格缩进，UTF-8 无 BOM，保持 \n 换行）
fs.writeFileSync(ptsPath, JSON.stringify(pts, null, 2) + '\n', 'utf8');
log.push(`穴位数: ${beforeCount} -> ${pts.points.length}`);

// ---------- 2. acup-cases.json: ACUP-007 加列缺 ----------
const cases = JSON.parse(fs.readFileSync(casesPath, 'utf8'));
const c007 = cases.cases.find(c => c.code === 'ACUP-007');
if (c007) {
  if (!c007.reference_points.includes('列缺')) {
    // 插入位置：放在后溪之后，合谷之前（远部八脉交会穴并列）
    const idx = c007.reference_points.indexOf('后溪');
    c007.reference_points.splice(idx + 1, 0, '列缺');
    log.push(`A-2 ACUP-007 reference_points 加入列缺 -> ${c007.reference_points.join('、')}`);
  } else {
    log.push(`A-2 ACUP-007 已含列缺，跳过`);
  }
}
fs.writeFileSync(casesPath, JSON.stringify(cases, null, 2) + '\n', 'utf8');

// ---------- 3. acup-rules.json: ACUP-PRINCIPLE-04 文案修正 ----------
const rules = JSON.parse(fs.readFileSync(rulesPath, 'utf8'));
const r04 = rules.rules.find(r => r.rule_id === 'ACUP-PRINCIPLE-04');
if (r04) {
  const old = r04.logic;
  r04.logic = '头项强痛、外感头痛、落枕、项痹等应配列缺穴（肺经络穴，通任脉）；后溪通督脉亦治项强，两穴可同用';
  log.push(`A-2 ACUP-PRINCIPLE-04 logic: "${old}" -> "${r04.logic}"`);
}
fs.writeFileSync(rulesPath, JSON.stringify(rules, null, 2) + '\n', 'utf8');

console.log(log.join('\n'));
