import {
  AngularNodeAppEngine,
  createNodeRequestHandler,
  isMainModule,
  writeResponseToNodeResponse
} from '@angular/ssr/node';
import express from 'express';
import { join } from 'node:path';
import { isEmailAllowed } from './server/access-control';
import { GET as expenses } from './server/api/expenses';
import { GET as operations } from './server/api/operations';
import { getChatGPTUser } from './server/auth';

const app = express();
app.disable('x-powered-by');
const angularApp = new AngularNodeAppEngine();

function webRequest(req: express.Request) {
  const headers = new Headers();
  for (const [key, value] of Object.entries(req.headers)) {
    if (value !== undefined) headers.set(key, Array.isArray(value) ? value.join(',') : value);
  }
  return new Request(new URL(req.originalUrl, 'http://localhost'), { headers });
}

app.get(['/api/operations', '/api/expenses'], async (req, res, next) => {
  try {
    const request = webRequest(req);
    const response = await (req.path === '/api/expenses' ? expenses(request) : operations(request));
    await writeResponseToNodeResponse(response, res);
  } catch (error) {
    next(error);
  }
});
app.use('/api', (_req, res) => {
  res.setHeader('Cache-Control', 'private, no-store');
  res.status(404).json({ error: 'Not found' });
});
app.use(
  express.static(join(import.meta.dirname, '../browser'), {
    maxAge: '1y',
    index: false,
    redirect: false
  })
);

app.use((req, res, next) => {
  res.setHeader('Cache-Control', 'private, no-store');
  // These endpoints are owned by the existing authentication proxy.
  if (['/signin-with-chatgpt', '/signout-with-chatgpt', '/callback'].includes(req.path)) {
    res.status(503).type('text').send('Authentication proxy is required.');
    return;
  }
  const user = getChatGPTUser(webRequest(req));
  if (!user) {
    res.redirect(
      307,
      `/signin-with-chatgpt?return_to=${encodeURIComponent(req.originalUrl.startsWith('//') ? '/' : req.originalUrl)}`
    );
    return;
  }
  if (!isEmailAllowed(user.email)) {
    res
      .status(403)
      .type('html')
      .send(
        '<!doctype html><html lang="ru"><meta charset="utf-8"><title>Нет доступа</title><h1>Нет доступа</h1><p>Аккаунт не добавлен в список разрешённых пользователей.</p><a href="/signout-with-chatgpt?return_to=/">Войти с другим аккаунтом</a></html>'
      );
    return;
  }
  if (!['/', '/operations', '/plan', '/accounts', '/dashboards'].includes(req.path)) {
    res.status(404).send('Not found');
    return;
  }
  angularApp
    .handle(req)
    .then((response) => (response ? writeResponseToNodeResponse(response, res) : next()))
    .catch(next);
});

if (isMainModule(import.meta.url) || process.env['pm_id']) {
  const port = Number(process.env['PORT'] || 4000);
  app.listen(port, process.env['HOST'] || '127.0.0.1', (error) => {
    if (error) throw error;
    console.log(`Angular SSR listening on port ${port}`);
  });
}
export const reqHandler = createNodeRequestHandler(app);
