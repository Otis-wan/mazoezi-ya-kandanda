import { generateKeyPairSync } from 'node:crypto';

const { publicKey, privateKey } = generateKeyPairSync('ec', {
  namedCurve: 'P-256',
});

Object.assign(process.env, {
  NODE_ENV: 'test',
  CORS_ORIGINS: 'https://tms.tisini.africa',
  TRUST_PROXY: '0',
  DOCS_ENABLED: 'true',
  // Tests do not run the repeat job. They call the service directly.
  REDIS_URL: '',
  AUTH_ISSUER: 'test-issuer',
  AUTH_AUDIENCE: 'test-audience',
  AUTH_PUBLIC_KEY: publicKey.export({ type: 'spki', format: 'pem' }).toString(),
  AUTH_TEST_PRIVATE_KEY: privateKey
    .export({ type: 'pkcs8', format: 'pem' })
    .toString(),
});
