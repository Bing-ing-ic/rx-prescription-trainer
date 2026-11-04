# -*- coding: utf-8 -*-
"""
医学生处方推演训练平台 - 数据层P0错误综合修复脚本
参考标准：国家医保药品目录2025版、抗菌药物临床应用分级管理目录、β内酰胺类皮肤过敏试验专家共识(2021)
"""
import json
import os
import copy
from collections import Counter, defaultdict

DATA_DIR = r'D:\医学生处方推演训练平台\data'

# ============================================================
# 加载数据
# ============================================================
with open(os.path.join(DATA_DIR, 'diseases.json'), 'r', encoding='utf-8') as f:
    diseases_data = json.load(f)
with open(os.path.join(DATA_DIR, 'drugs.json'), 'r', encoding='utf-8') as f:
    drugs_data = json.load(f)

diseases = diseases_data['diseases']
drugs = drugs_data['drugs']

# 记录修复日志
fix_log = []

def log(category, action, detail):
    fix_log.append({'category': category, 'action': action, 'detail': detail})
    print(f'  [{category}] {action}: {detail}')

# ============================================================
# 模块1: 修复哮喘急性发作二线静滴错误
# ============================================================
print('\n=== 模块1: 修复哮喘二线静滴 ===')
for dis in diseases:
    if dis['code'] == 'ASTHMA-J45':
        old_iv = dis['second_line_iv']
        log('哮喘用药', '修复前', f'second_line_iv = {old_iv}')
        # 删除错误的泮托拉唑，替换为正确的静脉用药
        # 正确的哮喘急性发作静脉用药：氨茶碱注射液、甲泼尼龙、地塞米松
        new_iv = []
        for d in old_iv:
            if '泮托拉唑' in d:
                log('哮喘用药', '删除错误', f'移除 "{d}"（PPI与哮喘无关，疑似胃溃疡模板复制错误）')
            else:
                new_iv.append(d)
        # 添加正确的静脉用药
        if '氨茶碱注射液' not in new_iv:
            new_iv.insert(0, '氨茶碱注射液')
            log('哮喘用药', '新增正确用药', '添加 "氨茶碱注射液"（支气管扩张剂，哮喘急性发作二线静滴）')
        if '注射用甲泼尼龙琥珀酸钠' not in new_iv:
            new_iv.insert(1, '注射用甲泼尼龙琥珀酸钠')
            log('哮喘用药', '新增正确用药', '添加 "注射用甲泼尼龙琥珀酸钠"（静脉糖皮质激素，哮喘急性发作）')
        dis['second_line_iv'] = new_iv
        log('哮喘用药', '修复后', f'second_line_iv = {new_iv}')

# ============================================================
# 模块2: 修正布地奈德给药途径
# ============================================================
print('\n=== 模块2: 修正布地奈德给药途径 ===')
for dr in drugs:
    if dr['generic_name'] == '布地奈德':
        old_form = dr['dosage_form']
        old_pclass = dr.get('pharmacology_class', '')
        log('布地奈德', '修复前', f'dosage_form={old_form}, pharmacology_class={old_pclass}')
        # 布地奈德只有吸入/雾化剂型，无静脉制剂
        dr['dosage_form'] = 'inhalation'
        dr['pharmacology_class'] = '吸入性糖皮质激素'
        dr['spec'] = '1mg/2ml/支（雾化混悬液）'
        dr['is_iv_capable'] = False
        dr['is_solvent'] = False
        dr['allowed_solvents_json'] = []
        dr['skin_test_required'] = False
        log('布地奈德', '修复后', f'dosage_form=inhalation（雾化吸入）, 删除iv_drip标记, 分类=吸入性糖皮质激素')

