// Makes a login token for trying the API by hand. For your own computer only.
//
//   node scripts/dev-token.mjs <role> <id> [team ids, comma separated]
//
//   node scripts/dev-token.mjs admin 1
//   node scripts/dev-token.mjs manager 20 9001,9002
//   node scripts/dev-token.mjs player ana-1
//
// The first run makes a key pair in dev-keys/ and prints the line for .env.
import { existsSync, mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { exportPKCS8, exportSPKI, generateKeyPair, importPKCS8, SignJWT } from 'jose';

const ROLE_ID = { admin: 1, manager: 2, player: 5, superagent: 7 };
const dir = 'dev-keys';
const privatePath = `${dir}/private.pem`;

if (!existsSync(privatePath)) {
  mkdirSync(dir, { recursive: true });
  const { publicKey, privateKey } = await generateKeyPair('ES256', { extractable: true });
  const pub = await exportSPKI(publicKey);
  writeFileSync(privatePath, await exportPKCS8(privateKey));
  writeFileSync(`${dir}/public.pem`, pub);
  console.log('Made new keys in dev-keys/. Put this line in .env, then restart the API:\n');
  console.log(`AUTH_PUBLIC_KEY="${pub.trim().replace(/\n/g, '\\n')}"\n`);
}

const [, , roleName = 'admin', sub = '1', teams = ''] = process.argv;
const role = ROLE_ID[roleName];
if (!role) {
  console.error(`Role must be one of: ${Object.keys(ROLE_ID).join(', ')}`);
  process.exit(1);
}
const teamIds = teams ? teams.split(',').map(Number) : [];
if (teamIds.some((n) => !Number.isInteger(n) || n < 1)) {
  console.error('Team IDs must be whole numbers, like 9001,9002');
  process.exit(1);
}

const key = await importPKCS8(readFileSync(privatePath, 'utf8'), 'ES256');
const jwt = await new SignJWT({ role, teams: teamIds })
  .setProtectedHeader({ alg: 'ES256' })
  .setSubject(sub)
  .setIssuer(process.env.AUTH_ISSUER ?? 'tms-site')
  .setAudience(process.env.AUTH_AUDIENCE ?? 'training-api')
  .setIssuedAt()
  .setExpirationTime('9m')
  .sign(key);
console.log(jwt);
