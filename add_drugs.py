# -*- coding: utf-8 -*-
"""批量新增专科药品到 drugs.json"""
import json, os

DATA_DIR = os.path.join(os.path.dirname(__file__), 'data')
SRC = os.path.join(DATA_DIR, 'drugs.json')

with open(SRC, 'r', encoding='utf-8') as f:
    db = json.load(f)

existing_names = {d['generic_name'] for d in db['drugs']}

new_drugs = [
    # ===== 精神类：抗抑郁 =====
    {
        "generic_name": "盐酸氟西汀胶囊", "brand_name": "百忧解", "dosage_form": "oral",
        "spec": "20mg×28粒", "unit": "粒", "medical_insurance_class": "乙",
        "essential_medicine": False, "jtc_batch": "第5批", "otc_class": "处方药",
        "abx_level": "none", "pharmacology_class": "SSRI",
        "dose_range_json": {"single_min_mg": 10, "single_max_mg": 40, "daily_max_mg": 80, "default_freq": "qd", "default_duration_days": 30},
        "liver_renal_note": "肝功能不全减量", "is_iv_capable": False, "allowed_solvents_json": [],
        "drip_speed_max_mlh": None, "skin_test_required": False,
        "special_warnings_json": ["孕妇慎用", "停药需逐渐减量", "禁与单胺氧化酶抑制剂合用"],
        "is_solvent": False, "is_tcm_injection": False, "price_yuan": 3.5, "manufacturer": "礼来制药"
    },
    {
        "generic_name": "盐酸帕罗西汀片", "brand_name": "赛乐特", "dosage_form": "oral",
        "spec": "20mg×10片", "unit": "片", "medical_insurance_class": "甲",
        "essential_medicine": False, "jtc_batch": "第3批", "otc_class": "处方药",
        "abx_level": "none", "pharmacology_class": "SSRI",
        "dose_range_json": {"single_min_mg": 10, "single_max_mg": 40, "daily_max_mg": 60, "default_freq": "qd", "default_duration_days": 30},
        "liver_renal_note": "肝功能不全减量", "is_iv_capable": False, "allowed_solvents_json": [],
        "drip_speed_max_mlh": None, "skin_test_required": False,
        "special_warnings_json": ["癫痫病史慎用", "停药需逐渐减量", "禁与MAOI合用"],
        "is_solvent": False, "is_tcm_injection": False, "price_yuan": 2.8, "manufacturer": "葛兰素史克"
    },
    {
        "generic_name": "草酸艾司西酞普兰片", "brand_name": "来士普", "dosage_form": "oral",
        "spec": "10mg×14片", "unit": "片", "medical_insurance_class": "乙",
        "essential_medicine": False, "jtc_batch": "第6批", "otc_class": "处方药",
        "abx_level": "none", "pharmacology_class": "SSRI",
        "dose_range_json": {"single_min_mg": 5, "single_max_mg": 20, "daily_max_mg": 20, "default_freq": "qd", "default_duration_days": 30},
        "liver_renal_note": "轻中度肝肾不全无需调整", "is_iv_capable": False, "allowed_solvents_json": [],
        "drip_speed_max_mlh": None, "skin_test_required": False,
        "special_warnings_json": ["成人青少年初期需监测自杀意念", "禁与MAOI合用"],
        "is_solvent": False, "is_tcm_injection": False, "price_yuan": 5.2, "manufacturer": "灵北制药"
    },
    # ===== 精神类：抗焦虑/催眠 =====
    {
        "generic_name": "阿普唑仑片", "brand_name": "佳静安定", "dosage_form": "oral",
        "spec": "0.4mg×20片", "unit": "片", "medical_insurance_class": "甲",
        "essential_medicine": False, "jtc_batch": "无", "otc_class": "精神二类",
        "abx_level": "none", "pharmacology_class": "苯二氮卓类",
        "dose_range_json": {"single_min_mg": 0.2, "single_max_mg": 0.8, "daily_max_mg": 4, "default_freq": "tid", "default_duration_days": 7},
        "liver_renal_note": "肝功能不全慎用", "is_iv_capable": False, "allowed_solvents_json": [],
        "drip_speed_max_mlh": None, "skin_test_required": False,
        "special_warnings_json": ["有成瘾性", "不宜长期服用", "服药期间禁止驾驶", "老年人减半"],
        "is_solvent": False, "is_tcm_injection": False, "price_yuan": 0.1, "manufacturer": "中美天津史克"
    },
    {
        "generic_name": "佐匹克隆片", "brand_name": "文飞", "dosage_form": "oral",
        "spec": "7.5mg×10片", "unit": "片", "medical_insurance_class": "乙",
        "essential_medicine": False, "jtc_batch": "第4批", "otc_class": "精神二类",
        "abx_level": "none", "pharmacology_class": "非苯二氮卓催眠药",
        "dose_range_json": {"single_min_mg": 3.75, "single_max_mg": 7.5, "daily_max_mg": 7.5, "default_freq": "qn", "default_duration_days": 14},
        "liver_renal_note": "肝功能不全起始3.75mg", "is_iv_capable": False, "allowed_solvents_json": [],
        "drip_speed_max_mlh": None, "skin_test_required": False,
        "special_warnings_json": ["有成瘾性", "服药后立即上床", "老年人起始3.75mg"],
        "is_solvent": False, "is_tcm_injection": False, "price_yuan": 1.2, "manufacturer": "山东云门药业"
    },
    {
        "generic_name": "盐酸丁螺环酮片", "brand_name": "一舒", "dosage_form": "oral",
        "spec": "5mg×24片", "unit": "片", "medical_insurance_class": "乙",
        "essential_medicine": False, "jtc_batch": "无", "otc_class": "处方药",
        "abx_level": "none", "pharmacology_class": "抗焦虑药",
        "dose_range_json": {"single_min_mg": 5, "single_max_mg": 10, "daily_max_mg": 30, "default_freq": "tid", "default_duration_days": 30},
        "liver_renal_note": "肝肾功能不全慎用", "is_iv_capable": False, "allowed_solvents_json": [],
        "drip_speed_max_mlh": None, "skin_test_required": False,
        "special_warnings_json": ["起效慢，需2-4周", "禁与MAOI合用"],
        "is_solvent": False, "is_tcm_injection": False, "price_yuan": 1.5, "manufacturer": "江苏恩华药业"
    },
    # ===== 精神类：抗精神病 =====
    {
        "generic_name": "奥氮平片", "brand_name": "再普乐", "dosage_form": "oral",
        "spec": "5mg×7片", "unit": "片", "medical_insurance_class": "乙",
        "essential_medicine": False, "jtc_batch": "第7批", "otc_class": "精神二类",
        "abx_level": "none", "pharmacology_class": "非典型抗精神病药",
        "dose_range_json": {"single_min_mg": 5, "single_max_mg": 15, "daily_max_mg": 20, "default_freq": "qn", "default_duration_days": 30},
        "liver_renal_note": "严重肝功能不全慎用", "is_iv_capable": False, "allowed_solvents_json": [],
        "drip_speed_max_mlh": None, "skin_test_required": False,
        "special_warnings_json": ["体重增加风险", "血糖血脂监测", "体位性低血压"],
        "is_solvent": False, "is_tcm_injection": False, "price_yuan": 12.0, "manufacturer": "礼来制药"
    },
    {
        "generic_name": "利培酮片", "brand_name": "维思通", "dosage_form": "oral",
        "spec": "1mg×20片", "unit": "片", "medical_insurance_class": "甲",
        "essential_medicine": False, "jtc_batch": "第2批", "otc_class": "精神二类",
        "abx_level": "none", "pharmacology_class": "非典型抗精神病药",
        "dose_range_json": {"single_min_mg": 1, "single_max_mg": 4, "daily_max_mg": 6, "default_freq": "bid", "default_duration_days": 30},
        "liver_renal_note": "肾功能不全减量", "is_iv_capable": False, "allowed_solvents_json": [],
        "drip_speed_max_mlh": None, "skin_test_required": False,
        "special_warnings_json": ["锥体外系反应", "高泌乳素血症", "老年人起始0.5mg bid"],
        "is_solvent": False, "is_tcm_injection": False, "price_yuan": 2.5, "manufacturer": "西安杨森"
    },
    # ===== 麻醉/镇痛类 =====
    {
        "generic_name": "盐酸曲马多缓释片", "brand_name": "奇曼丁", "dosage_form": "oral",
        "spec": "100mg×10片", "unit": "片", "medical_insurance_class": "乙",
        "essential_medicine": False, "jtc_batch": "无", "otc_class": "精一药品",
        "abx_level": "none", "pharmacology_class": "中枢性镇痛药",
        "dose_range_json": {"single_min_mg": 50, "single_max_mg": 100, "daily_max_mg": 400, "default_freq": "q12h", "default_duration_days": 7},
        "liver_renal_note": "肝肾功能不全减量", "is_iv_capable": False, "allowed_solvents_json": [],
        "drip_speed_max_mlh": None, "skin_test_required": False,
        "special_warnings_json": ["有成瘾性", "不得掰开服用", "与酒精合用可致死"],
        "is_solvent": False, "is_tcm_injection": False, "price_yuan": 3.0, "manufacturer": "格兰泰制药"
    },
    {
        "generic_name": "注射用帕瑞昔布钠", "brand_name": "特耐", "dosage_form": "iv_drip",
        "spec": "40mg/支", "unit": "支", "medical_insurance_class": "乙",
        "essential_medicine": False, "jtc_batch": "无", "otc_class": "处方药",
        "abx_level": "none", "pharmacology_class": "COX-2抑制剂",
        "dose_range_json": {"single_min_mg": 20, "single_max_mg": 40, "daily_max_mg": 80, "default_freq": "q12h", "default_duration_days": 3},
        "liver_renal_note": "严重肝功能不全禁用", "is_iv_capable": True, "allowed_solvents_json": ["0.9%氯化钠注射液"],
        "drip_speed_max_mlh": 100, "skin_test_required": False,
        "special_warnings_json": ["心血管事件风险", "消化道出血风险", "禁用于冠脉搭桥术后"],
        "is_solvent": False, "is_tcm_injection": False, "price_yuan": 28.0, "manufacturer": "辉瑞制药"
    },
    # ===== 皮肤科外用 =====
    {
        "generic_name": "丁酸氢化可的松乳膏", "brand_name": "尤卓尔", "dosage_form": "topical",
        "spec": "10g:10mg/支", "unit": "支", "medical_insurance_class": "乙",
        "essential_medicine": True, "jtc_batch": "无", "otc_class": "甲类OTC",
        "abx_level": "none", "pharmacology_class": "外用弱效激素",
        "dose_range_json": {"single_min_mg": 1, "single_max_mg": 2, "daily_max_mg": 4, "default_freq": "bid", "default_duration_days": 7},
        "liver_renal_note": "局部用药全身吸收少", "is_iv_capable": False, "allowed_solvents_json": [],
        "drip_speed_max_mlh": None, "skin_test_required": False,
        "special_warnings_json": ["面部慎用", "避免长期大面积使用", "皮肤破溃处禁用"],
        "is_solvent": False, "is_tcm_injection": False, "price_yuan": 8.5, "manufacturer": "天津金耀药业"
    },
    {
        "generic_name": "糠酸莫米松乳膏", "brand_name": "艾洛松", "dosage_form": "topical",
        "spec": "10g:10mg/支", "unit": "支", "medical_insurance_class": "乙",
        "essential_medicine": False, "jtc_batch": "无", "otc_class": "甲类OTC",
        "abx_level": "none", "pharmacology_class": "外用中效激素",
        "dose_range_json": {"single_min_mg": 1, "single_max_mg": 1, "daily_max_mg": 2, "default_freq": "qd", "default_duration_days": 14},
        "liver_renal_note": "局部用药全身吸收少", "is_iv_capable": False, "allowed_solvents_json": [],
        "drip_speed_max_mlh": None, "skin_test_required": False,
        "special_warnings_json": ["不宜长期使用", "皮肤结核/病毒感染禁用"],
        "is_solvent": False, "is_tcm_injection": False, "price_yuan": 12.0, "manufacturer": "默沙东"
    },
    {
        "generic_name": "他克莫司软膏", "brand_name": "普特彼", "dosage_form": "topical",
        "spec": "0.03% 10g/支", "unit": "支", "medical_insurance_class": "乙",
        "essential_medicine": False, "jtc_batch": "无", "otc_class": "处方药",
        "abx_level": "none", "pharmacology_class": "外用钙调磷酸酶抑制剂",
        "dose_range_json": {"single_min_mg": 1, "single_max_mg": 1, "daily_max_mg": 2, "default_freq": "bid", "default_duration_days": 30},
        "liver_renal_note": "局部用药全身吸收少", "is_iv_capable": False, "allowed_solvents_json": [],
        "drip_speed_max_mlh": None, "skin_test_required": False,
        "special_warnings_json": ["用药初期局部灼热感", "避免日晒", "2岁以下儿童慎用"],
        "is_solvent": False, "is_tcm_injection": False, "price_yuan": 65.0, "manufacturer": "安斯泰来"
    },
    {
        "generic_name": "酮康唑乳膏", "brand_name": "金达克宁", "dosage_form": "topical",
        "spec": "2% 15g/支", "unit": "支", "medical_insurance_class": "甲",
        "essential_medicine": True, "jtc_batch": "无", "otc_class": "甲类OTC",
        "abx_level": "none", "pharmacology_class": "外用抗真菌",
        "dose_range_json": {"single_min_mg": 1, "single_max_mg": 1, "daily_max_mg": 2, "default_freq": "bid", "default_duration_days": 14},
        "liver_renal_note": "局部用药全身吸收少", "is_iv_capable": False, "allowed_solvents_json": [],
        "drip_speed_max_mlh": None, "skin_test_required": False,
        "special_warnings_json": ["避免接触眼睛", "用药部位如有烧灼感停药"],
        "is_solvent": False, "is_tcm_injection": False, "price_yuan": 6.5, "manufacturer": "西安杨森"
    },
    {
        "generic_name": "重组人干扰素α-2b凝胶", "brand_name": "尤靖安", "dosage_form": "topical",
        "spec": "10g/支", "unit": "支", "medical_insurance_class": "乙",
        "essential_medicine": False, "jtc_batch": "无", "otc_class": "处方药",
        "abx_level": "none", "pharmacology_class": "外用抗病毒",
        "dose_range_json": {"single_min_mg": 1, "single_max_mg": 1, "daily_max_mg": 4, "default_freq": "qid", "default_duration_days": 14},
        "liver_renal_note": "局部用药全身吸收少", "is_iv_capable": False, "allowed_solvents_json": [],
        "drip_speed_max_mlh": None, "skin_test_required": False,
        "special_warnings_json": ["冰箱冷藏保存", "孕妇禁用"],
        "is_solvent": False, "is_tcm_injection": False, "price_yuan": 35.0, "manufacturer": "科兴生物"
    },
    # ===== 眼科用药 =====
    {
        "generic_name": "左氧氟沙星滴眼液", "brand_name": "可乐必妥", "dosage_form": "topical",
        "spec": "5ml:24.4mg/支", "unit": "支", "medical_insurance_class": "甲",
        "essential_medicine": True, "jtc_batch": "第4批", "otc_class": "处方药",
        "abx_level": "none", "pharmacology_class": "眼科抗菌药",
        "dose_range_json": {"single_min_mg": 1, "single_max_mg": 2, "daily_max_mg": 8, "default_freq": "qid", "default_duration_days": 7},
        "liver_renal_note": "局部用药全身吸收少", "is_iv_capable": False, "allowed_solvents_json": [],
        "drip_speed_max_mlh": None, "skin_test_required": False,
        "special_warnings_json": ["开启后4周内用完", "对喹诺酮类过敏禁用"],
        "is_solvent": False, "is_tcm_injection": False, "price_yuan": 12.0, "manufacturer": "参天制药"
    },
    {
        "generic_name": "玻璃酸钠滴眼液", "brand_name": "海露", "dosage_form": "topical",
        "spec": "10ml/支", "unit": "支", "medical_insurance_class": "乙",
        "essential_medicine": False, "jtc_batch": "无", "otc_class": "乙类OTC",
        "abx_level": "none", "pharmacology_class": "人工泪液",
        "dose_range_json": {"single_min_mg": 1, "single_max_mg": 2, "daily_max_mg": 8, "default_freq": "qid", "default_duration_days": 30},
        "liver_renal_note": "局部用药", "is_iv_capable": False, "allowed_solvents_json": [],
        "drip_speed_max_mlh": None, "skin_test_required": False,
        "special_warnings_json": ["不含防腐剂可长期使用", "佩戴隐形眼镜时可使用"],
        "is_solvent": False, "is_tcm_injection": False, "price_yuan": 45.0, "manufacturer": "URSAPHARM"
    },
    {
        "generic_name": "妥布霉素地塞米松滴眼液", "brand_name": "典必殊", "dosage_form": "topical",
        "spec": "5ml/支", "unit": "支", "medical_insurance_class": "乙",
        "essential_medicine": False, "jtc_batch": "无", "otc_class": "处方药",
        "abx_level": "none", "pharmacology_class": "眼科抗生素激素复方",
        "dose_range_json": {"single_min_mg": 1, "single_max_mg": 2, "daily_max_mg": 6, "default_freq": "qid", "default_duration_days": 7},
        "liver_renal_note": "局部用药", "is_iv_capable": False, "allowed_solvents_json": [],
        "drip_speed_max_mlh": None, "skin_test_required": False,
        "special_warnings_json": ["长期使用可致青光眼/白内障", "单纯疱疹病毒性角膜炎禁用", "开启后4周用完"],
        "is_solvent": False, "is_tcm_injection": False, "price_yuan": 22.0, "manufacturer": "诺华制药"
    },
    {
        "generic_name": "普拉洛芬滴眼液", "brand_name": "普南扑灵", "dosage_form": "topical",
        "spec": "5ml/支", "unit": "支", "medical_insurance_class": "乙",
        "essential_medicine": False, "jtc_batch": "无", "otc_class": "处方药",
        "abx_level": "none", "pharmacology_class": "眼科非甾体抗炎药",
        "dose_range_json": {"single_min_mg": 1, "single_max_mg": 1, "daily_max_mg": 4, "default_freq": "qid", "default_duration_days": 14},
        "liver_renal_note": "局部用药", "is_iv_capable": False, "allowed_solvents_json": [],
        "drip_speed_max_mlh": None, "skin_test_required": False,
        "special_warnings_json": ["角膜上皮损伤者慎用", "开启后4周用完"],
        "is_solvent": False, "is_tcm_injection": False, "price_yuan": 28.0, "manufacturer": "千寿制药"
    },
    # ===== 耳鼻喉用药 =====
    {
        "generic_name": "丙酸氟替卡松鼻喷雾剂", "brand_name": "辅舒良", "dosage_form": "topical",
        "spec": "120喷/瓶", "unit": "瓶", "medical_insurance_class": "乙",
        "essential_medicine": False, "jtc_batch": "无", "otc_class": "乙类OTC",
        "abx_level": "none", "pharmacology_class": "鼻用糖皮质激素",
        "dose_range_json": {"single_min_mg": 1, "single_max_mg": 2, "daily_max_mg": 2, "default_freq": "qd", "default_duration_days": 30},
        "liver_renal_note": "局部用药全身吸收少", "is_iv_capable": False, "allowed_solvents_json": [],
        "drip_speed_max_mlh": None, "skin_test_required": False,
        "special_warnings_json": ["规律使用效果佳", "儿童使用不超过3个月", "鼻出血时减量"],
        "is_solvent": False, "is_tcm_injection": False, "price_yuan": 65.0, "manufacturer": "葛兰素史克"
    },
    {
        "generic_name": "盐酸羟甲唑啉滴鼻液", "brand_name": "达芬霖", "dosage_form": "topical",
        "spec": "10ml:5mg/瓶", "unit": "瓶", "medical_insurance_class": "甲",
        "essential_medicine": True, "jtc_batch": "无", "otc_class": "甲类OTC",
        "abx_level": "none", "pharmacology_class": "鼻用减充血剂",
        "dose_range_json": {"single_min_mg": 1, "single_max_mg": 1, "daily_max_mg": 2, "default_freq": "bid", "default_duration_days": 5},
        "liver_renal_note": "局部用药", "is_iv_capable": False, "allowed_solvents_json": [],
        "drip_speed_max_mlh": None, "skin_test_required": False,
        "special_warnings_json": ["连续使用不超过7天", "久用可致药物性鼻炎", "高血压/甲亢慎用"],
        "is_solvent": False, "is_tcm_injection": False, "price_yuan": 8.0, "manufacturer": "深圳大佛药业"
    },
    {
        "generic_name": "氧氟沙星滴耳液", "brand_name": "泰利必妥", "dosage_form": "topical",
        "spec": "5ml:15mg/瓶", "unit": "瓶", "medical_insurance_class": "甲",
        "essential_medicine": True, "jtc_batch": "第4批", "otc_class": "处方药",
        "abx_level": "none", "pharmacology_class": "耳用抗菌药",
        "dose_range_json": {"single_min_mg": 2, "single_max_mg": 5, "daily_max_mg": 3, "default_freq": "tid", "default_duration_days": 7},
        "liver_renal_note": "局部用药", "is_iv_capable": False, "allowed_solvents_json": [],
        "drip_speed_max_mlh": None, "skin_test_required": False,
        "special_warnings_json": ["滴耳前加温至体温", "鼓膜穿孔者禁用", "对喹诺酮类过敏禁用"],
        "is_solvent": False, "is_tcm_injection": False, "price_yuan": 9.0, "manufacturer": "第一三共"
    },
    # ===== 抗肿瘤辅助/其他专科 =====
    {
        "generic_name": "胸腺肽肠溶片", "brand_name": "迪赛", "dosage_form": "oral",
        "spec": "5mg×15片", "unit": "片", "medical_insurance_class": "乙",
        "essential_medicine": False, "jtc_batch": "无", "otc_class": "处方药",
        "abx_level": "none", "pharmacology_class": "免疫调节剂",
        "dose_range_json": {"single_min_mg": 5, "single_max_mg": 30, "daily_max_mg": 60, "default_freq": "tid", "default_duration_days": 30},
        "liver_renal_note": "胸腺功能亢进者禁用", "is_iv_capable": False, "allowed_solvents_json": [],
        "drip_speed_max_mlh": None, "skin_test_required": False,
        "special_warnings_json": ["过敏体质慎用", "孕妇及哺乳期慎用"],
        "is_solvent": False, "is_tcm_injection": False, "price_yuan": 4.5, "manufacturer": "西安迪赛生物"
    },
    {
        "generic_name": "地榆升白片", "brand_name": "地榆升白", "dosage_form": "oral",
        "spec": "0.1g×40片", "unit": "片", "medical_insurance_class": "乙",
        "essential_medicine": False, "jtc_batch": "无", "otc_class": "处方药",
        "abx_level": "none", "pharmacology_class": "升白细胞药",
        "dose_range_json": {"single_min_mg": 2, "single_max_mg": 4, "daily_max_mg": 12, "default_freq": "tid", "default_duration_days": 30},
        "liver_renal_note": "尚不明确", "is_iv_capable": False, "allowed_solvents_json": [],
        "drip_speed_max_mlh": None, "skin_test_required": False,
        "special_warnings_json": ["中药制剂", "定期复查血常规"],
        "is_solvent": False, "is_tcm_injection": False, "price_yuan": 1.8, "manufacturer": "成都地奥制药"
    },
    {
        "generic_name": "双氯芬酸二乙胺乳胶剂", "brand_name": "扶他林", "dosage_form": "topical",
        "spec": "20g/支", "unit": "支", "medical_insurance_class": "乙",
        "essential_medicine": False, "jtc_batch": "无", "otc_class": "乙类OTC",
        "abx_level": "none", "pharmacology_class": "外用NSAIDs",
        "dose_range_json": {"single_min_mg": 3, "single_max_mg": 5, "daily_max_mg": 3, "default_freq": "tid", "default_duration_days": 14},
        "liver_renal_note": "局部用药全身吸收少", "is_iv_capable": False, "allowed_solvents_json": [],
        "drip_speed_max_mlh": None, "skin_test_required": False,
        "special_warnings_json": ["避免接触破损皮肤", "避免大面积长期使用"],
        "is_solvent": False, "is_tcm_injection": False, "price_yuan": 25.0, "manufacturer": "诺华制药"
    },
    {
        "generic_name": "莫匹罗星软膏", "brand_name": "百多邦", "dosage_form": "topical",
        "spec": "2% 5g/支", "unit": "支", "medical_insurance_class": "甲",
        "essential_medicine": True, "jtc_batch": "无", "otc_class": "甲类OTC",
        "abx_level": "none", "pharmacology_class": "外用抗菌药",
        "dose_range_json": {"single_min_mg": 1, "single_max_mg": 1, "daily_max_mg": 3, "default_freq": "tid", "default_duration_days": 7},
        "liver_renal_note": "局部用药", "is_iv_capable": False, "allowed_solvents_json": [],
        "drip_speed_max_mlh": None, "skin_test_required": False,
        "special_warnings_json": ["不适用于眼内", "大面积感染需口服抗生素"],
        "is_solvent": False, "is_tcm_injection": False, "price_yuan": 18.0, "manufacturer": "葛兰素史克"
    },
]

# 去重添加
added = 0
for d in new_drugs:
    if d['generic_name'] not in existing_names:
        db['drugs'].append(d)
        added += 1

db['version'] = '2026.11.04'
db['note'] = '药品库（专科扩充版，含精神/麻醉/皮肤/眼科/耳鼻喉等专科用药）'

with open(SRC, 'w', encoding='utf-8') as f:
    json.dump(db, f, ensure_ascii=False, indent=2)

print(f"新增药品: {added} 个")
print(f"药品总数: {len(db['drugs'])} 个")

# 按大类统计
from collections import Counter
classes = Counter(d['pharmacology_class'] for d in db['drugs'])
print(f"\n药理大类数量: {len(classes)} 个")