# ============================================================
# 模块3: 修正甘露醇注射液
# ============================================================
print('\n=== 模块3: 修正甘露醇注射液 ===')
for dr in drugs:
    if dr['generic_name'] == '甘露醇注射液':
        old_form = dr['dosage_form']
        old_solvent = dr.get('is_solvent', 'MISSING')
        log('甘露醇', '修复前', f'dosage_form={old_form}, is_solvent={old_solvent}')
        # 甘露醇是脱水剂，必须单独快速滴注，严禁作为溶媒
        dr['dosage_form'] = 'iv_drip'
        dr['is_solvent'] = False
        dr['is_iv_capable'] = True
        dr['pharmacology_class'] = '脱水剂/渗透性利尿剂'
        dr['skin_test_required'] = False
        dr['allowed_solvents_json'] = []  # 不能作为其他药物的溶媒
        dr['drip_speed_max_mlh'] = None  # 需快速滴注，不设上限
        dr['essential_medicine'] = True
        dr['otc_class'] = '处方药'
        dr['unit'] = '瓶'
        dr['special_warnings_json'] = [
            '必须单独快速静脉滴注（30分钟内滴完250ml）',
            '严禁作为其他药物的溶媒',
            '警惕肾功能损害和渗透性肾病',
            '外渗可致组织坏死'
        ]
        # 补全dose_range
        if 'adult' in dr:
            del dr['adult']
        dr['dose_range_json'] = {
            'single_min_ml': 125,
            'single_max_ml': 250,
            'default_freq': 'q12h',
            'default_duration_days': 3
        }
        dr['is_tcm_injection'] = False
        log('甘露醇', '修复后', 'dosage_form=iv_drip, is_solvent=false, 标注为脱水剂需单独快速滴注')

# ============================================================
# 模块4: 合并重复药品
# ============================================================
print('\n=== 模块4: 合并重复药品 ===')

# 4a: 合并注射用头孢哌酮钠舒巴坦钠的两个冲突条目
# 保留信息更完整的3.0g条目，但修正其abx_level和skin_test
removed_drugs = set()
merged_entries = []

# 找到两个头孢哌酮舒巴坦条目
cfst_entries = [i for i, dr in enumerate(drugs) if dr['generic_name'] == '注射用头孢哌酮钠舒巴坦钠']
if len(cfst_entries) >= 2:
    # 保留第一个（3.0g，字段更完整24个），删除第二个（2.0g，23字段）
    keep_idx = cfst_entries[0]
    drop_idx = cfst_entries[1]
    dropped_name = drugs[drop_idx]['generic_name']
    log('重复药品', '合并', f'合并 "{dropped_name}"（{drugs[drop_idx]["spec"]}）到保留条目（{drugs[keep_idx]["spec"]}）')
    # 保留正确的规格信息 - 使用2.0g规格更常用
    drugs[keep_idx]['spec'] = '2.0g/支'
    drugs[keep_idx]['abx_level'] = 'restricted'  # 限制使用级，不是特殊使用级
    drugs[keep_idx]['skin_test_required'] = False  # 头孢菌素不需常规皮试
    drugs[keep_idx]['jtc_batch'] = '第4批'
    drugs[keep_idx]['special_warnings_json'] = ['双硫仑样反应', '可引起凝血功能障碍', '肝功能不全慎用']
    removed_drugs.add(drop_idx)
    merged_entries.append(f'注射用头孢哌酮钠舒巴坦钠（合并2条→1条，修正分级为restricted，皮试改为false）')

# 4b: 合并"裸名"条目到完整条目
# 定义需要合并的裸名→完整名映射（仅当裸名条目是冗余的重复时）
merge_map = {
    # 裸名: (目标完整名, 理由)
    '万古霉素': '注射用盐酸万古霉素',  # 裸名无剂型，IV万古霉素才是常用的
    '注射用万古霉素': '注射用盐酸万古霉素',  # 重复
    '克林霉素': '注射用克林霉素磷酸酯',  # 裸名合并到IV制剂（口服另有克林霉素棕榈酸酯）
    '头孢他啶': '注射用头孢他啶',  # 裸名合并到IV制剂
    '头孢哌酮舒巴坦': '注射用头孢哌酮钠舒巴坦钠',  # 裸名合并到完整条目
    '哌拉西林他唑巴坦': '注射用哌拉西林钠他唑巴坦钠',  # 裸名合并到完整IV条目
    '克拉霉素': '克拉霉素片',  # 裸名合并到片剂
    '甲硝唑': '甲硝唑片',  # 裸名合并到片剂（IV有单独的甲硝唑注射液）
}

