# -*- coding: utf-8 -*-
"""批量新增常见病种到 diseases.json"""
import json, os

DATA_DIR = os.path.join(os.path.dirname(__file__), 'data')
SRC = os.path.join(DATA_DIR, 'diseases.json')

with open(SRC, 'r', encoding='utf-8') as f:
    db = json.load(f)

existing_codes = {d['code'] for d in db['diseases']}

new_diseases = [
    # ===== 消化科 =====
    {
        "code": "GERD-K21", "name": "胃食管反流病（反流性食管炎）", "icd10": "K21.900",
        "iv_suitability": "usually_no_iv", "negative_list_hit": True, "difficulty": "初级",
        "symptom_pool": {
            "chief_complaint": [
                "反酸烧心3月，加重1周",
                "餐后胸骨后烧灼感伴反酸1月",
                "夜间平卧时反酸呛咳2周",
                "吞咽不适伴胸骨后痛5天"
            ],
            "history": [
                "餐后反酸明显，弯腰时加重，无呕血黑便",
                "偶有咽喉异物感，无吞咽困难"
            ],
            "vitals": {"bp": "110-125/70-80", "hr": "70-82", "temp": "36.4-36.8", "spo2": "98-99"},
            "exam": ["心肺查体未见异常，腹软无压痛"],
            "volume_status": {"skin_turgor": "正常", "mucosa": "湿润", "urine": "正常", "diarrhea_vomit_freq": "无", "oral_intake": "正常"}
        },
        "differential": ["食管癌（需胃镜排除）", "功能性烧心"],
        "first_line_oral": ["奥美拉唑肠溶胶囊", "艾司奥美拉唑镁肠溶片"],
        "second_line_iv": [],
        "contraindications": ["严重肝肾功能不全慎用PPI"],
        "special_population_note": "老年患者长期用PPI注意骨质疏松和维生素B12缺乏"
    },
    {
        "code": "UC-K51", "name": "溃疡性结肠炎（轻中度活动期）", "icd10": "K51.900",
        "iv_suitability": "conditional_iv", "negative_list_hit": False, "difficulty": "高级",
        "symptom_pool": {
            "chief_complaint": [
                "反复黏液脓血便半年，加重3天",
                "腹泻伴左下腹疼痛2周，每日排便4-5次",
                "黏液便伴里急后重1月"
            ],
            "history": [
                "既往溃疡性结肠炎病史，不规律服药",
                "无发热，无体重明显下降"
            ],
            "vitals": {"bp": "105-120/65-78", "hr": "75-90", "temp": "36.8-37.5", "spo2": "97-98"},
            "exam": ["左下腹轻压痛，无反跳痛，肠鸣音活跃"],
            "volume_status": {"skin_turgor": "正常", "mucosa": "略干", "urine": "偏少", "diarrhea_vomit_freq": "每日腹泻3-5次", "oral_intake": "稍差"}
        },
        "differential": ["克罗恩病", "感染性肠炎", "肠易激综合征"],
        "first_line_oral": ["美沙拉嗪肠溶片", "美沙拉嗪缓释颗粒"],
        "second_line_iv": ["注射用甲泼尼龙琥珀酸钠"],
        "contraindications": ["对水杨酸类过敏者禁用美沙拉嗪"],
        "special_population_note": "活动期需评估营养状况，严重者需住院静脉用药"
    },
    # ===== 心血管 =====
    {
        "code": "HLP-E78", "name": "高脂血症（高胆固醇血症）", "icd10": "E78.000",
        "iv_suitability": "usually_no_iv", "negative_list_hit": True, "difficulty": "初级",
        "symptom_pool": {
            "chief_complaint": [
                "体检发现血脂升高1周",
                "体检总胆固醇6.8mmol/L，低密度脂蛋白4.5mmol/L",
                "发现血脂高半年，未规律服药"
            ],
            "history": [
                "无胸闷胸痛，无头晕头痛",
                "有高血压病史3年，规律服药"
            ],
            "vitals": {"bp": "130-145/80-90", "hr": "68-80", "temp": "36.4-36.8", "spo2": "98-99"},
            "exam": ["心肺查体未见异常", "双眼睑可见黄色瘤"],
            "volume_status": {"skin_turgor": "正常", "mucosa": "湿润", "urine": "正常", "diarrhea_vomit_freq": "无", "oral_intake": "正常"}
        },
        "differential": ["继发性高脂血症（甲减/肾病综合征）"],
        "first_line_oral": ["阿托伐他汀钙片", "瑞舒伐他汀钙片"],
        "second_line_iv": [],
        "contraindications": ["活动性肝病禁用他汀类", "孕妇及哺乳期禁用"],
        "special_population_note": "他汀类夜间服用效果佳，定期监测肝功能和肌酶"
    },
    {
        "code": "AF-I48", "name": "心律失常（阵发性心房颤动）", "icd10": "I48.000",
        "iv_suitability": "conditional_iv", "negative_list_hit": False, "difficulty": "高级",
        "symptom_pool": {
            "chief_complaint": [
                "反复心悸2月，再发2小时",
                "突发心悸伴胸闷1小时",
                "心悸伴乏力1天，自测脉搏不齐"
            ],
            "history": [
                "有高血压病史5年",
                "无晕厥黑矇，无夜间阵发性呼吸困难"
            ],
            "vitals": {"bp": "120-140/75-88", "hr": "100-140（不齐）", "temp": "36.5-36.8", "spo2": "96-98"},
            "exam": ["心律绝对不齐，第一心音强弱不等，脉搏短绌"],
            "volume_status": {"skin_turgor": "正常", "mucosa": "湿润", "urine": "正常", "diarrhea_vomit_freq": "无", "oral_intake": "正常"}
        },
        "differential": ["频发房性早搏", "室上性心动过速"],
        "first_line_oral": ["盐酸美托洛尔缓释片", "华法林钠片"],
        "second_line_iv": ["盐酸胺碘酮注射液"],
        "contraindications": ["二度以上房室传导阻滞禁用β受体阻滞剂", "甲亢禁用胺碘酮"],
        "special_population_note": "需评估CHA2DS2-VASc评分决定抗凝策略"
    },
    {
        "code": "HF-I50", "name": "慢性心力衰竭（稳定期NYHA II级）", "icd10": "I50.900",
        "iv_suitability": "conditional_iv", "negative_list_hit": False, "difficulty": "高级",
        "symptom_pool": {
            "chief_complaint": [
                "活动后气短半年，加重伴双下肢水肿1周",
                "登高后胸闷气促2月，夜间可平卧",
                "双下肢水肿伴活动耐量下降2周"
            ],
            "history": [
                "有冠心病病史5年",
                "无夜间端坐呼吸，无端坐呼吸"
            ],
            "vitals": {"bp": "125-140/75-88", "hr": "75-95", "temp": "36.4-36.8", "spo2": "95-97"},
            "exam": ["双肺底可闻及细湿啰音", "双下肢凹陷性水肿", "颈静脉怒张"],
            "volume_status": {"skin_turgor": "水肿", "mucosa": "湿润", "urine": "偏少", "diarrhea_vomit_freq": "无", "oral_intake": "正常"}
        },
        "differential": ["支气管哮喘", "肺栓塞"],
        "first_line_oral": ["沙库巴曲缬沙坦钠片", "呋塞米片", "琥珀酸美托洛尔缓释片"],
        "second_line_iv": ["呋塞米注射液"],
        "contraindications": ["低血压禁用ACEI/ARB/ARNI", "严重肾功能不全慎用利尿剂"],
        "special_population_note": "老年患者注意监测电解质和肾功能，避免过度利尿"
    },
    # ===== 内分泌/代谢 =====
    {
        "code": "GOUT-M10", "name": "痛风（急性关节炎发作）", "icd10": "M10.000",
        "iv_suitability": "usually_no_iv", "negative_list_hit": True, "difficulty": "中级",
        "symptom_pool": {
            "chief_complaint": [
                "突发右第一跖趾关节红肿热痛1天",
                "夜间突发关节剧痛，彻夜难眠",
                "左踝关节红肿疼痛3天，既往血尿酸高"
            ],
            "history": [
                "既往痛风病史2年，未规律降尿酸治疗",
                "发病前有饮酒/高嘌呤饮食史"
            ],
            "vitals": {"bp": "125-140/78-88", "hr": "75-90", "temp": "37.2-38.0", "spo2": "98-99"},
            "exam": ["受累关节红肿热痛，活动受限，触痛明显"],
            "volume_status": {"skin_turgor": "正常", "mucosa": "湿润", "urine": "正常", "diarrhea_vomit_freq": "无", "oral_intake": "正常"}
        },
        "differential": ["化脓性关节炎", "假性痛风", "蜂窝织炎"],
        "first_line_oral": ["秋水仙碱片", "布洛芬缓释胶囊"],
        "second_line_iv": ["注射用甲泼尼龙琥珀酸钠"],
        "contraindications": ["肾功能不全慎用秋水仙碱", "消化性溃疡慎用NSAIDs"],
        "special_population_note": "急性发作期不开始降尿酸治疗，发作缓解后2周再启动"
    },
    {
        "code": "OP-M81", "name": "原发性骨质疏松症", "icd10": "M81.900",
        "iv_suitability": "usually_no_iv", "negative_list_hit": True, "difficulty": "中级",
        "symptom_pool": {
            "chief_complaint": [
                "腰背部疼痛半年，加重1周",
                "体检骨密度T值-2.8",
                "驼背伴腰背酸痛3月"
            ],
            "history": [
                "绝经后女性，未补钙",
                "无外伤史，无身高明显变矮"
            ],
            "vitals": {"bp": "120-140/70-85", "hr": "68-78", "temp": "36.3-36.7", "spo2": "98-99"},
            "exam": ["腰椎压痛叩击痛，身高较年轻时缩短3cm"],
            "volume_status": {"skin_turgor": "正常", "mucosa": "湿润", "urine": "正常", "diarrhea_vomit_freq": "无", "oral_intake": "正常"}
        },
        "differential": ["继发性骨质疏松（甲旁亢/糖皮质激素）", "多发性骨髓瘤"],
        "first_line_oral": ["碳酸钙D3片", "阿仑膦酸钠片"],
        "second_line_iv": [],
        "contraindications": ["食管狭窄禁用阿仑膦酸钠", "低钙血症禁用双膦酸盐"],
        "special_population_note": "阿仑膦酸钠需晨起空腹用200ml白水送服，服药后保持直立30分钟"
    },
    # ===== 神经内科 =====
    {
        "code": "ISCHEMIC-I63", "name": "脑梗死恢复期（缺血性卒中后）", "icd10": "I63.900",
        "iv_suitability": "conditional_iv", "negative_list_hit": False, "difficulty": "高级",
        "symptom_pool": {
            "chief_complaint": [
                "右侧肢体乏力2月，门诊复诊",
                "脑梗死发病后2月，遗留右侧肢体活动不利",
                "左侧肢体麻木无力1月，恢复中"
            ],
            "history": [
                "有高血压糖尿病病史",
                "无头痛呕吐，无意识障碍"
            ],
            "vitals": {"bp": "135-155/80-95", "hr": "65-78", "temp": "36.4-36.8", "spo2": "97-98"},
            "exam": ["右侧肢体肌力IV级，肌张力稍高，病理征阳性"],
            "volume_status": {"skin_turgor": "正常", "mucosa": "湿润", "urine": "正常", "diarrhea_vomit_freq": "无", "oral_intake": "正常"}
        },
        "differential": ["脑出血恢复期", "颅内占位"],
        "first_line_oral": ["阿司匹林肠溶片", "阿托伐他汀钙片", "丁基苯酞软胶囊"],
        "second_line_iv": ["依达拉奉注射液"],
        "contraindications": ["活动性出血禁用抗血小板药", "肝功能不全慎用他汀"],
        "special_population_note": "需评估吞咽功能，防误吸；老年患者注意跌倒预防"
    },
    {
        "code": "BELL-G51", "name": "面神经炎（贝尔麻痹）", "icd10": "G51.800",
        "iv_suitability": "usually_no_iv", "negative_list_hit": True, "difficulty": "中级",
        "symptom_pool": {
            "chief_complaint": [
                "突发右侧口角歪斜2天",
                "刷牙漏水伴右眼闭合不全1天",
                "左侧面部麻木伴口角歪斜3天"
            ],
            "history": [
                "发病前有受凉/吹风史",
                "无肢体无力，无言语不清，无耳后疼痛"
            ],
            "vitals": {"bp": "115-130/70-82", "hr": "70-82", "temp": "36.5-37.0", "spo2": "98-99"},
            "exam": ["患侧额纹消失，眼裂增大，鼻唇沟变浅，口角歪斜，鼓腮漏气"],
            "volume_status": {"skin_turgor": "正常", "mucosa": "湿润", "urine": "正常", "diarrhea_vomit_freq": "无", "oral_intake": "正常"}
        },
        "differential": ["中枢性面瘫（脑卒中）", "格林-巴利综合征", "中耳炎并发症"],
        "first_line_oral": ["泼尼松片", "阿昔洛韦片", "维生素B1片"],
        "second_line_iv": [],
        "contraindications": ["糖尿病患者用激素需监测血糖", "严重消化性溃疡慎用激素"],
        "special_population_note": "发病72小时内启动激素效果最佳，注意保护角膜防暴露性角膜炎"
    },
    # ===== 皮肤科 =====
    {
        "code": "HZ-B02", "name": "带状疱疹（急性期）", "icd10": "B02.900",
        "iv_suitability": "usually_no_iv", "negative_list_hit": True, "difficulty": "中级",
        "symptom_pool": {
            "chief_complaint": [
                "右侧胸背部簇集水疱伴疼痛3天",
                "左侧腰腹部皮疹伴烧灼样疼痛2天",
                "右侧面部水疱伴疼痛1周"
            ],
            "history": [
                "疼痛先于皮疹出现3-5天",
                "无发热，无全身不适"
            ],
            "vitals": {"bp": "115-130/70-82", "hr": "72-85", "temp": "36.6-37.5", "spo2": "98-99"},
            "exam": ["单侧沿神经节段分布的簇集性水疱，不超过中线，触痛明显"],
            "volume_status": {"skin_turgor": "正常", "mucosa": "湿润", "urine": "正常", "diarrhea_vomit_freq": "无", "oral_intake": "正常"}
        },
        "differential": ["单纯疱疹", "接触性皮炎", "丹毒"],
        "first_line_oral": ["盐酸伐昔洛韦片", "加巴喷丁胶囊", "布洛芬缓释胶囊"],
        "second_line_iv": ["阿昔洛韦注射液"],
        "contraindications": ["肾功能不全慎用阿昔洛韦", "孕妇慎用伐昔洛韦"],
        "special_population_note": "老年患者易遗留后遗神经痛，发病72小时内启动抗病毒效果最佳"
    },
    {
        "code": "ECZEMA-L30", "name": "慢性湿疹（局限性）", "icd10": "L30.900",
        "iv_suitability": "usually_no_iv", "negative_list_hit": True, "difficulty": "初级",
        "symptom_pool": {
            "chief_complaint": [
                "双侧肘窝瘙痒伴皮疹反复发作半年",
                "双手掌脱屑瘙痒3月",
                "阴囊瘙痒伴皮疹反复2月"
            ],
            "history": [
                "既往湿疹病史，反复发作",
                "无渗出，无糜烂"
            ],
            "vitals": {"bp": "110-128/68-80", "hr": "70-80", "temp": "36.4-36.8", "spo2": "98-99"},
            "exam": ["皮损肥厚、苔藓样变、脱屑，边界不清，对称分布"],
            "volume_status": {"skin_turgor": "正常", "mucosa": "湿润", "urine": "正常", "diarrhea_vomit_freq": "无", "oral_intake": "正常"}
        },
        "differential": ["体癣", "接触性皮炎", "银屑病"],
        "first_line_oral": ["氯雷他定片"],
        "second_line_iv": [],
        "contraindications": ["对糖皮质激素过敏者禁用"],
        "special_population_note": "面部及皮肤皱褶处慎用强效激素，避免长期大面积使用"
    },
    # ===== 泌尿科 =====
    {
        "code": "BPH-N40", "name": "良性前列腺增生症", "icd10": "N40.x00",
        "iv_suitability": "usually_no_iv", "negative_list_hit": True, "difficulty": "中级",
        "symptom_pool": {
            "chief_complaint": [
                "进行性排尿困难1年，加重1月",
                "夜尿增多每晚3-4次半年",
                "尿频尿急伴尿线变细3月"
            ],
            "history": [
                "老年男性，无肉眼血尿",
                "无尿潴留病史"
            ],
            "vitals": {"bp": "125-145/75-88", "hr": "68-78", "temp": "36.3-36.7", "spo2": "98-99"},
            "exam": ["直肠指检前列腺增大，中央沟变浅，无硬结"],
            "volume_status": {"skin_turgor": "正常", "mucosa": "湿润", "urine": "排尿不畅", "diarrhea_vomit_freq": "无", "oral_intake": "正常"}
        },
        "differential": ["前列腺癌（需查PSA）", "神经源性膀胱", "尿道狭窄"],
        "first_line_oral": ["盐酸坦索罗辛缓释胶囊", "非那雄胺片"],
        "second_line_iv": [],
        "contraindications": ["体位性低血压慎用α受体阻滞剂", "女性禁用非那雄胺"],
        "special_population_note": "坦索罗辛首次睡前服用，注意体位性低血压"
    },
    {
        "code": "STONE-N20", "name": "输尿管结石（肾绞痛）", "icd10": "N20.100",
        "iv_suitability": "conditional_iv", "negative_list_hit": False, "difficulty": "中级",
        "symptom_pool": {
            "chief_complaint": [
                "突发右侧腰腹部绞痛2小时，向会阴部放射",
                "左侧腰腹剧痛伴恶心呕吐3小时",
                "血尿伴右侧腰痛1天"
            ],
            "history": [
                "既往泌尿系结石病史",
                "无发热，无尿频尿痛"
            ],
            "vitals": {"bp": "130-150/80-95", "hr": "80-110", "temp": "36.5-37.2", "spo2": "97-98"},
            "exam": ["患侧肾区叩击痛阳性，腹软，输尿管走行区压痛"],
            "volume_status": {"skin_turgor": "正常", "mucosa": "稍干", "urine": "血尿", "diarrhea_vomit_freq": "恶心呕吐1-2次", "oral_intake": "差"}
        },
        "differential": ["急性阑尾炎", "胆囊炎", "宫外孕（女性）"],
        "first_line_oral": ["双氯芬酸钠缓释片", "盐酸坦索罗辛缓释胶囊"],
        "second_line_iv": ["盐酸消旋山莨菪碱注射液", "黄体酮注射液"],
        "contraindications": ["青光眼禁用山莨菪碱", "前列腺增生慎用山莨菪碱"],
        "special_population_note": "结石直径<0.6cm可药物排石，>0.8cm需外科干预"
    },
    # ===== 妇科 =====
    {
        "code": "PID-N73", "name": "盆腔炎性疾病（盆腔炎）", "icd10": "N73.900",
        "iv_suitability": "conditional_iv", "negative_list_hit": False, "difficulty": "中级",
        "symptom_pool": {
            "chief_complaint": [
                "下腹痛伴发热3天",
                "白带增多伴下腹坠痛1周",
                "性交痛伴腰骶部酸痛5天"
            ],
            "history": [
                "育龄期女性，有性生活史",
                "无停经史，无阴道异常出血"
            ],
            "vitals": {"bp": "105-120/65-78", "hr": "80-100", "temp": "37.5-38.8", "spo2": "97-98"},
            "exam": ["阴道分泌物增多，宫颈举痛，子宫及附件区压痛"],
            "volume_status": {"skin_turgor": "正常", "mucosa": "湿润", "urine": "正常", "diarrhea_vomit_freq": "无", "oral_intake": "正常"}
        },
        "differential": ["急性阑尾炎", "卵巢囊肿蒂扭转", "异位妊娠"],
        "first_line_oral": ["头孢克肟胶囊", "甲硝唑片"],
        "second_line_iv": ["注射用头孢曲松钠", "甲硝唑氯化钠注射液"],
        "contraindications": ["头孢类过敏者禁用", "孕妇禁用甲硝唑"],
        "special_population_note": "性伴侣需同时治疗，治疗期间避免性生活"
    },
    # ===== 儿科 =====
    {
        "code": "URI-J00-PED", "name": "小儿急性上呼吸道感染（普通感冒）", "icd10": "J00.x00",
        "iv_suitability": "usually_no_iv", "negative_list_hit": True, "difficulty": "初级",
        "symptom_pool": {
            "chief_complaint": [
                "发热伴鼻塞流涕2天",
                "咳嗽伴低热1天",
                "咽痛伴食欲下降2天"
            ],
            "history": [
                "患儿3-6岁，既往体健",
                "无喘息，无呕吐，无抽搐"
            ],
            "vitals": {"bp": "90-105/55-65", "hr": "90-120", "temp": "37.5-39.0", "spo2": "96-98"},
            "exam": ["咽部充血，扁桃体I-II度肿大，双肺呼吸音清"],
            "volume_status": {"skin_turgor": "正常", "mucosa": "湿润", "urine": "正常", "diarrhea_vomit_freq": "无", "oral_intake": "稍差"}
        },
        "differential": ["流行性感冒", "过敏性鼻炎", "手足口病早期"],
        "first_line_oral": ["布洛芬混悬液", "小儿氨酚黄那敏颗粒"],
        "second_line_iv": [],
        "contraindications": ["2岁以下慎用复方感冒药", "水痘禁用阿司匹林"],
        "special_population_note": "按体重计算剂量，避免重复使用含相同成分的复方感冒药"
    },
    {
        "code": "DIADEM-A09-PED", "name": "小儿腹泻病（轻度脱水）", "icd10": "A09.900",
        "iv_suitability": "conditional_iv", "negative_list_hit": False, "difficulty": "中级",
        "symptom_pool": {
            "chief_complaint": [
                "腹泻2天，每日水样便5-6次",
                "腹泻伴呕吐1天，尿量减少",
                "解稀便3天，伴食欲下降"
            ],
            "history": [
                "患儿1-3岁，近期有不洁饮食史",
                "无黏液脓血便"
            ],
            "vitals": {"bp": "85-100/50-60", "hr": "100-130", "temp": "36.5-38.0", "spo2": "96-98"},
            "exam": ["精神稍差，皮肤弹性尚可，哭时有泪，前囟平"],
            "volume_status": {"skin_turgor": "稍差", "mucosa": "略干", "urine": "减少", "diarrhea_vomit_freq": "每日腹泻4-6次，呕吐1-2次", "oral_intake": "差"}
        },
        "differential": ["细菌性痢疾", "生理性腹泻", "乳糖不耐受"],
        "first_line_oral": ["口服补液盐III", "蒙脱石散", "双歧杆菌三联活菌散"],
        "second_line_iv": ["葡萄糖氯化钠注射液"],
        "contraindications": ["细菌性腹泻禁用止泻药", "病毒性腹泻不用抗生素"],
        "special_population_note": "轻中度脱水首选口服补液，静脉补液仅用于重度脱水或不能口服者"
    },
    # ===== 骨科 =====
    {
        "code": "CERV-M50", "name": "颈椎病（神经根型）", "icd10": "M50.100",
        "iv_suitability": "usually_no_iv", "negative_list_hit": True, "difficulty": "初级",
        "symptom_pool": {
            "chief_complaint": [
                "颈肩部疼痛伴右上肢麻木3月",
                "颈痛伴左上肢放射痛1月",
                "低头后颈肩痛加重伴手指麻木1周"
            ],
            "history": [
                "长期伏案工作史",
                "无头晕眩晕，无行走不稳"
            ],
            "vitals": {"bp": "115-135/70-85", "hr": "68-80", "temp": "36.4-36.8", "spo2": "98-99"},
            "exam": ["颈椎棘突旁压痛，臂丛神经牵拉试验阳性，压头试验阳性"],
            "volume_status": {"skin_turgor": "正常", "mucosa": "湿润", "urine": "正常", "diarrhea_vomit_freq": "无", "oral_intake": "正常"}
        },
        "differential": ["胸廓出口综合征", "腕管综合征", "肩周炎"],
        "first_line_oral": ["布洛芬缓释胶囊", "甲钴胺片"],
        "second_line_iv": [],
        "contraindications": ["消化性溃疡慎用NSAIDs"],
        "special_population_note": "配合颈椎牵引和理疗，避免长时间低头"
    },
    {
        "code": "LUMB-M51", "name": "腰椎间盘突出症（L4/5）", "icd10": "M51.200",
        "iv_suitability": "usually_no_iv", "negative_list_hit": True, "difficulty": "中级",
        "symptom_pool": {
            "chief_complaint": [
                "腰痛伴右下肢放射痛2月，加重1周",
                "腰痛伴左小腿外侧麻木1月",
                "弯腰后腰痛加重伴下肢放射痛3天"
            ],
            "history": [
                "有搬重物/扭伤史",
                "无大小便功能障碍，无会阴部麻木"
            ],
            "vitals": {"bp": "120-140/75-88", "hr": "70-82", "temp": "36.4-36.8", "spo2": "98-99"},
            "exam": ["腰椎旁压痛，直腿抬高试验阳性，加强试验阳性，小腿外侧感觉减退"],
            "volume_status": {"skin_turgor": "正常", "mucosa": "湿润", "urine": "正常", "diarrhea_vomit_freq": "无", "oral_intake": "正常"}
        },
        "differential": ["腰椎管狭窄症", "腰肌劳损", "腰椎结核"],
        "first_line_oral": ["布洛芬缓释胶囊", "甲钴胺片", "地塞米松片"],
        "second_line_iv": ["甘露醇注射液", "注射用甲泼尼龙琥珀酸钠"],
        "contraindications": ["消化性溃疡慎用NSAIDs和激素", "糖尿病患者用激素监测血糖"],
        "special_population_note": "出现马尾综合征（大小便障碍）需紧急手术"
    },
    # ===== 呼吸科补充 =====
    {
        "code": "CBRONCH-J20", "name": "慢性支气管炎急性发作", "icd10": "J20.900",
        "iv_suitability": "conditional_iv", "negative_list_hit": False, "difficulty": "中级",
        "symptom_pool": {
            "chief_complaint": [
                "反复咳嗽咳痰10年，加重伴黄脓痰1周",
                "咳嗽咳痰加重3天，痰量增多变黄",
                "慢支病史急性加重，伴活动后气短5天"
            ],
            "history": [
                "有长期吸烟史20年",
                "无发热，无咯血"
            ],
            "vitals": {"bp": "125-140/75-88", "hr": "75-90", "temp": "36.8-37.8", "spo2": "94-96"},
            "exam": ["双肺呼吸音粗，可闻及散在干湿性啰音"],
            "volume_status": {"skin_turgor": "正常", "mucosa": "湿润", "urine": "正常", "diarrhea_vomit_freq": "无", "oral_intake": "正常"}
        },
        "differential": ["肺炎", "支气管扩张", "哮喘急性发作"],
        "first_line_oral": ["阿莫西林克拉维酸钾片", "盐酸氨溴索口服溶液", "茶碱缓释片"],
        "second_line_iv": ["注射用头孢呋辛钠", "盐酸氨溴索注射液"],
        "contraindications": ["青霉素过敏禁用阿莫西林类", "心率快慎用茶碱"],
        "special_population_note": "老年患者注意排痰，避免强效镇咳药导致痰堵"
    },
    {
        "code": "MP-J15", "name": "肺炎支原体肺炎", "icd10": "J15.700",
        "iv_suitability": "conditional_iv", "negative_list_hit": False, "difficulty": "中级",
        "symptom_pool": {
            "chief_complaint": [
                "刺激性干咳伴发热1周",
                "咳嗽伴低热5天，夜间加重",
                "阵发性干咳伴胸痛3天"
            ],
            "history": [
                "青少年/年轻成人，学校聚集发病",
                "无咳痰，或少量白色黏痰"
            ],
            "vitals": {"bp": "105-120/65-78", "hr": "80-100", "temp": "37.5-38.5", "spo2": "94-97"},
            "exam": ["双肺呼吸音粗，可闻及少量干啰音，体征与影像学不符"],
            "volume_status": {"skin_turgor": "正常", "mucosa": "湿润", "urine": "正常", "diarrhea_vomit_freq": "无", "oral_intake": "正常"}
        },
        "differential": ["细菌性肺炎", "病毒性肺炎", "咳嗽变异性哮喘"],
        "first_line_oral": ["阿奇霉素分散片", "盐酸氨溴索口服溶液"],
        "second_line_iv": ["注射用阿奇霉素"],
        "contraindications": ["大环内酯类过敏禁用", "肝功能不全慎用阿奇霉素"],
        "special_population_note": "剧烈干咳为主，病程较长，抗生素需用足疗程"
    },
]

# 去重添加
added = 0
for d in new_diseases:
    if d['code'] not in existing_codes:
        db['diseases'].append(d)
        added += 1

db['version'] = '2026.11.04'
db['note'] = '医学生处方推演训练平台·疾病种子库（扩充版）。iv_suitability: usually_no_iv / conditional_iv / iv_preferred；negative_list_hit=true 表示命中门诊限输负面清单。difficulty: 初级/中级/高级。'

with open(SRC, 'w', encoding='utf-8') as f:
    json.dump(db, f, ensure_ascii=False, indent=2)

print(f"新增疾病: {added} 个")
print(f"疾病总数: {len(db['diseases'])} 个")
print(f"按难度分布:")
from collections import Counter
diff_count = Counter(d['difficulty'] for d in db['diseases'])
for k, v in diff_count.items():
    print(f"  {k}: {v} 个")
