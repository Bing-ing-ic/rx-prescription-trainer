#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""
将 dayi.org.cn 下载的母子穴定位图压缩转存为 img/meridians/point-{pinyin}.jpg
- 限宽 675（与现有 point-taiyuan.jpg 一致），等比缩放
- PNG 透明底转白底，统一 JPEG quality 82
"""
import os
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, "..", "agent_tmp_imgs")  # 由调用方放置；此处用绝对会话目录
# 会话临时目录（与 PowerShell 下载目录一致）
SRC = r"C:\Users\Administrator\AppData\Local\DoubaoWork\User Data\Default\.doubaowork\agent_mode\workspace\.sessions\38451299157415426\agents\o_000eYoINX6a\imgs"
DST = os.path.join(ROOT, "img", "meridians")

# pinyin -> 源文件名（含扩展名）
MAP = {
    "jiexi": "jiexi.jpg", "shaochong": "shaochong.png", "houxi": "houxi.jpg",
    "zhiyin": "zhiyin.jpg", "fuliu": "fuliu.jpg", "zhongchong": "zhongchong.jpg",
    "zhongzhu": "zhongzhu.jpg", "xiaxi": "xiaxi.jpg", "chize": "chize.jpg",
    "daling": "daling.jpg", "xingjian": "xingjian.jpg", "dadu": "dadu.jpg",
    "ququan": "ququan.jpg", "erjian": "erjian.jpg", "lidui": "lidui.jpg",
    "shangqiu": "shangqiu.jpg", "xiaohai": "xiaohai.jpg", "shugu": "shugu.jpg",
    "tianjing": "tianjing.jpg", "yangfu": "yangfu.jpg",
}

MAX_W = 675
QUALITY = 82

for py, fname in MAP.items():
    src = os.path.join(SRC, fname)
    if not os.path.exists(src):
        print(f"[MISS] {py}: 源文件不存在 {src}")
        continue
    im = Image.open(src)
    if im.mode in ("RGBA", "LA", "P"):
        im = im.convert("RGBA")
        bg = Image.new("RGB", im.size, (255, 255, 255))
        bg.paste(im, mask=im.split()[-1] if im.mode == "RGBA" else None)
        im = bg
    else:
        im = im.convert("RGB")
    if im.width > MAX_W:
        h = round(im.height * MAX_W / im.width)
        im = im.resize((MAX_W, h), Image.LANCZOS)
    out = os.path.join(DST, f"point-{py}.jpg")
    im.save(out, "JPEG", quality=QUALITY, optimize=True)
    print(f"[OK] point-{py}.jpg  {im.width}x{im.height}  {os.path.getsize(out)//1024}KB")

print("done")
