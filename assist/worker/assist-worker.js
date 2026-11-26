/**
 * Cloudflare Worker 入口（薄封装）。
 * 平台无关逻辑见 ../core/assist-core.mjs；环境变量/secret 在 Cloudflare 侧配置。
 */
import { handleRequest } from '../core/assist-core.mjs';

export default {
  async fetch(request, env) {
    return handleRequest(request, env);
  }
};
