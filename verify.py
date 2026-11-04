# -*- coding: utf-8 -*-
import json, os
base = os.path.dirname(__file__)
d = json.load(open(os.path.join(base,'data/diseases.json'),'r',encoding='utf-8'))
print(f'疾病: {len(d["diseases"])}个')
dr = json.load(open(os.path.join(base,'data/drugs.json'),'r',encoding='utf-8'))
print(f'药品: {len(dr["drugs"])}个')
r = json.load(open(os.path.join(base,'data/rules.json'),'r',encoding='utf-8'))
print(f'规则: {len(r["rules"])}条')
print(f'新增规则:')
for rule in r['rules'][-5:]:
    print(f'  - {rule["rule_id"]}: {rule["title"]}')
