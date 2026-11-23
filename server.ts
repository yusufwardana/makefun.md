import 'dotenv/config';
import express from 'express';
import path from 'node:path';
import { createServer as createViteServer } from 'vite';
import { bindHost, createApp } from './server/app.ts';

const PORT = Number(process.env.PORT || 3000);

async function startServer() {
  const app = createApp();

  // Vite or Static Frontend Mounting
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  const listener = app.listen(PORT, bindHost, () => {
    const address = listener.address();
    const port = address && typeof address === 'object' ? address.port : PORT;
    console.log(`COSMICLABS Make.fun Command Center listening on http://${bindHost}:${port}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