for bare_name, target_name in merge_map.items():
    bare_indices = [i for i, dr in enumerate(drugs) if dr['generic_name'] == bare_name]
    target_indices = [i for i, dr in enumerate(drugs) if dr['generic_name'] == target_name]
    if bare_indices and target_indices:
        # 检查目标条目是否存在且字段更完整
        bare_idx = bare_indices[0]
        target_idx = target_indices[0]
        if len(drugs[target_idx]) >= len(drugs[bare_idx]):
            log('重复药品', '合并', f'删除裸名条目 "{bare_name}"（{len(drugs[bare_idx])}字段），保留完整条目 "{target_name}"（{len(drugs[target_idx])}字段）')
            removed_drugs.add(bare_idx)
            merged_entries.append(f'{bare_name} → {target_name}')
        else:
            log('重复药品', '跳过', f'"{bare_name}"字段数({len(drugs[bare_idx])})不少于目标"{target_name}"({len(drugs[target_idx])})，保留两者')

# 执行删除
drugs = [dr for i, dr in enumerate(drugs) if i not in removed_drugs]
log('重复药品', '统计', f'共删除{len(removed_drugs)}条重复条目，剩余{len(drugs)}条')

# ============================================================
# 模块5: 统一pharmacology_class为中文标准分类
# ============================================================
print('\n=== 模块5: 统一pharmacology_class ===')

