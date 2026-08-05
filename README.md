# QR-Bite

**QR Code Based Restaurant Order & Feedback Management System**

A diner scans the QR code on their table, browses the menu with live dish ratings,
orders from their own phone, and rates what they ate once it arrives. Orders land on
the kitchen monitor in real time. Names and phone numbers are captured at checkout so
the restaurant can send WhatsApp order confirmations, festival greetings and offers
later.

Built with React, Node.js, Express, MongoDB, Socket.io, JWT, QR code generation and
the WhatsApp Business API.

---

## Quick start

```bash
git clone <repo> && cd qr-bite
npm run install:all

cp server/.env.example server/.env     # then edit it — see "Configuration"
npm run seed                           # demo restaurant, 8 tables, 17 dishes, 2 logins
npm run dev                            # API on :5000, client on :5173
```

Open <http://localhost:5173/staff> and sign in as `admin` / `Admin@123`.

The seed prints scan-free links (`http://localhost:5173/t/<code>`) that open a table's
menu exactly as scanning its QR code would — handy when you are testing on a laptop.

**Requirements:** Node.js ≥ 18.17 and a MongoDB server (local `mongod`, or an Atlas
connection string).

### Testing on a real phone

The QR codes encode `CLIENT_URL`, so `localhost` produces codes only the host machine
can open. Set `CLIENT_URL` to your machine's LAN address, add it to `CORS_ORIGINS`,
restart, and regenerate the codes from **Tables & QR**:

```env
CLIENT_URL=http://192.168.1.20:5173
CORS_ORIGINS=http://192.168.1.20:5173
```

---

## Layout

```
qr-bite/
├── server/                     Express API, Socket.io, WhatsApp, MongoDB
│   ├── src/
│   │   ├── config/             env parsing, database connection
│   │   ├── models/             the 9 Mongoose models from the ER diagram
│   │   ├── controllers/        request handling, one file per resource
│   │   ├── routes/             route tables and per-route auth
│   │   ├── services/           order pricing, ratings, QR, WhatsApp providers
│   │   ├── middleware/         auth, zod validation, rate limits, errors
│   │   ├── realtime/io.js      Socket.io rooms and events
│   │   └── seed/seed.js        demo data
│   └── tests/api.test.js       end-to-end suite mirroring TC1–TC14
└── client/                     one Vite bundle, two apps
    └── src/
        ├── customer/           the diner's menu, cart, tracking and rating
        ├── staff/              the dashboard (live orders, menu, tables, reports)
        ├── components/ui.jsx   toasts, modal, stars, loading/empty states
        └── lib/                API wrapper, socket, formatting
```

Both apps ship in one bundle, split by route: `/t/:code` is the diner's menu, `/order`
tracks the order they just placed, and `/staff/*` is the dashboard behind a login.

---

## Configuration

Everything lives in `server/.env` (see `server/.env.example` for the annotated list).
The values worth knowing:

| Variable | Purpose |
| --- | --- |
| `MONGODB_URI` | Database connection string. |
| `CLIENT_URL` | Public address of the React app — **this is what QR codes encode**. |
| `CORS_ORIGINS` | Comma-separated origins allowed to call the API and open sockets. |
| `JWT_SECRET` | Signs both staff and customer tokens. Use a long random string. |
| `DATA_ENCRYPTION_KEY` | AES-256-GCM key for customer names and phone numbers at rest. Set it **once, before seeding** — changing it makes existing customer records unreadable. |
| `WHATSAPP_PROVIDER` | `mock`, `meta` or `twilio`. |

### WhatsApp

`mock` is the default: messages are rendered, persisted and logged, but never sent.
The dashboard's message log looks and behaves identically, so the whole feature can be
demonstrated without a WhatsApp Business account.

For real delivery, set the provider to `meta` (WhatsApp Cloud API) or `twilio` and fill
in the matching credentials. Note that WhatsApp only allows free-form text inside the
24-hour customer-service window — promotional sends outside it need an approved
template, which is why `META_TEMPLATE_*` exists.

---

## Commands

