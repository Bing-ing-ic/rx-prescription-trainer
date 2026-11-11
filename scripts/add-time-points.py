#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""
补录子午流注纳子法母子穴中库外的 9 个五输穴到 acup-points.json。
标准定位/类属/主治/操作依 GB/T 12346-2021 与人卫《针灸学》口径。
幂等：同名已存在则跳过。
"""
import json, os

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DB = os.path.join(ROOT, "data", "acup-points.json")

NEW = [
    {
        "code": "SP-02", "name": "大都", "pinyin": "dadu", "meridian": "足太阴脾经",
        "location": "足内侧缘，足大趾本节（第1跖趾关节）前下方赤白肉际凹陷处",
        "category": "荥穴", "functions": "健脾和胃，清热利湿",
        "indications": ["腹胀", "胃痛", "食不化", "呕逆", "泄泻", "便秘", "热病无汗"],
        "needling_method": "直刺0.3-0.5寸；可灸",
        "special_note": "脾经荥穴（火）；纳子法虚证补母穴"
    },
    {
        "code": "LR-08", "name": "曲泉", "pinyin": "ququan", "meridian": "足厥阴肝经",
        "location": "膝内侧，屈膝，膝关节内侧面横纹内侧端，股骨内侧髁内缘，半腱肌、半膜肌止端前缘凹陷处",
        "category": "合穴", "functions": "疏肝解郁，调经止痛，清利湿热",
        "indications": ["膝髌肿痛", "屈伸不利", "痛经", "带下", "遗尿", "小便不利", "阴挺"],
        "needling_method": "直刺1-1.5寸；可灸",
        "special_note": "肝经合穴（水）；纳子法虚证补母穴"
    },
    {
        "code": "LI-02", "name": "二间", "pinyin": "erjian", "meridian": "手阳明大肠经",
        "location": "微握拳，在手食指本节（第2掌指关节）前桡侧，赤白肉际凹陷处",
        "category": "荥穴", "functions": "清热消肿，利咽止痛",
        "indications": ["齿痛", "咽喉肿痛", "目痛", "鼻衄", "口眼㖞斜", "热病", "腹痛泄泻"],
        "needling_method": "直刺0.2-0.3寸；可灸",
        "special_note": "大肠经荥穴（水）；纳子法实证泻子穴"
    },
    {
        "code": "ST-45", "name": "厉兑", "pinyin": "lidui", "meridian": "足阳明胃经",
        "location": "足第2趾末节外侧，距趾甲角0.1寸（指寸）",
        "category": "井穴", "functions": "清胃泻火，开窍醒神",
        "indications": ["齿痛", "鼻衄", "咽喉肿痛", "腹胀", "热病多梦", "癫狂"],
        "needling_method": "浅刺0.1寸；或点刺出血；可灸",
        "special_note": "胃经井穴（金）；纳子法实证泻子穴"
    },
    {
        "code": "SP-05", "name": "商丘", "pinyin": "shangqiu", "meridian": "足太阴脾经",
        "location": "足内踝前下方凹陷中，舟骨结节与内踝尖连线的中点处",
        "category": "经穴", "functions": "健脾化湿，理气和胃",
        "indications": ["腹胀", "泄泻", "便秘", "食不化", "黄疸", "足踝痛", "痔疾"],
        "needling_method": "直刺0.5-0.8寸；可灸",
        "special_note": "脾经经穴（金）；纳子法实证泻子穴"
    },
    {
        "code": "SI-08", "name": "小海", "pinyin": "xiaohai", "meridian": "手太阳小肠经",
        "location": "肘内侧，尺骨鹰嘴与肱骨内上髁之间凹陷处",
        "category": "合穴", "functions": "通络止痛，宁神定志",
        "indications": ["肘臂疼痛", "颈项拘急", "癫疾", "耳鸣", "齿龈肿痛"],
        "needling_method": "直刺0.3-0.5寸；可灸",
        "special_note": "小肠经合穴（土）；纳子法实证泻子穴"
    },
    {
        "code": "BL-65", "name": "束骨", "pinyin": "shugu", "meridian": "足太阳膀胱经",
        "location": "足外侧，足小趾本节（第5跖趾关节）后方，赤白肉际处",
        "category": "输穴", "functions": "舒筋活络，清头明目",
        "indications": ["头痛", "项强", "目眩", "目赤", "癫狂", "腰背痛", "下肢后侧痛"],
        "needling_method": "直刺0.3-0.5寸；可灸",
        "special_note": "膀胱经输穴（木）；纳子法实证泻子穴"
    },
    {
        "code": "TE-10", "name": "天井", "pinyin": "tianjing", "meridian": "手少阳三焦经",
        "location": "臂外侧，屈肘时肘尖直上1寸凹陷处",
        "category": "合穴", "functions": "行气散结，通络止痛",
        "indications": ["偏头痛", "胁肋痛", "肩臂痛", "瘰疬", "瘿气", "癫痫"],
        "needling_method": "直刺0.5-1寸；可灸",
        "special_note": "三焦经合穴（土）；纳子法实证泻子穴"
    },
    {
        "code": "GB-38", "name": "阳辅", "pinyin": "yangfu", "meridian": "足少阳胆经",
        "location": "小腿外侧，外踝尖上4寸，腓骨前缘稍前方",
        "category": "经穴", "functions": "疏肝解郁，清胆泻热，通络止痛",
        "indications": ["偏头痛", "胁痛", "下肢外侧痛", "瘰疬", "腋下肿", "疟疾"],
        "needling_method": "直刺0.5-1寸；可灸",
        "special_note": "胆经经穴（火）；纳子法实证泻子穴"
    },
]

with open(DB, "r", encoding="utf-8") as f:
    db = json.load(f)

existing = {p["name"] for p in db["points"]}
added = 0
for p in NEW:
    if p["name"] in existing:
        print(f"[SKIP] {p['name']} 已存在")
        continue
    db["points"].append(p)
    added += 1
    print(f"[ADD]  {p['code']} {p['name']} ({p['pinyin']})")

with open(DB, "w", encoding="utf-8") as f:
    json.dump(db, f, ensure_ascii=False, indent=2)
    f.write("\n")

print(f"done, added {added}, total {len(db['points'])}")
