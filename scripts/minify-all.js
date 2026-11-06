#!/usr/bin/env node
/**
 * 统一 min 压缩脚本：4个模块P0修复后运行
 * 用法：node scripts/minify-all.js
 * 对 js/ 下所有 .js（除 .min.js/.bak）跑 terser，输出同名 .min.js
 */
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const JS_DIR = path.resolve(__dirname, '..', 'js');
const files = fs.readdirSync(JS_DIR)
  .filter(f => f.endsWith('.js') && !f.endsWith('.min.js') && !f.includes('.bak'));

console.log('待压缩文件:');
files.forEach(f => console.log(' -', f));

for (const f of files) {
  const src = path.join(JS_DIR, f);
  const out = path.join(JS_DIR, f.replace(/\.js$/, '.min.js'));
  console.log(`\n压缩 ${f} -> ${path.basename(out)}`);
  try {
    execSync(`npx --no-install terser "${src}" -c -m -o "${out}"`, { stdio: 'inherit' });
    const sz = fs.statSync(out).size;
    console.log(`  ✓ ${(sz/1024).toFixed(1)} KB`);
  } catch (e) {
    console.error(`  ✗ 失败:`, e.message);
    process.exit(1);
  }
}
console.log('\n全部压缩完成');
