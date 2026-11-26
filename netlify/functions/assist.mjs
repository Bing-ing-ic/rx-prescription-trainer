/**
 * Netlify Function 入口（备选托管，薄封装）。
 * 平台无关逻辑见 ../../assist/core/assist-core.mjs。
 * 环境变量在 Netlify 站点配置中设置（ASSIST_LLM_KEY 为 secret，不入库）。
 *
 * 线上路径：/assist（POST）、/healthz（GET）。
 */
import { handleRequest } from '../../assist/core/assist-core.mjs';

export default async (request) => {
  // Netlify Node 运行时把站点环境变量注入 process.env
  return handleRequest(request, process.env);
};

export const config = {
  path: ['/assist', '/healthz'],
  method: ['GET', 'POST', 'OPTIONS']
};