# 构建分类映射表
CLASS_MAP = {
    # CCB类
    'CCB': '钙通道阻滞剂（CCB）',
    'calcium_blocker': '钙通道阻滞剂（CCB）',
    '钙通道阻滞剂（CCB）': '钙通道阻滞剂（CCB）',
    # PPI类
    'PPI': '质子泵抑制剂（PPI）',
    'ppi': '质子泵抑制剂（PPI）',
    '质子泵抑制剂（PPI）': '质子泵抑制剂（PPI）',
    # 头孢类
    'cephalosporin_3': '第三代头孢菌素',
    '三代头孢': '第三代头孢菌素',
    '第三代头孢菌素': '第三代头孢菌素',
    '三代头孢口服': '第三代头孢菌素（口服）',
    'cephalosporin_2': '第二代头孢菌素',
    '二代头孢': '第二代头孢菌素',
    '一代头孢': '第一代头孢菌素',
    # 青霉素类
    'penicillin': '青霉素类',
    '青霉素类': '青霉素类',
    '青霉素+酶抑制剂': 'β内酰胺类/β内酰胺酶抑制剂',
    'β内酰胺类+酶抑制剂': 'β内酰胺类/β内酰胺酶抑制剂',
    '三代头孢+酶抑制剂': '第三代头孢/β内酰胺酶抑制剂',
    # 大环内酯
    'macrolide': '大环内酯类',
    '大环内酯类': '大环内酯类',
    # 喹诺酮
    'quinolone': '喹诺酮类',
    '喹诺酮类': '喹诺酮类',
    # 氨基糖苷
    'aminoglycoside': '氨基糖苷类',
    '氨基糖苷类': '氨基糖苷类',
    # 林可酰胺
    'lincosamide': '林可酰胺类',
    '林可酰胺类': '林可酰胺类',
    # 糖肽
    'glycopeptide': '糖肽类',
    '糖肽类': '糖肽类',
    '糖肽类抗菌药': '糖肽类',
    # 碳青霉烯
    '碳青霉烯类（特殊使用级）': '碳青霉烯类',
    # 噁唑烷酮
    'oxazolidinone': '噁唑烷酮类',
    # 磷霉素
    'phosphonomycin': '磷霉素类',
    '磷霉素类抗菌药': '磷霉素类',
    # 硝基咪唑
    'antiprotozoal': '硝基咪唑类',
    '硝基咪唑类': '硝基咪唑类',
    '硝基咪唑类抗菌药': '硝基咪唑类',
    # 硝基呋喃
    '硝基呋喃类': '硝基呋喃类',
    'urinary_antiseptic': '硝基呋喃类',
    # 四环素
    '四环素类': '四环素类',
    # 抗真菌
    '抗真菌药': '抗真菌药',
    'topical_antifungal': '外用抗真菌药',
    '外用抗真菌': '外用抗真菌药',
    # 外用抗菌
    '外用抗菌': '外用抗菌药',
    # β受体阻滞剂
    'beta_blocker': 'β受体阻滞剂',
    'β受体阻滞剂': 'β受体阻滞剂',
    # ARB
    'arb': '血管紧张素II受体拮抗剂（ARB）',
    'ARB': '血管紧张素II受体拮抗剂（ARB）',
    # ACEI
    'acei': '血管紧张素转换酶抑制剂（ACEI）',
    'ACEI': '血管紧张素转换酶抑制剂（ACEI）',
    # 他汀
    'statin': '他汀类',
    '他汀类': '他汀类',
    '他汀类调脂': '他汀类',
    '贝特类': '贝特类',
    # 抗血小板
    'antiplatelet': '抗血小板药',
    '抗血小板': '抗血小板药',
    # 硝酸酯
    '硝酸酯类': '硝酸酯类',
    # 利尿剂
    '袢利尿剂': '袢利尿剂',
    '保钾利尿剂': '保钾利尿剂',
    '利尿剂': '利尿剂',
    # 抗凝
    '抗凝药（维生素K拮抗剂）': '抗凝药（维生素K拮抗剂）',
    # ARNI
    'ARNI（血管紧张素受体脑啡肽酶抑制剂）': 'ARNI（血管紧张素受体脑啡肽酶抑制剂）',
    # 抗心律失常
    '抗心律失常药（III类）': '抗心律失常药（III类）',
    # α受体阻滞剂
    'α受体阻滞剂': 'α受体阻滞剂',
    # 复方降压
    '复方降压药（ARB+CCB）': '复方降压药',
    # 支气管扩张
    'bronchodilator': '支气管扩张剂',
    '支气管扩张剂': '支气管扩张剂',
    # 白三烯
    'leukotriene': '白三烯受体拮抗剂',
    '白三烯受体拮抗剂': '白三烯受体拮抗剂',
    # 祛痰
    'expectorant': '祛痰药',
    '祛痰药': '祛痰药',
    '祛痰药（黏液溶解剂）': '祛痰药',
    # 镇咳
    'antitussive': '镇咳药',
    # 鼻用
    'nasal_spray': '鼻用制剂',
    '鼻用糖皮质激素': '鼻用糖皮质激素',
    '鼻用减充血剂': '鼻用减充血剂',
    # 激素
    'steroid': '糖皮质激素',
    '糖皮质激素': '糖皮质激素',
    # 抗组胺
    'antihistamine': '抗组胺药',
    '第二代抗组胺药': '抗组胺药（第二代）',
    # 抗胆碱
    '抗胆碱药（M受体阻滞剂）': '抗胆碱药',
    # H2受体
    'h2_blocker': 'H2受体拮抗剂',
    'H2受体阻滞剂': 'H2受体拮抗剂',
    # 促动力
    'prokinetic': '促胃肠动力药',
    '促胃动力': '促胃肠动力药',
    '促胃肠动力药': '促胃肠动力药',
    # 抗酸/胃黏膜保护
    'antacid': '抗酸药/胃黏膜保护剂',
    '抗酸药': '抗酸药/胃黏膜保护剂',
    '胃黏膜保护': '抗酸药/胃黏膜保护剂',
    '抗酸药/胃黏膜保护剂': '抗酸药/胃黏膜保护剂',
    'mucosal_protectant': '胃黏膜保护剂',
    # 缓泻
    'laxative': '缓泻剂',
    '缓泻剂': '缓泻剂',
    # 解痉
    'antispasmodic': '解痉药',
    '解痉药': '解痉药',
    # 微生态
    'probiotic': '微生态制剂',
    '微生态制剂': '微生态制剂',
    '微生态制剂（益生菌）': '微生态制剂',
    # 助消化
    'digestant': '助消化药',
    # 止吐
    'antiemetic': '止吐药',
    '止吐药（多巴胺受体拮抗剂）': '止吐药',
    # 利胆
    '利胆药': '利胆药',
    # 止泻
    '止泻吸附剂': '止泻药',
    # 口服补液
    '口服补液': '口服补液盐',
    # 降糖
    'biguanide': '双胍类',
    '双胍类降糖药': '双胍类',
    'sulfonylurea': '磺脲类',
    '磺脲类': '磺脲类',
    '磺脲类降糖药': '磺脲类',
    'alpha_glucosidase': 'α-糖苷酶抑制剂',
    'α糖苷酶抑制剂': 'α-糖苷酶抑制剂',
    'meglitinide': '格列奈类',
    '餐时血糖调节剂': '格列奈类',
    'SGLT2抑制剂': 'SGLT2抑制剂',
    'insulin_sensitizer': '胰岛素增敏剂',
    '长效胰岛素': '胰岛素',
    '速效胰岛素': '胰岛素',
    # 甲状腺
    'thyroid': '甲状腺激素',
    '甲状腺激素': '甲状腺激素',
    '抗甲状腺药': '抗甲状腺药',
    # 抗痛风
    'antigout': '抗痛风药',
    '抗痛风药': '抗痛风药',
    '降尿酸药（黄嘌呤氧化酶抑制剂）': '抗痛风药',
    '降尿酸药（促尿酸排泄）': '抗痛风药',
    # 维生素
    'vitamin': '维生素类',
    '维生素': '维生素类',
    '维生素类': '维生素类',
    'vitamin_b12': '维生素B12类',
    '维生素B12类': '维生素B12类',
    # 电解质
    'electrolyte': '电解质补充药',
    '电解质': '电解质补充药',
    '电解质补充': '电解质补充药',
    '溶媒/电解质': '溶媒/电解质',
    # 营养
    '营养剂': '营养药',
    # SSRI/精神
    'SSRI': '抗抑郁药（SSRI）',
    '非典型抗精神病药': '非典型抗精神病药',
    '苯二氮卓类': '苯二氮卓类',
    '非苯二氮卓催眠药': '非苯二氮卓类催眠药',
    '抗焦虑药': '抗焦虑药',
    'sedative': '镇静催眠药',
    '中枢性镇痛药': '中枢性镇痛药',
    # 神经
    'neurotrophic': '神经营养药',
    'neuroprotective': '神经保护药',
    'cerebrovascular': '脑血管扩张药',
    '脑循环改善剂': '脑血管扩张药',
    '自由基清除剂（脑保护）': '神经保护药',
    '抗癫痫/神经病理性疼痛药': '抗癫痫/神经病理性疼痛药',
    '植物神经调节': '植物神经调节药',
    # NSAIDs
    'nsaid': '非甾体抗炎药（NSAIDs）',
    'NSAIDs': '非甾体抗炎药（NSAIDs）',
    '非甾体抗炎药（NSAIDs）': '非甾体抗炎药（NSAIDs）',
    '解热镇痛': '非甾体抗炎药（NSAIDs）',
    'antipyretic': '非甾体抗炎药（NSAIDs）',
    'cox2_inhibitor': 'COX-2抑制剂',
    'COX-2抑制剂': 'COX-2抑制剂',
    '非甾体抗炎药（COX-2抑制剂）': 'COX-2抑制剂',
    '水杨酸类抗炎药（IBD）': '水杨酸类制剂',
    # TCM
    'tcm_cardio': '中成药',
    'tcm_cold': '中成药',
    'tcm_digest': '中成药',
    'tcm_tonic': '中成药',
    'tcm_hemostatic': '中成药',
    'tcm_cough': '中成药',
    'tcm_heat': '中成药',
    '中成药': '中成药',
    '中成药（止咳化痰）': '中成药',
    '中成药（清热凉血）': '中成药',
    '中成药（清热解毒）': '中成药',
    '中成药（益气养阴）': '中成药',
    '中药注射剂-清热解毒': '中药注射剂',
    '中药注射剂-活血': '中药注射剂',
    '中药注射剂-扶正': '中药注射剂',
    # 溶媒
    '溶媒': '溶媒',
    # 脱水
    '脱水剂/渗透性利尿剂': '脱水剂/渗透性利尿剂',
    # 外用
    '外用激素': '外用糖皮质激素',
    '外用中效激素': '外用糖皮质激素',
    '外用钙调磷酸酶抑制剂': '外用钙调磷酸酶抑制剂',
    '外用止痒': '外用止痒药',
    '外用止痛': '外用止痛药',
    '外用消毒': '外用消毒防腐药',
    # 眼科
    'ophthalmic': '眼科用药',
    '眼科抗生素激素复方': '眼科用药',
    '眼科非甾体抗炎药': '眼科用药',
    '人工泪液': '眼科用药',
    # 耳鼻喉
    '耳用抗菌药': '耳鼻喉用药',
    # 免疫
    '免疫调节剂': '免疫调节剂',
    '升白细胞药': '升白细胞药',
    '抗贫血药（口服铁剂）': '抗贫血药',
    # 肝病
    '肝病辅助用药': '肝病辅助用药',
    # 血管活性
    '血管活性药（多巴胺受体激动剂）': '血管活性药',
    # BPH
    '5α还原酶抑制剂': '5α还原酶抑制剂',
    # 激素
    '孕激素': '性激素类',
    # 复方感冒
    '复方感冒药（解热镇痛）': '复方感冒药',
    # 钙/骨
    '钙补充剂/维生素D': '钙补充剂/维生素D',
    '双膦酸盐类': '双膦酸盐类',
    # 吸入激素
    '吸入性糖皮质激素': '吸入性糖皮质激素',
    # 外用抗病毒
    '外用抗病毒': '外用抗病毒药',
    # 咽炎/其他
    '抗炎药': '抗炎药',
}