Run from the repository root:

| Command | Does |
| --- | --- |
| `npm run install:all` | Install both workspaces. |
| `npm run dev` | API and Vite dev server together. |
| `npm run dev:server` / `npm run dev:client` | One at a time. |
| `npm run seed` | Add demo data, leaving existing records alone. |
| `npm run seed:reset --workspace server` | Wipe the collections first, then seed. |
| `npm run refresh:qr` | Redraw every table's stored QR image against the current `CLIENT_URL`, keeping the table codes. Run this after moving the site to a new address. |
| `npm test` | Jest suite (spins up its own in-memory MongoDB). |
| `npm run build` | Build the client into `client/dist`. |
| `npm start` | Serve the API — and `client/dist`, if built — on one port. |

For a single-port deployment, run `npm run build` then `npm start`: the server serves
the built client itself, so the diner's phone reaches the site and the API on the same
host.

---

## Deployment

The app ships as one service: Express serves the built React bundle, so the diner's
phone reaches the site, the API and the Socket.io feed on a single origin. That is what
makes a free single-instance host workable.

### Render (blueprint included)

`render.yaml` describes the service. Point Render at the repository, and it reads it.

1. **Create a MongoDB Atlas cluster** (Render has no managed MongoDB). Take the
   `mongodb+srv://…` connection string, and under **Network Access** allow `0.0.0.0/0`
   — Render's free instances have no fixed outbound IP to allowlist.
2. **New → Blueprint** on Render, select the repository. Render prompts for the values
   marked `sync: false`: `MONGODB_URI` and `DATA_ENCRYPTION_KEY`.
3. **Seed the database from your machine**, not from Render — a free instance has no
   shell. Point a local `server/.env` at the *same* Atlas URI and the *same*
   `DATA_ENCRYPTION_KEY`, then run `npm run seed`.
4. Open `https://<service>.onrender.com/staff` and sign in.

`CLIENT_URL` needs no manual step: `config/env.js` falls back to Render's
`RENDER_EXTERNAL_URL`, which already carries the scheme, so table QR codes encode the
right host on the first deploy and the service's own origin is always CORS-allowed.

Two things that bite on the free plan:

- **`PORT` is not injected.** Render expects `10000`; `config/env.js` defaults to
  `5000`. The blueprint sets `PORT=10000` explicitly so `/api/health` can be reached —
  don't remove it.
- **The instance sleeps after ~15 minutes idle**, and the next request pays a cold
  start of roughly a minute. Wake it before a demo.

### DATA_ENCRYPTION_KEY must match everywhere

Customer names and phone numbers are AES-256-GCM encrypted at rest. The machine that
seeds and the machine that serves must carry the same key, and it must not change after
seeding — a different key makes existing customer records unreadable. `JWT_SECRET` is
safe to rotate by comparison; it only invalidates open sessions.

### Docker

`Dockerfile` builds the same single-service image for any container host: multi-stage,
non-root, `npm ci --omit=dev` at runtime, health endpoint at `GET /api/health`.

```bash
docker build -t qr-bite .
docker run -p 5000:5000 --env-file server/.env qr-bite
```

### Temporary public URL (demo without hosting)

For a demo off a laptop, `cloudflared tunnel --url http://localhost:5000` puts the local
server on a public HTTPS address. The hostname is random and dies with the tunnel, so
put it in `CLIENT_URL` and `CORS_ORIGINS`, restart, and run `npm run refresh:qr` — the
stored QR images are baked against whatever `CLIENT_URL` was current when they were
drawn.

---

## How it works

**Scanning.** Every table row holds a random, unguessable `code`. Its QR encodes
`<CLIENT_URL>/t/<code>`, and that code is the only thing proving a diner is in the
restaurant — so it can be regenerated per table if one leaks or a printed card walks
off.

**Ordering.** The cart is priced entirely on the server from current database prices;
anything the client sends about money is ignored. Placing an order returns a scoped
customer JWT that grants access to *that order only* — enough to track it and rate it,
nothing more. Staff tokens are rejected on customer routes and vice versa.

