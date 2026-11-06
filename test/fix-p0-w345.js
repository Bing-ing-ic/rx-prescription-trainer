/* P0 修复脚本：W-3 (DKA+胰岛素) / W-4 (哮喘SABA) / W-5 (阑尾炎口服一线) */
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');

// ---- 1. drugs.json: 新增普通胰岛素 ----
const drugsPath = path.join(ROOT, 'data/drugs.json');
const drugs = JSON.parse(fs.readFileSync(drugsPath, 'utf8'));

// 防重复
const exists = drugs.drugs.find(d => d.generic_name === '普通胰岛素注射液');
if (!exists) {
  // 找到门冬胰岛素的位置，插在其后
  const idx = drugs.drugs.findIndex(d => d.generic_name.includes('门冬胰岛素'));
  const regularInsulin = {
    "generic_name": "普通胰岛素注射液",
    "brand_name": "诺和灵R",
    "dosage_form": "iv_drip",
    "spec": "400u/10ml",
    "unit": "支",
    "medical_insurance_class": "甲",
    "essential_medicine": true,
    "jtc_batch": null,
    "otc_class": "处方药",
    "abx_level": "none",
    "pharmacology_class": "短效胰岛素",
    "dose_range_json": {
      "single_min_u": 4,
      "single_max_u": 12,
      "daily_max_u": 48,
      "default_freq": "持续静滴",
      "default_duration_days": 1
    },
    "liver_renal_note": "肾功能不全者胰岛素清除减慢，需减量并监测血糖",
    "is_iv_capable": true,
    "allowed_solvents_json": [
      "0.9%氯化钠注射液 50ml",
      "0.9%氯化钠注射液 250ml"
    ],
    "drip_speed_max_mlh": 20,
    "skin_test_required": false,
    "special_warnings_json": [
      "DKA/酮症酸中毒时予0.05-0.1 U/kg/h持续静脉泵入，每1-2h监测血糖",
      "血糖降至13.9mmol/L后换5%葡萄糖液+胰岛素中和",
      "亦可皮下注射用于餐时血糖控制，静脉仅用于急症",
      "可致低血糖，需备50%葡萄糖"
    ],
    "is_solvent": false,
    "is_tcm_injection": false,
    "price_yuan": 20,
    "manufacturer": "诺和诺德",
    "pinyin": "ptdszsy",
    "pinyin_code": "PTDSZSY",
    "reference_status": "core"
  };
  drugs.drugs.splice(idx + 1, 0, regularInsulin);
  console.log('[drugs.json] 已新增普通胰岛素注射液 @ index', idx + 1);

  // 新增吸入用沙丁胺醇（哮喘急性发作SABA一线）
  const salbExists = drugs.drugs.find(d => d.generic_name === '沙丁胺醇雾化吸入溶液');
  if (!salbExists) {
    const salbIdx = drugs.drugs.findIndex(d => d.generic_name === '沙丁胺醇');
    const salbutamolInh = {
      "generic_name": "沙丁胺醇雾化吸入溶液",
      "brand_name": "万托林",
      "dosage_form": "inhalation",
      "spec": "2.5mg/2.5ml",
      "unit": "支",
      "medical_insurance_class": "甲",
      "essential_medicine": true,
      "jtc_batch": "第8批",
      "otc_class": "处方药",
      "abx_level": "none",
      "pharmacology_class": "短效β2受体激动剂（SABA）",
      "dose_range_json": {
        "single_min_mg": 2.5,
        "single_max_mg": 5,
        "daily_max_mg": 20,
        "default_freq": "q20min×3后q1-4h",
        "default_duration_days": 1
      },
      "liver_renal_note": "无特殊",
      "is_iv_capable": false,
      "allowed_solvents_json": [],
      "drip_speed_max_mlh": null,
      "skin_test_required": false,
      "special_warnings_json": [
        "哮喘急性发作一线急救用药，雾化吸入",
        "常见心悸、手抖、低钾，过量可致心律失常",
        "SpO2<92%需联合吸氧及全身激素"
      ],
      "is_solvent": false,
      "is_tcm_injection": false,
      "price_yuan": 3,
      "manufacturer": "葛兰素史克",
      "pinyin": "sdmwhxrr",
      "pinyin_code": "SDMWHXRR",
      "reference_status": "core"
    };
    drugs.drugs.splice(salbIdx + 1, 0, salbutamolInh);
    console.log('[drugs.json] 已新增沙丁胺醇雾化吸入溶液');
  }
} else {
  console.log('[drugs.json] 普通胰岛素已存在，跳过');
}
fs.writeFileSync(drugsPath, JSON.stringify(drugs, null, 2), 'utf8');

