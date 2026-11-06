import json, os, sys
root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
exams = json.load(open(os.path.join(root,'data','lab-exams.json'),encoding='utf-8'))['exams']
emap = {e['code']: e for e in exams}
mappings = json.load(open(os.path.join(root,'data','disease-lab-map.json'),encoding='utf-8'))['mappings']
missing = []
total = 0
status_set = set()
for code, items in mappings.items():
    for it in items:
        total += 1
        status_set.add(it['status'])
        if it['exam_code'] not in emap:
            missing.append((code, it['exam_code']))
print(f'总映射条数: {total}')
print(f'status 取值: {status_set}')
print(f'悬空 exam_code: {len(missing)}')
if missing:
    for m in missing[:10]: print(' ', m)
print('--- HTN-I10 抽样 ---')
for it in mappings['HTN-I10']:
    e = emap.get(it['exam_code'], {})
    print(f"  {it['exam_code']} ({e.get('name','?')}): result={it['result']} status={it['status']}")
print('--- CAP-J18 抽样（肺炎应有异常） ---')
for it in mappings['CAP-J18']:
    e = emap.get(it['exam_code'], {})
    print(f"  {it['exam_code']} ({e.get('name','?')}): result={it['result']} status={it['status']}")
