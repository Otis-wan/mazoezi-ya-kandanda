# Football Training API

Drills, routines, assignments, hand-ins, reviews and progress for football players aged 13 to 19, from academy to pro. The main site (tms.tisini.africa) calls this API. Players never call it directly.

**Stack:** Node 22, NestJS 12, Prisma 7, Postgres 16. Redis is optional (it repeats daily and weekly assignments).

## What it does

1. **Drill library.** 111 drills in 11 categories, each with coaching points, a 1/3/5 scoring rubric and FA heading safety rules.
2. **Routines.** A coach puts drills in order. The API warns when a routine breaks the FA heading limits.
3. **Assignments.** A coach gives a routine to players, once or on a daily or weekly repeat.
4. **Hand-in and review.** The player starts the work and hands it in with self scores. The coach reviews it with coach scores and notes.
5. **Progress.** Scores by category and by week or month, weakest criteria first, with the gap between self score and coach score.

## Quick start

    cp .env.example .env            # then set AUTH_PUBLIC_KEY (see "Sign-in" below)
    docker compose up -d            # Postgres on port 5433, Redis on 6379
    npm install
    npm run db:deploy               # create the tables
    npm run db:seed                 # load the 111 drills
    npm run start:dev               # API on :3000, docs on /docs (dev only)
    npm run check                   # types, lint, unit tests, e2e tests, build

The tests use the real database, so keep Postgres running when you run them.

## Sign-in

The main site holds a private ES256 key. This API holds only the public key (`AUTH_PUBLIC_KEY`). For each call, the main site signs a short token and sends it as `Authorization: Bearer <token>`.

| Claim | Value |
|---|---|
| `alg` header | `ES256`. Nothing else is accepted |
| `iss` | Must equal `AUTH_ISSUER` (default `tms-site`) |
| `aud` | Must equal `AUTH_AUDIENCE` (default `training-api`) |
| `sub` | The user's ID as text, up to 64 characters. For a player, use the same ID you send in `PUT /v1/players/:externalId` |
| `role` | A whole number: 1 admin, 7 super agent, 2 team manager, 5 player. Any other role gets 403 |
| `teams` | A list of whole numbers: the team IDs the user may act for. Use `[]` for admins and players |
| `iat`, `exp` | Required. A token older than 10 minutes is refused, whatever its `exp` |

Node example (jose):

    const jwt = await new SignJWT({ role: 2, teams: [10, 11] })
      .setProtectedHeader({ alg: 'ES256' })
      .setSubject(String(user.id))
      .setIssuer('tms-site').setAudience('training-api')
      .setIssuedAt().setExpirationTime('5m')
      .sign(privateKey);

Make a new token for each call or page load. Do not store tokens. Call from your server, not from browsers.

**Make a key pair:**

    openssl ecparam -name prime256v1 -genkey -noout -out private.pem
    openssl ec -in private.pem -pubout -out public.pem

Put the contents of `public.pem` in `AUTH_PUBLIC_KEY`, with each new line written as `\n`. Keep `private.pem` on the main site only. Never commit `.pem` files.

**Change keys with no downtime:**

1. Make a new pair. Set `AUTH_PUBLIC_KEY_NEXT` to the new public key. Restart the API.
2. Switch the main site to sign with the new private key.
3. After 10 minutes, move the new key into `AUTH_PUBLIC_KEY` and empty `AUTH_PUBLIC_KEY_NEXT`.

## Who can do what

| Role | Reach |
|---|---|
| Admin, super agent | Everything |
| Team manager | Own teams' players and assignments, own routines |
| Player | Own assignments, own progress, the drill library |

A resource you may not see answers 404, not 403, so IDs leak nothing.

## Endpoints

All paths are under `/v1`, except the health checks. Run the API in dev and open `/docs` for full request and reply shapes.

