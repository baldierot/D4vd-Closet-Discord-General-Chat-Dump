import { defineConfig } from 'vitest/config';
import { createReadStream, statSync } from 'node:fs';
import { join } from 'node:path';

function serveRawData() {
  return {
    name: 'serve-raw-data',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const url = req.url || '';
        if (!url.startsWith('/days/') && !url.startsWith('/days-search-indexes/')) {
          return next();
        }
        const filePath = join(server.config.root, url);
        try {
          const stat = statSync(filePath);
          const contentType = url.endsWith('.json') ? 'application/json' : 'text/html';
          res.writeHead(200, {
            'Content-Type': contentType + '; charset=utf-8',
            'Content-Length': stat.size,
          });
          createReadStream(filePath).pipe(res);
        } catch {
          res.writeHead(404);
          res.end('Not found');
        }
      });
    },
  };
}

export default defineConfig({
  plugins: [serveRawData()],
  optimizeDeps: {
    entries: ['index.html'],
  },
  server: {
    watch: {
      ignored: ['**/days/**', '**/days-search-indexes/**'],
    },
  },
  test: {
    environment: 'happy-dom',
  },
});
