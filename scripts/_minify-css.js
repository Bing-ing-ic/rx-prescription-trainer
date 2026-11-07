const fs = require('fs');
let css = fs.readFileSync('css/rx.css', 'utf8');
css = css.replace(/\/\*[\s\S]*?\*\//g, '');
css = css.replace(/\s+/g, ' ').replace(/\s*([{}:;,>])\s*/g, '$1').replace(/;}/g, '}');
fs.writeFileSync('css/rx.min.css', css, 'utf8');
console.log('rx.min.css size:', (css.length / 1024).toFixed(1) + 'KB');
