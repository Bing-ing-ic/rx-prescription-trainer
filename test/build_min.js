// 轻量构建：把 js/app.js -> js/app.min.js，css/rx.css -> css/rx.min.css
// 用法: node test/build_min.js
const fs = require('fs');
const path = require('path');
const T = require('terser');

const root = path.resolve(__dirname, '..');

async function main() {
  // 1) JS: app.js -> app.min.js
  const jsSrc = fs.readFileSync(path.join(root, 'js/app.js'), 'utf8');
  const jsResult = await T.minify(jsSrc, {
    compress: { dead_code: true, drop_console: false, drop_debugger: true },
    mangle: false,            // 不破坏局部变量名（项目内 IIFE 闭包，安全但保守）
    format: { comments: false, ascii_only: false }
  });
  if (jsResult.error) throw jsResult.error;
  fs.writeFileSync(path.join(root, 'js/app.min.js'), jsResult.code, 'utf8');
  console.log('JS:', jsSrc.length, '->', jsResult.code.length);

  // 2) CSS: rx.css -> rx.min.css（简单去注释+压缩空白，不引入 cssnano 依赖）
  let cssSrc = fs.readFileSync(path.join(root, 'css/rx.css'), 'utf8');
  // 去掉 /* ... */ 注释（CSS 不嵌套）
  cssSrc = cssSrc.replace(/\/\*[\s\S]*?\*\//g, '');
  // 压缩空白
  cssSrc = cssSrc.replace(/\s+/g, ' ');
  // 去掉括号周围、冒号周围、分号周围多余空格
  cssSrc = cssSrc.replace(/\s*([{}:;,>])\s*/g, '$1');
  cssSrc = cssSrc.replace(/;}/g, '}');
  cssSrc = cssSrc.trim();
  fs.writeFileSync(path.join(root, 'css/rx.min.css'), cssSrc, 'utf8');
  console.log('CSS:', fs.statSync(path.join(root, 'css/rx.css')).size, '->', cssSrc.length);
}

main().catch(e => { console.error(e); process.exit(1); });