class_fixes = Counter()
for dr in drugs:
    old_cls = dr.get('pharmacology_class', '')
    new_cls = CLASS_MAP.get(old_cls, old_cls)
    if new_cls != old_cls:
        dr['pharmacology_class'] = new_cls
        class_fixes[f'{old_cls} → {new_cls}'] += 1

log('分类统一', '统计', f'共修正{sum(class_fixes.values())}条药品的pharmacology_class')
for change, cnt in class_fixes.most_common(30):
    log('分类统一', '映射', f'{change}（{cnt}条）')

# 统计统一后的分类数
final_classes = Counter(dr.get('pharmacology_class', 'MISSING') for dr in drugs)
log('分类统一', '结果', f'统一后共{len(final_classes)}种分类（原197种）')

# ============================================================
# 模块6: 修正抗菌药物分级
# ============================================================
print('\n=== 模块6: 修正抗菌药物分级 ===')

# 需要修正的abx_level
ABX_FIXES = {
    '注射用哌拉西林钠他唑巴坦钠': ('restricted', '原标special，哌拉西林他唑巴坦应为限制使用级'),
    '注射用阿莫西林钠克拉维酸钾': ('restricted', '原标non_restricted，阿莫西林克拉维酸注射剂应为限制使用级'),
}

for dr in drugs:
    name = dr['generic_name']
    if name in ABX_FIXES:
        old_level = dr.get('abx_level')
        new_level, reason = ABX_FIXES[name]
        if old_level != new_level:
            dr['abx_level'] = new_level
            log('抗菌分级', '修正', f'{name}: {old_level} → {new_level}（{reason}）')

