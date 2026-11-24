import express from 'express';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const isProd = process.env.NODE_ENV === 'production';
const portArgIdx = process.argv.indexOf('--port');
const portFromArg = portArgIdx !== -1 ? Number(process.argv[portArgIdx + 1]) : null;
const PORT = portFromArg || 3000;

function resolveUserscriptPath() {
  const candidates = isProd
    ? [
        path.resolve(__dirname, 'dist', 'ro_auto_pick.user.js'),
        path.resolve(__dirname, 'public', 'ro_auto_pick.user.js'),
      ]
    : [
        path.resolve(__dirname, 'public', 'ro_auto_pick.user.js'),
        path.resolve(__dirname, 'dist', 'ro_auto_pick.user.js'),
      ];
  return candidates.find((p) => fs.existsSync(p)) || candidates[0];
}

async function startServer() {
  const app = express();

  app.get(['/ro-auto-pick.user.js', '/ro_auto_pick.user.js'], (req, res) => {
    const filePath = resolveUserscriptPath();
    if (!fs.existsSync(filePath)) {
      res.status(404).type('text/plain; charset=utf-8').send('Userscript not found');
      return;
    }
    res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
    res.setHeader('Cache-Control', 'no-store');
    if (req.query.download === '1') {
      res.setHeader('Content-Disposition', 'attachment; filename="ro_auto_pick.user.js"');
    }
    res.sendFile(filePath);
  });

  if (!isProd) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.resolve(distPath, 'index.html'));
    });
  }

  app.listen(Number(PORT), '0.0.0.0', () => {
    console.log(`Server running at http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
