// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Kalm contributors.
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const channelSection = require('../test/fixtures/channel-section.json');
const nesgabri = require('../test/fixtures/nesgabri.json');
const root = path.resolve(__dirname, '..');
const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://127.0.0.1');
  if (['/popup-preview', '/options-preview'].includes(url.pathname)) {
    const file = url.pathname === '/popup-preview' ? 'popup.html' : 'options.html';
    const html = fs
      .readFileSync(path.join(root, 'src/ui', file), 'utf8')
      .replace('<head>', '<head><base href="/src/ui/"><script src="/demo/ui-adapter.js"></script>');
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
    res.end(html);
    return;
  }
  if (url.pathname === '/youtubei/v1/browse') {
    let text = '';
    req.on('data', (chunk) => {
      text += chunk;
      if (text.length > 8192) req.destroy();
    });
    req.on('end', () => {
      try {
        const input = JSON.parse(text);
        if (input.browseId === nesgabri.metadata.channelMetadataRenderer.externalId) {
          setTimeout(() => {
            res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
            res.end(JSON.stringify(nesgabri));
          }, 180);
          return;
        }
        if (input.browseId === channelSection.metadata.channelMetadataRenderer.externalId) {
          setTimeout(() => {
            res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
            res.end(JSON.stringify(channelSection));
          }, 250);
          return;
        }
        const letter = input.browseId?.slice(2, 3) || input.continuation?.slice(-1);
        const id = 'UC' + letter.repeat(22);
        let data;
        if (letter === 'd') {
          setTimeout(() => {
            res.writeHead(503);
            res.end();
          }, 100);
          return;
        }
        if (input.continuation) {
          const urls =
            letter === 'c' ? ['https://example.org', 'https://example.blogspot.com/post'] : [];
          data = {
            onResponseReceivedEndpoints: [
              {
                appendContinuationItemsAction: {
                  continuationItems: [
                    {
                      aboutChannelRenderer: {
                        metadata: {
                          aboutChannelViewModel: {
                            channelId: id,
                            description: 'A normal description',
                            canonicalChannelUrl: `https://www.youtube.com/channel/${id}`,
                            links: urls.map((url) => ({
                              channelExternalLinkViewModel: { link: { content: url } },
                            })),
                          },
                        },
                      },
                    },
                  ],
                },
              },
            ],
          };
        } else {
          data = {
            metadata: {
              channelMetadataRenderer: { externalId: id, description: 'A normal description' },
            },
            header: {
              pageHeaderRenderer: {
                content: {
                  pageHeaderViewModel: {
                    attribution: {
                      attributionViewModel: {
                        text: { content: letter === 'b' ? 'tinyurl.com/test' : 'example.org' },
                      },
                    },
                    description: {
                      descriptionPreviewViewModel: {
                        rendererContext: {
                          commandContext: {
                            onTap: { continuationCommand: { token: 'ABOUT_' + letter } },
                          },
                        },
                      },
                    },
                  },
                },
              },
            },
          };
        }
        setTimeout(
          () => {
            res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
            res.end(JSON.stringify(data));
          },
          input.continuation ? 350 : 150,
        );
      } catch {
        res.writeHead(400);
        res.end();
      }
    });
    return;
  }

  let file = url.pathname.slice(1);
  if (file.startsWith('kalm/')) file = 'src/' + file.slice(5);
  if (!file) file = 'demo/lifecycle-test.html';
  const full = path.resolve(root, file);
  const allowed = ['src', 'demo', 'test/fixtures', 'dist'].some((dir) =>
    full.startsWith(path.join(root, dir) + path.sep),
  );
  if (!allowed || !fs.existsSync(full) || !fs.statSync(full).isFile()) {
    res.writeHead(404);
    res.end();
    return;
  }
  const types = {
    '.html': 'text/html; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.mjs': 'text/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.json': 'application/json',
    '.svg': 'image/svg+xml',
    '.png': 'image/png',
    '.woff2': 'font/woff2',
  };
  res.writeHead(200, {
    'Content-Type': types[path.extname(full)] || 'text/plain',
    'Cache-Control': 'no-store',
  });
  fs.createReadStream(full).pipe(res);
});
server.listen(8770, '127.0.0.1', () =>
  console.log('Kalm local checks: http://127.0.0.1:8770/options-preview?section=comments&tab=7'),
);
