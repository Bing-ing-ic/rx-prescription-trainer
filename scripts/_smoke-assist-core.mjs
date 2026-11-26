/* smoke: 代理核心模块（平台无关）契约与降级校验。运行：node scripts/_smoke-assist-core.mjs */
import { SCENES, filterRelated, parseModelText, handleRequest } from '../assist/core/assist-core.mjs';

let pass = 0, fail = 0;
function check(name, cond) {
  if (cond) { pass++; console.log('  ✓ ' + name); }
  else { fail++; console.log('  ✗ ' + name); }
}

const ENV_EMPTY = {};
const ENV_LIVE = {
  ASSIST_LLM_BASE: 'https://open.bigmodel.cn/api/paas/v4',
  ASSIST_LLM_MODEL: 'glm-4-flash',
  ASSIST_LLM_KEY: 'sk-placeholder'
};

// 1. 场景注册表 8 个，键齐全
const EXPECTED = ['rx_diagnosis', 'rx_review', 'tcm_zheng', 'tcm_formula_diff', 'acup_point', 'anat_explain', 'mistake_review', 'quickref_explain'];
check('核心注册表含 8 个 scene', Object.keys(SCENES).length === 8);
check('场景键与前端契约一致', EXPECTED.every(s => SCENES[s]));

// 2. 白名单过滤：只保留候选内名称
const cand = [{ name: '玉屏风散' }, { name: '桂枝汤' }];
check('related 白名单过滤', JSON.stringify(filterRelated(['玉屏风散', '小柴胡汤'], cand)) === JSON.stringify(['玉屏风散']));

// 3. JSON 解析：围栏包裹 / 纯文本兜底
const wrapped = parseModelText('```json\n{"summary": "s", "points": ["a", "b"], "related": ["桂枝汤"]}\n```');
check('围栏 JSON 解析', wrapped.summary === 's' && wrapped.points.length === 2 && wrapped.related[0] === '桂枝汤');
const plain = parseModelText('直接给一段讲解，无 JSON');
check('纯文本兜底 summary', plain.summary === '直接给一段讲解，无 JSON' && plain.points.length === 0);

// 4. healthz：无配置 configured=false
const hz = await handleRequest(new Request('http://x/healthz'), ENV_EMPTY);
const hzJson = await hz.json();
check('healthz 未配置 configured=false', hzJson.ok === true && hzJson.configured === false);

// 5. 非法 scene → bad_scene
const bad = await handleRequest(new Request('http://x/assist', {
  method: 'POST',
  body: JSON.stringify({ scene: 'hacker_escape', context: {}, candidates: [] })
}), ENV_LIVE);
const badJson = await bad.json();
check('非法 scene 返回 bad_scene', badJson.ok === false && badJson.reason === 'bad_scene');

// 6. 缺环境变量 → unavailable 降级
const noEnv = await handleRequest(new Request('http://x/assist', {
  method: 'POST',
  body: JSON.stringify({ scene: 'rx_review', context: {}, candidates: [] })
}), ENV_EMPTY);
const noEnvJson = await noEnv.json();
check('未配置代理降级 unavailable', noEnvJson.ok === false && noEnvJson.reason === 'unavailable');

// 7. 方法/路径错误 → bad_scene
const g404 = await handleRequest(new Request('http://x/other'), ENV_LIVE);
const g404Json = await g404.json();
check('错误路径 bad_scene', g404Json.ok === false && g404Json.reason === 'bad_scene');

console.log(fail === 0 ? '\nALL PASS ✓' : '\nFAIL ' + fail);
process.exit(fail === 0 ? 0 : 1);