**Real time.** Socket.io rooms are per restaurant (staff) and per order (diner), so a
new ticket reaches every dashboard and each status change reaches the one phone waiting
on it. The dashboard fetches `/orders/live` once on load and listens after that.

**Ratings.** Only dishes that were actually on your order can be rated, and re-rating a
dish replaces your earlier score instead of stuffing the ballot. Dish averages are
recomputed on write so the menu can show them without an aggregate on every read.

**Customer data.** Names and phone numbers are encrypted with AES-256-GCM at rest and
decrypted on read. Search still works because each phone number also stores a blind
index — a keyed hash — that can be matched without decrypting the collection. The
WhatsApp log only ever shows a masked number.

**Reports.** Aggregated in MongoDB rather than in Node, so the numbers stay cheap as
order history grows. Cancelled orders are excluded from every revenue figure.

---

## API

All responses are `{ success, data, message? }`; failures add `details` for field-level
validation errors. Base path `/api`.

**Public** — no login; the table code proves presence.

```
GET    /public/tables/:code              restaurant, table and menu by category
GET    /public/menu-items/:id/reviews    reviews for one dish
POST   /public/orders                    place an order -> order + customer token
GET    /public/orders/mine               track it            (customer token)
POST   /public/orders/mine/ratings       rate the dishes     (customer token)
POST   /public/service-requests          call waiter / water / bill
```

**Staff** — every route needs a staff JWT; ✱ marks admin-only.

```
POST   /auth/login                       GET /auth/me
GET    /auth/staff  ✱                    POST /auth/staff ✱   PATCH /auth/staff/:id/active ✱

GET    /orders/live                      the kitchen monitor
GET    /orders                           history, filtered and paged
GET    /orders/:id                       PATCH /orders/:id/status
GET    /orders/service-requests           PATCH /orders/service-requests/:id/resolve

GET    /menu                             GET /menu/ratings    GET /menu/:id
POST   /menu                             PUT /menu/:id        PATCH /menu/:id/active
DELETE /menu/:id ✱

GET    /tables                           GET /tables/:id/qr.png
POST   /tables ✱                         POST /tables/bulk ✱  PUT /tables/:id ✱
POST   /tables/:id/regenerate-qr ✱       DELETE /tables/:id ✱

GET    /customers                        GET /customers/:id   GET /customers/messages
PATCH  /customers/:id/opt-in             POST /customers/broadcast ✱

GET    /reports/summary?days=7
```

Cancelling an order is admin-only; a dish with rating history cannot be hard-deleted,
only deactivated.

---

## Tests

```bash
npm test
```

`server/tests/api.test.js` walks the whole system in order — scan, order, cook, serve,
rate — against an in-memory MongoDB, so no running database is needed. The first run
downloads a MongoDB binary (~600 MB) and takes a few minutes; later runs take about a
minute.

The suite covers test cases TC1–TC14 from the project report:

| | |
| --- | --- |
| TC1–TC3 | Scan a table, load the menu, hide deactivated dishes |
| TC4 | Place an order — empty cart, missing phone, sold-out dish, server-side pricing |
| TC5 | The order appears on the staff dashboard |
| TC6 | The diner tracks their own order, and only their own |
| TC7 | A WhatsApp confirmation is recorded |
| TC8 | Call waiter, and clear it once attended |
| TC9 | Staff login, including a wrong password and a missing token |
| TC10 | Menu management — add, hide, and refuse to delete a rated dish |
| TC11 | Rate dishes, reject foreign dishes and out-of-range stars, replace re-ratings |
| TC12 | Order lifecycle, including refusing to move backwards |
| TC13 | WhatsApp campaign, opt-outs, and admin-only broadcasting |
| TC14 | Reports — revenue, best sellers, feedback, cancelled orders excluded |

---

## Demo logins

Created by `npm run seed`, and configurable through the `SEED_*` variables:

| Role | Username | Password |
| --- | --- | --- |
| Admin | `admin` | `Admin@123` |
| Staff | `staff01` | `Staff@123` |

Change these before deploying anywhere real.
