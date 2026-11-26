/* smoke: MedicalAssist 通用服务层降级与契约校验。运行：node scripts/_smoke-assist.js */
const path = require('path');
const ROOT = path.join(__dirname, '..');
require(path.join(ROOT, 'js', 'medical-assist.js'));
const MA = globalThis.MedicalAssist;

let pass = 0, fail = 0;
function check(name, cond) {
  if (cond) { pass++; console.log('  ✓ ' + name); }
  else { fail++; console.log('  ✗ ' + name); }
}

// 1. 默认未配置：关闭，不抛错
check('默认未配置 isConfigured=false', MA.isConfigured() === false);
MA.ask({ scene: 'tcm_formula_diff', context: {}, candidates: [] }).then(r => {
  check('未配置 ask 降级 unavailable', r.ok === false && r.reason === 'unavailable');

  // 2. 配置不可达端点：ping/ask 降级，不抛异常
  MA.configure({ endpoint: 'http://127.0.0.1:59999', enabled: true });
  check('配置后 isConfigured=true', MA.isConfigured() === true);
  return MA.isEnabled().then(ok => {
    check('不可达代理 isEnabled=false', ok === false);
    return MA.ask({ scene: 'tcm_formula_diff', context: { chief_complaint: 'x' }, candidates: [{ id: 'CN-070', name: '玉屏风散' }] });
  }).then(r => {
    check('不可达代理 ask 降级不抛错', r.ok === false && ['unavailable', 'timeout'].includes(r.reason));

    // 3. 非法 scene 白名单拦截
    return MA.ask({ scene: 'hacker_escape', context: {}, candidates: [] }).then(r2 => {
      check('非法 scene 返回 bad_scene', r2.ok === false && r2.reason === 'bad_scene');
      check('场景注册表含 8 个 scene', MA.scenes().length === 8);
      console.log(fail === 0 ? '\nALL PASS ✓' : '\nFAIL ' + fail);
      process.exit(fail === 0 ? 0 : 1);
    });
  });
});
