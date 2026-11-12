# -*- coding: utf-8 -*-
import json, os, sys, io
from PIL import Image
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')
ROOT = r"D:\医学生处方推演训练平台"
hot = json.load(open(os.path.join(ROOT,"data","anatomy-hotspots.json"),encoding="utf-8"))
di = hot["detail_images"]
bad, big, small = [], [], []
for sid, rel in di.items():
    p = os.path.join(ROOT, rel.replace("/",os.sep))
    if not os.path.exists(p):
        bad.append((sid,rel,"missing")); continue
    try:
        im = Image.open(p); im.verify()
        sz = os.path.getsize(p)
        if sz > 300*1024: big.append((sid,rel,round(sz/1024)))
        w,h = Image.open(p).size
        if w<200 or h<200: small.append((sid,rel,(w,h)))
    except Exception as e:
        bad.append((sid,rel,str(e)))
print(f"detail images checked: {len(di)}")
print(f"invalid: {len(bad)} {bad}")
print(f">300KB: {len(big)} {big}")
print(f"tiny<200px: {len(small)} {small}")

# quiz / cases field schema check
q = json.load(open(os.path.join(ROOT,"data","anatomy-quiz.json"),encoding="utf-8"))["questions"]
c = json.load(open(os.path.join(ROOT,"data","anatomy-cases.json"),encoding="utf-8"))["cases"]
qneed = {"id","system","difficulty","prompt","explanation","type"}
qbad = []
ansbad = []
for x in q:
    if not qneed.issubset(x.keys()):
        qbad.append((x["id"], sorted(x.keys())))
    t = x["type"]
    if t == "identify":
        if not (isinstance(x.get("answer"),int) and 0<=x["answer"]<len(x.get("options",[]))):
            ansbad.append(x["id"])
    elif t == "match":
        L,R = x.get("pairs_left",[]), x.get("pairs_right",[])
        a = x.get("answer",[])
        if not (isinstance(a,list) and len(a)==len(L) and all(isinstance(v,int) and 0<=v<len(R) for v in a)):
            ansbad.append(x["id"])
    elif t == "qa":
        if not (x.get("answer_points") or x.get("answer")):
            ansbad.append(x["id"])
cneed = {"id","title","system","difficulty","scenario","question","key_structures","answer","exam_point"}
cbad = [x["id"] for x in c if not cneed.issubset(x.keys())]
print(f"\nquiz={len(q)} schema-bad={qbad} answer-bad={ansbad}")
print(f"cases={len(c)} schema-bad={cbad}")

# new structures field completeness
sysj = json.load(open(os.path.join(ROOT,"data","anatomy-systems.json"),encoding="utf-8"))
struct = {st["id"]:(s["id"],st) for s in sysj["systems"] for st in s["structures"]}
for nid in ["retroperitoneal_space","phrenic_nerve","common_carotid_artery"]:
    sid,st = struct[nid]
    miss=[f for f in ["latin","location","relations","function","clinical","artery","nerve"] if not str(st.get(f,"")).strip()]
    print(f"new {nid} [{sid}] miss={miss}")
