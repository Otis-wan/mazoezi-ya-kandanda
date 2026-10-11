import { exportSPKI, generateKeyPair, SignJWT } from 'jose';
import { TokenError, TokenVerifier } from './token-verifier.js';

const issuer = 'tms-site';
const audience = 'training-api';
const now = () => Math.floor(Date.now() / 1000);

type SignKey = Parameters<SignJWT['sign']>[0];
type Options = {
  iss?: string;
  aud?: string;
  iat?: number;
  exp?: number;
  sub?: string | null;
  key?: SignKey;
};

async function setup() {
  const { publicKey, privateKey } = await generateKeyPair('ES256');
  const pem = await exportSPKI(publicKey);
  const verifier = await TokenVerifier.create({ publicKeyPem: pem, issuer, audience });

  async function sign(claims: Record<string, unknown> = {}, o: Options = {}) {
    const jwt = new SignJWT({ role: 2, teams: [10, 11], ...claims })
      .setProtectedHeader({ alg: 'ES256' })
      .setIssuer(o.iss ?? issuer)
      .setAudience(o.aud ?? audience)
      .setIssuedAt(o.iat ?? now())
      .setExpirationTime(o.exp ?? now() + 300);
    if (o.sub !== null) jwt.setSubject(o.sub ?? '42');
    return jwt.sign(o.key ?? privateKey);
  }

  return { verifier, sign, pem };
}

describe('TokenVerifier', () => {
  it('accepts a valid token', async () => {
    const { verifier, sign } = await setup();
    await expect(verifier.verify(await sign())).resolves.toEqual({
      userId: '42',
      roleId: 2,
      teamIds: ['10', '11'],
    });
  });

  it('drops repeated team ids', async () => {
    const { verifier, sign } = await setup();
    const out = await verifier.verify(await sign({ teams: [10, 10, 11] }));
    expect(out.teamIds).toEqual(['10', '11']);
  });

  it('rejects an expired token', async () => {
    const { verifier, sign } = await setup();
    const token = await sign({}, { iat: now() - 600, exp: now() - 60 });
    await expect(verifier.verify(token)).rejects.toBeInstanceOf(TokenError);
  });

  it('rejects a token older than 10 minutes, even if exp is far off', async () => {
    const { verifier, sign } = await setup();
    const token = await sign({}, { iat: now() - 1200, exp: now() + 300 });
    await expect(verifier.verify(token)).rejects.toBeInstanceOf(TokenError);
  });

  it('rejects the wrong issuer', async () => {
    const { verifier, sign } = await setup();
    await expect(verifier.verify(await sign({}, { iss: 'other' }))).rejects.toBeInstanceOf(TokenError);
  });

  it('rejects the wrong audience', async () => {
    const { verifier, sign } = await setup();
    await expect(verifier.verify(await sign({}, { aud: 'other' }))).rejects.toBeInstanceOf(TokenError);
  });

  it('rejects a token signed with another key', async () => {
    const { verifier, sign } = await setup();
    const other = await generateKeyPair('ES256');
    await expect(
      verifier.verify(await sign({}, { key: other.privateKey })),
    ).rejects.toBeInstanceOf(TokenError);
  });

  it('rejects an HS256 token signed with the public key as a secret', async () => {
    const { verifier, pem } = await setup();
    const token = await new SignJWT({ role: 1, teams: [] })
      .setProtectedHeader({ alg: 'HS256' })
      .setSubject('42')
      .setIssuer(issuer)
      .setAudience(audience)
      .setIssuedAt()
      .setExpirationTime('5m')
      .sign(new TextEncoder().encode(pem));
    await expect(verifier.verify(token)).rejects.toBeInstanceOf(TokenError);
  });

  it('rejects a token with no subject', async () => {
    const { verifier, sign } = await setup();
    await expect(verifier.verify(await sign({}, { sub: null }))).rejects.toBeInstanceOf(TokenError);
  });

  it('rejects a role that is not a number', async () => {
    const { verifier, sign } = await setup();
    await expect(verifier.verify(await sign({ role: '2' }))).rejects.toBeInstanceOf(TokenError);
  });

  it('rejects bad team ids', async () => {
    const { verifier, sign } = await setup();
    await expect(verifier.verify(await sign({ teams: ['10'] }))).rejects.toBeInstanceOf(TokenError);
    await expect(verifier.verify(await sign({ teams: 10 }))).rejects.toBeInstanceOf(TokenError);
  });
});