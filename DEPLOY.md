# Deploy guide

You need: a Postgres 16 database, a place to run one container, HTTPS in front of it (a reverse proxy or your host's load balancer), and optionally Redis.

## 1. Settings (production)

| Name | Value |
|---|---|
| `NODE_ENV` | `production` |
| `DATABASE_URL` | Your own user and a long random password. The sample one is refused |
| `AUTH_PUBLIC_KEY` | Public key from the main site |
| `AUTH_ISSUER`, `AUTH_AUDIENCE` | Same as the main site signs |
| `CORS_ORIGINS` | `https://` sites only. Leave empty if only your server calls the API |
| `DOCS_ENABLED` | `false` (true is refused) |
| `TRUST_PROXY` | Number of proxies in front (usually 1). Wrong values break per-address limits |
| `REDIS_URL` | Set it to turn on repeat assignments |
| `RATE_LIMIT_*` | Defaults are 600 per address, 120 per user per route, 30 writes |

Keep settings in the host's secret store, not in the image or in git.

## 2. Build and migrate

    docker build -t football-training-api .
    docker build --target build -t football-training-tools .
    docker run --rm -e DATABASE_URL=... football-training-tools npx prisma migrate deploy
    docker run --rm -e DATABASE_URL=... football-training-tools npx prisma db seed

Run migrate on each release, before the new container starts. The seed adds or updates the 111 drills. It does not touch routines or assignments.

## 3. Run

    docker run -d --name training-api -p 127.0.0.1:3000:3000 --env-file prod.env football-training-api

The container runs as a non-root user and has a health check on `/health/live`. Point your proxy's uptime check at `/health/ready` (it tests the database).

Run one container first. For more, put them behind the proxy. The repeat job is safe with several (a unique key blocks duplicates).

## 4. Lock it down

- Allow the database port only from the API host. Never open Postgres or Redis to the internet.
- Open the API port only to the proxy, and have the proxy add HTTPS (TLS 1.2 or later).
- If only the main site's server calls the API, also allow only that server's address at the firewall.
- Use a database user that cannot create or drop databases. Migrations need table rights only.
- Turn on database backups. Test one restore.
- Run `npm audit --omit=dev` in CI each week (the CI file does this on each push).

## 5. Check it works

    curl -i https://api.example.org/health/live           # 200
    curl -i https://api.example.org/v1/drills              # 401, no token
    curl -i https://api.example.org/docs                   # 404, docs off

Then call `/v1/me` with a real token from the main site.

## 6. Update

Pull, build, migrate, restart. Roll back by running the old image. A migration that drops data is never rolled back by an image swap, so back up before each release.
