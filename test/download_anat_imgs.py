# -*- coding: utf-8 -*-
"""Download generated anatomy illustrations and compress to web-friendly JPG."""
import os, urllib.request, io
from PIL import Image

IMG_DIR = r"D:\医学生处方推演训练平台\img"
JOBS = [
    ("https://aka.doubaocdn.com/s/XGUbPDNTRh", "anat-locomotor.jpg"),
    ("https://aka.doubaocdn.com/s/uACrGN92xy", "anat-digestive.jpg"),
    ("https://aka.doubaocdn.com/s/OMPxrjzEU2", "anat-respiratory.jpg"),
    ("https://aka.doubaocdn.com/s/Us4IIV4Ppw", "anat-circulatory.jpg"),
    ("https://aka.doubaocdn.com/s/mwvAKZQT76", "anat-nervous.jpg"),
    ("https://aka.doubaocdn.com/s/sCIusyJGVj", "anat-urinary.jpg"),
]

TARGET_W = 1280  # web display width
for url, name in JOBS:
    raw = urllib.request.urlopen(url, timeout=60).read()
    im = Image.open(io.BytesIO(raw)).convert("RGB")
    w, h = im.size
    if w > TARGET_W:
        nh = int(h * TARGET_W / w)
        im = im.resize((TARGET_W, nh), Image.LANCZOS)
    out = os.path.join(IMG_DIR, name)
    im.save(out, "JPEG", quality=82, optimize=True)
    print(f"{name}: {im.size[0]}x{im.size[1]}, {os.path.getsize(out)//1024} KB")
print("done")
