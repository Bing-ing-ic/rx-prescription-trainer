# -*- coding: utf-8 -*-
import json, os, sys, io
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')

ROOT = r"D:\医学生处方推演训练平台"
def load(p):
    with open(os.path.join(ROOT, p), encoding='utf-8') as f:
        return json.load(f)
def dump(p, obj):
    with open(os.path.join(ROOT, p), 'w', encoding='utf-8', newline='\n') as f:
        json.dump(obj, f, ensure_ascii=False, indent=2)

hot = load(r"data\anatomy-hotspots.json")
sup = load(r"data\anatomy-image-map-supplement.json")
sysj = load(r"data\anatomy-systems.json")

struct_ids = {st["id"] for s in sysj["systems"] for st in s["structures"]}
di = hot.setdefault("detail_images", {})
existing = set(di.keys())
add, conflict, dangling_id, missing_file = [], [], [], []

for sid, path in sup["detail_images"].items():
    if sid not in struct_ids:
        dangling_id.append((sid, path)); continue
    if sid in existing:
        conflict.append((sid, di[sid], path)); continue
    if not os.path.exists(os.path.join(ROOT, path.replace("/", os.sep))):
        missing_file.append((sid, path)); continue
    di[sid] = path; add.append((sid, path))

print(f"supplement entries: {len(sup['detail_images'])}")
print(f"merged new: {len(add)}")
print(f"conflict(kept old): {len(conflict)}")
for c in conflict: print("  CONFLICT", c)
print(f"dangling struct id: {len(dangling_id)}")
for d in dangling_id: print("  DANGLING", d)
print(f"missing file: {len(missing_file)}")
for m in missing_file: print("  MISSFILE", m)

# final integrity: every detail_images key valid; every path exists
bad_id = [k for k in di if k not in struct_ids]
bad_file = [(k,v) for k,v in di.items() if not os.path.exists(os.path.join(ROOT, v.replace("/", os.sep)))]
print(f"\nfinal detail_images: {len(di)}")
print(f"final bad-id: {len(bad_id)} {bad_id}")
print(f"final missing-file: {len(bad_file)} {bad_file}")

# structures still without detail image
no_img = sorted(struct_ids - set(di.keys()))
print(f"structures w/o image: {len(no_img)} {no_img}")

if not conflict and not dangling_id and not missing_file and not bad_id and not bad_file:
    dump(r"data\anatomy-hotspots.json", hot)
    print("\nWRITTEN: anatomy-hotspots.json merged.")
else:
    print("\nNOT WRITTEN: resolve issues above first.")
