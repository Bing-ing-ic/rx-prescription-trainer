from PIL import Image
import os, glob, json
from collections import Counter

print('=== 现有经络图 ===')
for f in sorted(glob.glob('img/meridians/*.jpg')):
    im = Image.open(f)
    kb = os.path.getsize(f)//1024
    print(f'  {os.path.basename(f):35s} {im.width}x{im.height}  {kb}KB')

im = Image.open('img/acup-meridian-chart.jpg')
kb = os.path.getsize('img/acup-meridian-chart.jpg')//1024
print(f'  {"acup-meridian-chart.jpg":35s} {im.width}x{im.height}  {kb}KB')

print()
d = json.load(open('data/acup-points.json', encoding='utf-8'))
c = Counter(p['meridian'] for p in d['points'])
for k, v in sorted(c.items()):
    print(f'  {k}: {v}穴')

print()
print('=== 经外奇穴 ===')
for p in d['points']:
    if p['meridian'] == '经外奇穴':
        print(f"  {p['code']} {p['name']} - {p['location'][:60]}")