# ============================================================
# 模块7: 修正皮试标注
# ============================================================
print('\n=== 模块7: 修正皮试标注 ===')

# 7a: 头孢菌素类一般不需皮试（2021版β内酰胺皮试指导原则）
# 以下头孢菌素误标需皮试，改为False
CEPHALOSPORIN_SKIN_TEST_FALSE = [
    '注射用头孢呋辛钠',
    '注射用头孢他啶',
    '注射用头孢唑林钠',
    '注射用头孢硫脒',
    '注射用头孢哌酮钠舒巴坦钠',  # 头孢哌酮为头孢类
]

for dr in drugs:
    name = dr['generic_name']
    if name in CEPHALOSPORIN_SKIN_TEST_FALSE:
        old_val = dr.get('skin_test_required')
        if old_val == True:
            dr['skin_test_required'] = False
            log('皮试修正', '头孢改免皮试', f'{name}: True → False（2021β内酰胺皮试指导原则：头孢菌素常规不需皮试）')
        elif old_val == False:
            log('皮试修正', '头孢已正确', f'{name}: 已为False，无需修改')

# 7b: 青霉素类必须皮试
# 阿莫西林克拉维酸钾口服片误标不需皮试
PENICILLIN_SKIN_TEST_TRUE = [
    '阿莫西林克拉维酸钾片',
    '阿莫西林克拉维酸钾',  # 裸名口服
]

