# -*- coding: utf-8 -*-
import json, os, sys, io
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')

ROOT = r"D:\医学生处方推演训练平台"
def load(p):
    with open(os.path.join(ROOT, p), encoding='utf-8') as f:
        return json.load(f)

systems = load(r"data\anatomy-systems.json")["systems"]
hot = load(r"data\anatomy-hotspots.json")
quiz = load(r"data\anatomy-quiz.json")["questions"]
cases = load(r"data\anatomy-cases.json")["cases"]

# 1. structure inventory
struct_ids = {}  # id -> system
struct_missing_fields = []
sys_struct = {}
for s in systems:
    ids = []
    for st in s["structures"]:
        struct_ids[st["id"]] = s["id"]
        ids.append(st["id"])
        for fld in ["latin","location","relations","function","clinical","artery","nerve"]:
            v = st.get(fld)
            if v is None or (isinstance(v,str) and v.strip()==""):
                struct_missing_fields.append((s["id"], st["id"], st["name"], fld))
    sys_struct[s["id"]] = ids

print("=== SYSTEMS:", len(systems), " STRUCTURES:", len(struct_ids))
for s in systems:
    print(f"  {s['id']:24s} n={len(sys_struct[s['id']]):2d} subs={len(s.get('subsystems',[]))}")

# 2. system images existence
print("\n=== SYSTEM IMAGES ===")
imgs = hot.get("images", {})
for sid, path in imgs.items():
    p = os.path.join(ROOT, path.replace("/", os.sep))
    ok = os.path.exists(p)
    print(f"  {'OK ' if ok else 'MISS'} {sid:24s} {path}")
for s in systems:
    if s["id"] not in imgs:
        print(f"  NO-IMG-MAP {s['id']}")

# 3. hotspots reference validity
print("\n=== HOTSPOT VALIDITY ===")
hs = hot.get("hotspots", {})
for sid, m in hs.items():
    for sid2, loc in m.items():
        if sid2 not in struct_ids:
            print(f"  DANGLING hotspot: {sid}/{sid2} (not a structure)")
        if loc is None:
            print(f"  NULL hotspot: {sid}/{sid2}")
for sid, ids in sys_struct.items():
    m = hs.get(sid, {})
    no_hs = [i for i in ids if i not in m]
    if no_hs:
        print(f"  NO-HOTSPOT {sid}: {', '.join(no_hs)}")

# 4. detail_images: dangling refs + missing files
print("\n=== DETAIL IMAGES ===")
di = hot.get("detail_images", {})
for sid2, path in di.items():
    if sid2 not in struct_ids:
        print(f"  DANGLING detail key: {sid2} -> {path}")
    p = os.path.join(ROOT, path.replace("/", os.sep))
    if not os.path.exists(p):
        print(f"  FILE-MISS detail: {sid2} -> {path}")

# structures without any detail image
no_detail = [i for i in struct_ids if i not in di]
print(f"\n  structures w/o detail image: {len(no_detail)}/{len(struct_ids)}")
# by system
for sid, ids in sys_struct.items():
    nd = [i for i in ids if i not in di]
    print(f"    {sid:24s} {len(nd):2d} no-detail")

# 5. orphan images on disk
print("\n=== ORPHAN IMAGES (on disk, unreferenced) ===")
referenced = set(imgs.values()) | set(di.values())
for f in os.listdir(os.path.join(ROOT, "img", "atlas")):
    rel = f"img/atlas/{f}"
    if rel not in referenced:
        p = os.path.join(ROOT, "img", "atlas", f)
        print(f"  ORPHAN {rel} ({os.path.getsize(p)}B)")
for f in os.listdir(os.path.join(ROOT, "img")):
    if f.startswith("anat-") and f.lower().endswith((".jpg",".png")):
        rel = f"img/{f}"
        if rel not in referenced:
            print(f"  ORPHAN {rel}")

# 6. quiz / case reference validity
print("\n=== QUIZ ===")
print("  quiz count:", len(quiz))
qsys = {}
for q in quiz:
    qsys[q["system"]] = qsys.get(q["system"],0)+1
    if q["system"] not in sys_struct:
        print("  BAD quiz system:", q["id"], q["system"])
for sid in sys_struct:
    print(f"    {sid:24s} quiz={qsys.get(sid,0)}")
print("\n=== CASES ===")
print("  cases count:", len(cases))
csys = {}
for cs in cases:
    csys[cs["system"]] = csys.get(cs["system"],0)+1
for sid in sys_struct:
    print(f"    {sid:24s} cases={csys.get(sid,0)}")

# 7. missing fields summary
print("\n=== MISSING STRUCTURE FIELDS:", len(struct_missing_fields))
for row in struct_missing_fields:
    print("  ", row[0], row[1], row[2], row[3])
