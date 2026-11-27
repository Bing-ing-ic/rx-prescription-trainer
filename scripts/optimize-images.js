#!/usr/bin/env node
/**
 * 图片优化脚本（性能优化）
 * 用法：
 *   node scripts/optimize-images.js report   # 干跑：只输出报告，不写文件
 *   node scripts/optimize-images.js apply    # 实际重编码（JPG 限宽+质量压缩；PNG 转 WebP）
 *
 * 规则：
 *  - JPG/JPEG：宽度上限 1400，quality 80，mozjpeg，保留原扩展名
 *  - PNG：照片类 hero 图转 WebP（quality 82），输出同名 .webp；原 PNG 保留作兜底
 *  - 跳过 _archive / _backup 目录与 *.bak
 */
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

const IMG_DIR = path.resolve(__dirname, '..', 'img');
const MODE = process.argv[2] || 'report';
const MAX_WIDTH = 1600;
const JPG_Q = 82;
const WEBP_Q = 84;

function walk(dir, out = []) {
  for (const name of fs.readdirSync(dir)) {
    const full = path.join(dir, name);
    if (/_archive|_backup|\.backup|-backup|\.bak/i.test(full)) continue;
    const st = fs.statSync(full);
    if (st.isDirectory()) walk(full, out);
    else if (/\.(jpe?g|png|webp)$/i.test(name)) out.push(full);
  }
  return out;
}

function fmtKB(b) { return (b / 1024).toFixed(1) + ' KB'; }

(async () => {
  let files = walk(IMG_DIR);
  // 跳过与已引用 PNG 同名的残留 JPG（HTML 实际引用 PNG）
  const pngBases = new Set(files.filter(f => /\.png$/i.test(f)).map(f => path.basename(f, path.extname(f))));
  files = files.filter(f => !(/\.(jpe?g)$/i.test(f) && pngBases.has(path.basename(f, path.extname(f)))));
  let before = 0, after = 0;
  const rows = [];
  let converted = 0;

  for (const file of files) {
    const size = fs.statSync(file).size;
    before += size;
    const ext = path.extname(file).toLowerCase();
    let meta;
    try { meta = await sharp(file).metadata(); } catch (e) { rows.push({ file, size, note: '读取失败 ' + e.message }); continue; }

    let targetSize = size;
    let outFile = file;
    let encoder;

    if (ext === '.png') {
      // PNG -> WebP
      const webp = file.replace(/\.png$/i, '.webp');
      outFile = webp;
      encoder = sharp(file).resize({ width: MAX_WIDTH, withoutEnlargement: true }).webp({ quality: WEBP_Q });
    } else {
      encoder = sharp(file).resize({ width: MAX_WIDTH, withoutEnlargement: true }).jpeg({ quality: JPG_Q, mozjpeg: true });
    }

    try {
      if (MODE === 'apply') {
        const buf = await encoder.toBuffer();
        targetSize = buf.length;
        // 仅当重编码后更小才落盘，避免劣化；先写临时文件再 rename，规避占用/竞态
        if (targetSize < size) {
          const tmp = outFile + '.tmp-' + process.pid;
          await fs.promises.writeFile(tmp, buf);
          await fs.promises.rename(tmp, outFile);
          if (ext === '.png' && outFile !== file) converted++;
        } else {
          targetSize = size;
        }
      } else {
        const buf = await encoder.toBuffer();
        targetSize = buf.length;
      }
    } catch (e) {
      rows.push({ file: path.relative(IMG_DIR, file), size, est: size, w: meta.width, h: meta.height, ext, note: '写入失败 ' + e.message });
      after += size;
      continue;
    }
    after += Math.min(targetSize, size);
    rows.push({ file: path.relative(IMG_DIR, file), size, est: Math.min(targetSize, size), w: meta.width, h: meta.height, ext });
  }

  rows.sort((a, b) => b.size - a.size);
  console.log(`\n模式: ${MODE}  图片数: ${files.length}`);
  console.log(`当前总体积: ${fmtKB(before)}`);
  console.log(`预估/优化后: ${fmtKB(after)}  节省: ${fmtKB(before - after)} (${(100 * (before - after) / before).toFixed(1)}%)`);
  console.log('\nTOP 20 大图（当前 / 预估）:');
  rows.slice(0, 20).forEach(r => {
    console.log(`  ${fmtKB(r.size).padStart(11)} -> ${fmtKB(r.est).padStart(11)}  ${r.w}x${r.h}  ${r.file}`);
  });
  if (MODE === 'apply') console.log(`\nPNG 转 WebP 张数: ${converted}`);
})();
