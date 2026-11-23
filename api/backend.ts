import type { IncomingMessage, ServerResponse } from 'node:http';
import { createApp } from '../server/app.ts';

const app = createApp();

export default function handler(req: IncomingMessage, res: ServerResponse) {
  const url = new URL(req.url || '/', 'http://localhost');
  const route = url.searchParams.get('__makefun_path');
  url.searchParams.delete('__makefun_path');
  if (url.pathname === '/api/backend' && route !== null) {
    url.pathname = `/api/${route}`;
  }
  req.url = url.pathname + url.search;
  return app(req, res);
}
