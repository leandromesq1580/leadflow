import test from 'node:test';
import assert from 'node:assert/strict';
import config from '../next.config';

test('Academy resolves relative assets without changing global trailing-slash or auth configuration', async () => {
  const redirects = await config.redirects?.();
  assert.deepEqual(redirects?.find(r => r.source === '/academy'), {
    source: '/academy', destination: '/academy/index.html', permanent: false,
  });
  assert.equal(config.trailingSlash, undefined);
  assert.equal(config.skipTrailingSlashRedirect, undefined);
  assert.deepEqual(await config.rewrites?.(), [
    { source: '/', destination: '/nova/index.html' },
    { source: '/nova', destination: '/nova/index.html' },
    { source: '/nova/en', destination: '/nova/en/index.html' },
    { source: '/nova/es', destination: '/nova/es/index.html' },
  ]);
});
