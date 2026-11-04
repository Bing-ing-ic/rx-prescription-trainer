const fs = require('fs');
const h = fs.readFileSync('index.html', 'utf8');
const opens = (h.match(/<section/g) || []).length;
const closes = (h.match(/<\/section>/g) || []).length;
console.log('section open:', opens, 'close:', closes);
['view-tcm-home','view-tcm-case','view-tcm-rx','view-tcm-report',
 'view-acup-home','view-acup-case','view-acup-rx','view-acup-report'].forEach(id => {
  console.log(id, h.includes('id="' + id + '"') ? 'OK' : 'MISSING');
});
// check script tags
['js/tcm-engine.js','js/acup-engine.js','js/tcm-app.js','js/acup-app.js','js/module-views.js'].forEach(s => {
  console.log(s, h.includes(s) ? 'OK' : 'MISSING');
});
