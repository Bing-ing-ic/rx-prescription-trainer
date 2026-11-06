/* W-7: 药品双轨命名合并去重
 * 策略：以"通用名+剂型"为主表，裸名/盐型变体并入规范名，aliases 保留历史名
 */
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');

const drugsPath = path.join(ROOT, 'data/drugs.json');
const disPath = path.join(ROOT, 'data/diseases.json');
const drugs = JSON.parse(fs.readFileSync(drugsPath, 'utf8'));
const dis = JSON.parse(fs.readFileSync(disPath, 'utf8'));

// 合并映射：duplicateName -> canonicalName
const mergeMap = {
  // 裸名 -> 规范名
  '氨氯地平': '苯磺酸氨氯地平片',
  '二甲双胍': '盐酸二甲双胍缓释片',
  '布洛芬': '布洛芬缓释胶囊',
  '奥美拉唑': '奥美拉唑肠溶胶囊',
  '头孢呋辛酯': '头孢呋辛酯片',
  '谷维素': '谷维素片',
  '左甲状腺素钠': '左甲状腺素钠片',
  '多潘立酮': '多潘立酮片',
  '双歧杆菌三联活菌': '双歧杆菌三联活菌胶囊',
  '阿奇霉素': '阿奇霉素分散片',
  '呋喃妥因': '呋喃妥因肠溶片',
  '比索洛尔': '比索洛尔片',
  '卡托普利': '卡托普利片',
  '缬沙坦': '缬沙坦胶囊',
  '氯吡格雷': '氯吡格雷片',
  '法莫替丁': '法莫替丁片',
  '兰索拉唑': '兰索拉唑肠溶胶囊',
  '乳果糖': '乳果糖口服液',
  '孟鲁司特钠': '孟鲁司特钠片',
  '格列美脲': '格列美脲片',
  '阿卡波糖': '阿卡波糖片',
  '对乙酰氨基酚': '对乙酰氨基酚片',
  '非布司他': '非布司他片',
  '别嘌醇': '别嘌醇片',
  '莫沙必利': '莫沙必利片',
  '格列齐特': '格列齐特缓释片',
  '双氯芬酸钠': '双氯芬酸钠缓释片',
  '塞来昔布': '塞来昔布胶囊',
  '氯雷他定': '氯雷他定片',
  '西替利嗪': '西替利嗪片',
  '非洛地平': '非洛地平缓释片',
  '匹维溴铵': '匹维溴铵片',
  '瑞格列奈': '瑞格列奈片',
  '乙酰半胱氨酸': '乙酰半胱氨酸泡腾片',
  '头孢地尼': '头孢地尼分散片',
  '甲钴胺': '甲钴胺片',
  '秋水仙碱': '秋水仙碱片',
  '铝碳酸镁': '铝碳酸镁咀嚼片',
  '枸橼酸铋钾': '枸橼酸铋钾颗粒',
  '阿莫西林克拉维酸钾': '阿莫西林克拉维酸钾片',
  '美托洛尔': '酒石酸美托洛尔片',
  '头孢克肟': '头孢克肟胶囊',
  // 盐型/命名变体 -> 规范名
  '盐酸左氧氟沙星片': '左氧氟沙星片',
  '美托洛尔缓释片': '琥珀酸美托洛尔缓释片',
  '盐酸美托洛尔缓释片': '琥珀酸美托洛尔缓释片',
  '氨溴索口服溶液': '盐酸氨溴索口服溶液',
  '硫酸阿米卡星注射液': '阿米卡星'
};

// 先建立名称索引
let byName = {};
drugs.drugs.forEach((d, i) => { byName[d.generic_name] = i; });

// 验证所有 canonical 存在
for (const dup of Object.keys(mergeMap)) {
  const canon = mergeMap[dup];
  if (!(canon in byName)) {
    console.log('!! canonical NOT FOUND:', canon, '(target of', dup + ')');
  }
  if (!(dup in byName)) {
    console.log('!! duplicate NOT FOUND:', dup);
  }
}

// 执行合并：把 duplicate 的信息并入 canonical 的 aliases，删除 duplicate
const removed = [];
for (const [dupName, canonName] of Object.entries(mergeMap)) {
  if (!(dupName in byName) || !(canonName in byName)) continue;
  const canon = drugs.drugs[byName[canonName]];
  const dup = drugs.drugs[byName[dupName]];
  // 初始化 aliases
  if (!Array.isArray(canon.aliases)) canon.aliases = [];
  if (!canon.aliases.includes(dupName)) canon.aliases.push(dupName);
  // 合并 special_warnings（去重）
  if (!Array.isArray(canon.special_warnings_json)) canon.special_warnings_json = [];
  (dup.special_warnings_json || []).forEach(w => {
    if (!canon.special_warnings_json.includes(w)) canon.special_warnings_json.push(w);
  });
  removed.push(dupName + ' -> ' + canonName);
}

// 从后往前删除重复条目
const dupNames = Object.keys(mergeMap);
const indicesToRemove = new Set();
drugs.drugs.forEach((d, i) => { if (dupNames.includes(d.generic_name)) indicesToRemove.add(i); });
// 同时去重完全相同的 0.9%氯化钠注射液、10%葡萄糖注射液（保留首次出现）
const seen = {};
drugs.drugs.forEach((d, i) => {
  if (indicesToRemove.has(i)) return;
  const key = d.generic_name + '|' + d.dosage_form + '|' + d.spec;
  if (seen[key] !== undefined) {
    indicesToRemove.add(i);
    removed.push('[exact dup] ' + d.generic_name + ' (keeps index ' + seen[key] + ')');
  } else {
    seen[key] = i;
  }
});

drugs.drugs = drugs.drugs.filter((d, i) => !indicesToRemove.has(i));
console.log('[drugs.json] 合并删除', removed.length, '条，剩余', drugs.drugs.length, '条');

// 更新 diseases.json 中的药名引用
let disUpdated = 0;
dis.diseases.forEach(d => {
  ['first_line_oral', 'second_line_iv'].forEach(k => {
    if (Array.isArray(d[k])) {
      d[k] = d[k].map(name => {
        if (mergeMap[name]) { disUpdated++; return mergeMap[name]; }
        return name;
      });
    }
  });
});
console.log('[diseases.json] 药名引用更新', disUpdated, '处');

// 写入
fs.writeFileSync(drugsPath, JSON.stringify(drugs, null, 2), 'utf8');
fs.writeFileSync(disPath, JSON.stringify(dis, null, 2), 'utf8');

console.log('\n=== 合并清单 (' + removed.length + ' 组) ===');
removed.forEach(r => console.log('  ' + r));