| Method and path | Roles | Purpose |
|---|---|---|
| GET `/me` | staff | Who the token says you are |
| GET `/drills`, `/drills/:id` | all | Browse the library. Filters: `category`, `ageBand`, `position`, `format`, `intensity`, `q` |
| PUT `/drills/:id/sample-video` | admin, super agent | Set or clear a sample clip link. Body: `{ "url": "https://..." }` or `{ "url": null }`. Only `https` links |
| POST/GET `/routines`, GET/PATCH/DELETE `/routines/:id` | staff | Ordered drill lists. Replies carry `warnings` (heading limits) |
| PUT `/teams/:externalId`, PUT `/players/:externalId` | admin, super agent | The main site pushes teams and players here |
| POST `/assignments` | staff | Give a routine to up to 100 players. May repeat daily or weekly |
| GET `/assignments`, GET `/assignments/:id` | staff; all for `:id` | List and read |
| GET `/assignments/mine` | player | My work |
| PATCH `/assignments/:id`, POST `/assignments/:id/cancel` | staff | Change the due date or note, or cancel |
| POST `/assignments/:id/start` | player | Start the work |
| PUT `/assignments/:id/submission` | player | Hand in, with self scores |
| PUT `/assignments/:id/review` | staff | Coach scores and notes |
| GET `/players/:id/progress`, GET `/teams/:id/progress` | see roles | Scores over time |
| GET `/health/live`, `/health/ready` | public | Uptime checks (no `/v1`) |

An assignment moves through `pending`, `in_progress`, `submitted`, `reviewed`, or `cancelled`. Scores run from 1 to 5. A score must name a drill in the routine and a criterion in that drill's rubric, spelled exactly.

## The drill library

The file `prisma/data/football_drill_library.json` is the source of truth. The seed loads it into the database. The CSV beside it is made from it for coaches to read.

- **IDs** are two letters and three digits: `bm` ball mastery, `pa` passing, `dr` dribbling, `sh` shooting, `he` heading, `de` defending, `ta` tactical, `gk` goalkeeping, `sp` set pieces, `ph` physical, `ps` psychological.
- **Age bands:** 13-14, 15-16, 17-19.
- **Rubric:** each criterion has text in the form `1 = ...; 3 = ...; 5 = ...` (1 emerging, 3 consistent, 5 excellent). Where a drill has a count (for example "5 or 6 of 10"), a coach can score it by watching.
- **Do not rename a criterion** once players have scores. Scores are stored under the criterion name.
- **Heading follows the FA youth guidance:** no heading in training under U12. At U12 and U13, at most 5 headers per player per session. From U14, at most 10. One heading session a week.

To change the library:

    # 1. Edit prisma/data/football_drill_library.json
    npm run drills:csv                       # rebuild the CSV
    npx vitest run prisma                    # checks IDs, rubric levels, and that the CSV is current
    npm run db:seed                          # update the database (safe to repeat)

## Try it in a browser

`test-ui/index.html` is a single page that acts as the main site. It has a coach view, a player view and a drill browser. It is for development only. Do not deploy it.

1. Make a PKCS8 copy of your dev private key: `openssl pkcs8 -topk8 -nocrypt -in private.pem -out dev-private-pkcs8.pem`
2. Set `CORS_ORIGINS=https://tms.tisini.africa,http://localhost:8080` in `.env` and restart the API.
3. Serve the page: `python3 -m http.server 8080 --directory test-ui`
4. Open `http://localhost:8080` (not `0.0.0.0`). Open "Connection and identity", set the API to `http://localhost:3000`, and paste the contents of `dev-private-pkcs8.pem`. It starts with `-----BEGIN PRIVATE KEY-----`. The page keeps it for that tab only.
5. On the Setup tab, press the button that creates team 10 and players 101 to 104. Then switch between admin (ID 1), coach (ID 900, team 10) and player (ID 101).

## Settings

Set these in `.env` (dev) or in your host's secret store (production). Start-up checks every value and stops with a clear message if one is wrong.

