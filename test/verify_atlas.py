# -*- coding: utf-8 -*-
import json, re, io, sys
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')
base = r"D:\医学生处方推演训练平台"
hs = json.load(open(base + r"\data\anatomy-hotspots.json", encoding="utf-8"))
sy = json.load(open(base + r"\data\anatomy-systems.json", encoding="utf-8"))
sids = {s["id"]: {x["id"] for x in s["structures"]} for s in sy["systems"]}
errors = []
for sysid, items in hs["hotspots"].items():
    valid = sids.get(sysid, set())
    for sid, pos in items.items():
        if sid not in valid:
            errors.append(f"hotspot id {sid} not in system {sysid}")
        if pos is not None:
            if not (0 <= pos["x"] <= 100 and 0 <= pos["y"] <= 100):
                errors.append(f"out-of-range {sysid}/{sid}: {pos}")
# image mapping exists for each keyed system
for sysid in hs["images"]:
    if sysid not in sids:
        errors.append(f"image maps to unknown system {sysid}")
# HTML ids
html = open(base + r"\index.html", encoding="utf-8").read()
for need in ['id="anat-atlas-img"', 'id="anat-atlas-hotlayer"', 'id="anat-atlas-wrap"']:
    if need not in html:
        errors.append(f"HTML missing {need}")
print("hotspot systems:", list(hs["hotspots"].keys()))
print("total hotspots:", sum(1 for items in hs["hotspots"].values() for p in items.values() if p))
print("errors:", errors if errors else "NONE - all consistent")