for dr in drugs:
    name = dr['generic_name']
    if name in PENICILLIN_SKIN_TEST_TRUE:
        old_val = dr.get('skin_test_required')
        if old_val == False or old_val is None:
            dr['skin_test_required'] = True
            log('皮试修正', '青霉素改必皮试', f'{name}: {old_val} → True（青霉素类必须皮试）')

# 确保所有青霉素类IV制剂都标True
for dr in drugs:
    name = dr['generic_name']
    pclass = dr.get('pharmacology_class', '')
    if '青霉素' in pclass and dr.get('dosage_form') in ('iv_drip', 'im'):
        if dr.get('skin_test_required') != True:
            old = dr.get('skin_test_required')
            dr['skin_test_required'] = True
            log('皮试修正', '青霉素IV改必皮试', f'{name}: {old} → True')

# ============================================================
# 模块8: 添加氨茶碱注射液（哮喘急性发作需要）
# ============================================================
print('\n=== 模块8: 添加氨茶碱注射液 ===')

# 检查是否已存在
has_aminophylline_iv = any(dr['generic_name'] == '氨茶碱注射液' for dr in drugs)
if not has_aminophylline_iv:
    new_drug = {
        'generic_name': '氨茶碱注射液',
        'brand_name': '氨茶碱',
        'dosage_form': 'iv_drip',
        'spec': '0.25g/2ml/支',
        'unit': '支',
        'medical_insurance_class': '甲',
        'essential_medicine': True,
        'jtc_batch': False,
        'otc_class': '处方药',
        'abx_level': 'none',
        'pharmacology_class': '支气管扩张剂',
        'dose_range_json': {
            'single_min_mg': 125,
            'single_max_mg': 250,
            'daily_max_mg': 500,
            'default_freq': 'bid',
            'default_duration_days': 3
        },
        'liver_renal_note': '肾功能不全减量，监测血药浓度',
        'is_iv_capable': True,
        'allowed_solvents_json': ['5%葡萄糖注射液 250ml'],
        'drip_speed_max_mlh': 30,
        'skin_test_required': False,
        'special_warnings_json': [
            '治疗窗窄，需缓慢静脉滴注',
            '不可与维生素C、促皮质素配伍',
            '心率>120次/分慎用'
        ],
        'is_solvent': False,
        'is_tcm_injection': False,
        'price_yuan': 2,
        'manufacturer': '天津药业',
        'pinyin': 'acjzsy',
        'pinyin_code': 'ACJZSY'
    }
    drugs.append(new_drug)
    log('新增药品', '氨茶碱注射液', '添加氨茶碱注射液（哮喘急性发作二线静滴用药）')