| Name | Meaning | Default |
|---|---|---|
| `NODE_ENV` | `development`, `test` or `production` | `development` |
| `PORT` | API port | `3000` |
| `DATABASE_URL` | Postgres address | none, required |
| `AUTH_PUBLIC_KEY` | Public key (PEM) of the main site | none, required |
| `AUTH_PUBLIC_KEY_NEXT` | Second key, only while changing keys | empty |
| `AUTH_ISSUER`, `AUTH_AUDIENCE` | Token `iss` and `aud` | `tms-site`, `training-api` |
| `CORS_ORIGINS` | Sites allowed to call from a browser, comma separated | empty |
| `TRUST_PROXY` | Number of proxies in front of the API | `0` |
| `DOCS_ENABLED` | Show `/docs` (refused in production) | `false` |
| `RATE_LIMIT_PER_MINUTE` | Per address | `600` |
| `RATE_LIMIT_USER_PER_MINUTE` | Per user per route | `120` |
| `RATE_LIMIT_WRITE_PER_MINUTE` | Per user, for POST, PUT, PATCH, DELETE | `30` |
| `REDIS_URL` | Turns on repeat assignments | empty |

## Commands

| Command | What it does |
|---|---|
| `npm run start:dev` | Run with reload |
| `npm run check` | Everything below, in order. Run before you commit |
| `npm run typecheck`, `lint`, `test`, `test:e2e`, `build` | The steps of `check` |
| `npm run unused` | Find unused files, exports and packages (knip) |
| `npm run db:migrate` | Make a new migration in dev |
| `npm run db:deploy` | Apply migrations (production) |
| `npm run db:seed` | Load or update the drills |
| `npm run drills:csv` | Rebuild the drill CSV |

## How it fits together

Each request passes four guards, in this order: the address limit, sign-in (token check), the per-user limit, then the role check. A route with no `@Roles` answers 403, so a new route is closed until you open it. A test lists every route and tries every role.

    src/
      auth/          token check, roles, the rules for who may see what (access.ts)
      drills/        read the library; admin sets sample clip links
      routines/      ordered drill lists, heading warnings
      people/        the main site pushes teams and players
      assignments/   assign, start, hand in, review (work.service.ts)
      progress/      score averages and trends
      recurrence/    the daily and weekly repeat job (needs Redis)
      common/        paging, errors, request IDs, rate limits
      config/        settings check
      health/        uptime checks
      prisma/        database connection
    prisma/          schema, migrations, seed, and data/ (the drill library)
    test/            end-to-end tests
    test-ui/         the browser test page (dev only)
    scripts/         dev-token.mjs makes test tokens; collect-for-claude.sh checks files and bundles source

Data: a **Team** has **Players**. A **Routine** has ordered **Drills**. An **Assignment** links one routine to one player and may have one **Submission**, one **Review** and many **Score** entries (one per drill, criterion and source: self or coach). Teams and players are copies of the main site's records, keyed by its IDs (`externalId`).

Video files are not stored here. The API keeps a playback ID from your video service, and a link to a sample clip per drill.

## Security

- Tokens: ES256 only, issuer and audience checked, at most 10 minutes old.
- Default deny: a route with no `@Roles` answers 403.
- Row rules in the service layer: team managers see their teams, players see themselves.
- Limits: per address, per user per route, and tighter for writes. A 429 carries `Retry-After`.
- Input: unknown fields refused, 100 kb body cap, ID formats checked, SQL always uses parameters.
- Replies: `Cache-Control: no-store`, Helmet headers, no stack traces, a request ID on every reply and log line.
- Logs: 401, 403 and 429 are logged with request ID, user and address. Tokens are never logged.
- Start-up refuses unsafe production settings: docs on, `*` or non-https origins, the sample database password.
- Packages: see `overrides` in `package.json`. Remaining `npm audit` items are in dev tools only.

Report a security problem to the project owner directly, not in a public issue.

## Problems

| You see | Do this |
|---|---|
| `ECONNREFUSED` in tests or logs | `docker compose up -d`, then `pg_isready -h localhost -p 5433` |
| 401 on every call | The public key in `.env` does not match the key that signs. Restart after you change `.env` |
| "Failed to fetch" in the test page | The page origin is not in `CORS_ORIGINS`, or you opened `0.0.0.0`. Use `http://localhost:8080` |
| Test page says the key is wrong | It needs the PKCS8 private key (`BEGIN PRIVATE KEY`), not the public key or the `EC PRIVATE KEY` file |
| `npm run check` fails after a library edit | Run `npm run drills:csv`, then `npm run db:seed` |

## Deploy

See `DEPLOY.md`.