// ---- 2. diseases.json: W-3/W-4/W-5 ----
const disPath = path.join(ROOT, 'data/diseases.json');
const dis = JSON.parse(fs.readFileSync(disPath, 'utf8'));

// W-3: KETOSIS-E11 补静脉胰岛素+补液补钾
const ketosis = dis.diseases.find(d => d.code === 'KETOSIS-E11');
if (ketosis) {
  ketosis.second_line_iv = [
    "0.9%氯化钠注射液",
    "普通胰岛素注射液",
    "氯化钾注射液",
    "维生素C注射液"
  ];
  ketosis.contraindications = [
    "首剂0.9%氯化钠快速输注1000ml/h前2h，之后减速",
    "小剂量胰岛素0.1U/kg/h持续静滴，血糖下降速度控制在3.9-6.1mmol/L/h",
    "血糖降至13.9mmol/L后换5%葡萄糖注射液+普通胰岛素",
    "见尿补钾（尿量>40ml/h），维持血钾4.0-5.5mmol/L",
    "每1-2h监测血糖、血钾、血气"
  ];
  ketosis.special_population_note = "DKA抢救：补液+小剂量胰岛素静滴+补钾为三大基石；急诊住院抢救指征";
  console.log('[diseases.json] KETOSIS-E11 已补静脉胰岛素方案');
}

// W-4: ASTHMA-J45 急性发作一线改为吸入SABA
const asthma = dis.diseases.find(d => d.code === 'ASTHMA-J45');
if (asthma) {
  // first_line_oral 改为吸入SABA为主（吸入途径），保留茶碱/孟鲁司特为二线
  asthma.first_line_oral = [
    "沙丁胺醇雾化吸入溶液",
    "布地奈德"
  ];
  asthma.second_line_iv = [
    "注射用甲泼尼龙琥珀酸钠",
    "氨茶碱注射液",
    "地塞米松磷酸钠注射液"
  ];
  asthma.contraindications = [
    "急性发作首选吸入速效β2激动剂（SABA）沙丁胺醇雾化/MDI，每20min×1h",
    "中重度发作联合全身糖皮质激素（甲泼尼龙静滴）",
    "茶碱缓释片为长效维持用药，不用于急性缓解；孟鲁司特钠为控制药，起效慢不用于急救",
    "哮喘持续状态/SpO2<92%需住院吸氧"
  ];
  asthma.special_population_note = "急性发作一线：吸入SABA沙丁胺醇雾化；茶碱为二线，孟鲁司特为长期控制药";
  console.log('[diseases.json] ASTHMA-J45 已改一线为吸入SABA');
}

// W-5: APP-K35 口服一线剔除静脉药
const app = dis.diseases.find(d => d.code === 'APP-K35');
if (app) {
  app.first_line_oral = [
    "头孢呋辛酯片",
    "甲硝唑片"
  ];
  app.second_line_iv = [
    "注射用头孢呋辛钠",
    "甲硝唑注射液"
  ];
  app.contraindications = [
    "确诊后首选急诊腹腔镜阑尾切除术",
    "术前预防用药可静脉给予一代/二代头孢，口服头孢呋辛酯仅用于围手术期或保守治疗",
    "术前需禁食水"
  ];
  console.log('[diseases.json] APP-K35 口服一线已剔除静脉药');
}

fs.writeFileSync(disPath, JSON.stringify(dis, null, 2), 'utf8');
console.log('\n=== 完成 ===');