# ============================================================
# 模块9: 统一iv_suitability枚举
# ============================================================
print('\n=== 模块9: 统一iv_suitability枚举 ===')
# 标准枚举：
# usually_no_iv - 通常无需输液（门诊口服为主）
# conditional_iv - 条件性输液（脱水/不能口服时）
# may_need_iv - 可能需要输液（病情加重时）
# needs_iv - 需要输液（口服不可行）
# iv_preferred - 首选输液（重症/不能口服）

VALID_IV_VALUES = {'usually_no_iv', 'conditional_iv', 'may_need_iv', 'needs_iv', 'iv_preferred'}
iv_dist = Counter()
for dis in diseases:
    val = dis['iv_suitability']
    iv_dist[val] += 1
    if val not in VALID_IV_VALUES:
        log('iv_suitability', '异常值', f'{dis["code"]}: "{val}" 不在标准枚举中')

log('iv_suitability', '统计', f'当前分布: {dict(iv_dist)}')
log('iv_suitability', '说明', '已为标准5级枚举，规则引擎可识别usually_no_iv，其余层级按严重度递增')

# ============================================================
# 模块10: 孤儿药品处理
# ============================================================
print('\n=== 模块10: 孤儿药品处理 ===')

# 收集所有疾病引用的药品名
referenced = set()
for dis in diseases:
    for dname in dis.get('first_line_oral', []):
        referenced.add(dname)
    for dname in dis.get('second_line_iv', []):
        referenced.add(dname)

orphans = [dr for dr in drugs if dr['generic_name'] not in referenced]
log('孤儿药品', '统计', f'总药品{len(drugs)}，被引用{len(referenced)}，孤儿{len(orphans)}')

# 不删除孤儿药品（它们是药品数据库的组成部分），
# 但添加 reference_status 字段标注
for dr in drugs:
    if dr['generic_name'] in referenced:
        dr['reference_status'] = 'core'  # 被疾病引用的核心药品
    else:
        dr['reference_status'] = 'backup'  # 备用药品库

log('孤儿药品', '处理', '保留所有药品，添加reference_status字段：core=被疾病引用，backup=备用药品库')
log('孤儿药品', '说明', '药品库作为训练平台参考数据库保留全部药品，不删除临床常用药')

# ============================================================
# 保存数据
# ============================================================
print('\n=== 保存数据 ===')

diseases_data['diseases'] = diseases
drugs_data['drugs'] = drugs

with open(os.path.join(DATA_DIR, 'diseases.json'), 'w', encoding='utf-8') as f:
    json.dump(diseases_data, f, ensure_ascii=False, indent=2)
print('  diseases.json 已保存')

with open(os.path.join(DATA_DIR, 'drugs.json'), 'w', encoding='utf-8') as f:
    json.dump(drugs_data, f, ensure_ascii=False, indent=2)
print('  drugs.json 已保存')

# 输出最终统计
print(f'\n=== 最终统计 ===')
print(f'疾病数: {len(diseases)}')
print(f'药品数: {len(drugs)}')
final_classes = Counter(dr.get('pharmacology_class', 'MISSING') for dr in drugs)
print(f'药理分类数: {len(final_classes)}')

# 保存修复日志供报告使用
with open(os.path.join(DATA_DIR, '_fix_log.json'), 'w', encoding='utf-8') as f:
    json.dump({
        'fix_log': fix_log,
        'final_stats': {
            'disease_count': len(diseases),
            'drug_count': len(drugs),
            'class_count': len(final_classes),
            'orphan_count': len(orphans),
            'referenced_count': len(referenced),
        },
        'class_distribution': dict(final_classes.most_common()),
    }, f, ensure_ascii=False, indent=2)
print('修复日志已保存到 _fix_log.json')
