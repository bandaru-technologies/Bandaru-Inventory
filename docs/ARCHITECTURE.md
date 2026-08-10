# Multi-Tenant Inventory Management Platform — Architecture

## 1. Overview
A multi-tenant SaaS inventory management platform. Each **merchant (tenant)** gets:
- Personalized branding (logo, theme colors, store name) applied across web + mobile.
- Its own product catalog & inventory, isolated from other merchants.
- Product onboarding workflows (bulk import, single SKU creation, image upload).
- Analytics dashboards (sales velocity, stock levels, low-stock alerts, top products).
- Secure login (email/password + OAuth2/SSO + MFA), with RBAC (Owner, Manager, Staff).

## 2. Tech Stack
| Layer | Choice |
|---|---|
| Web frontend | React + TypeScript, Vite, Redux Toolkit / React Query, Tailwind (theme-driven) |
| Mobile | React Native (Expo bare or CLI), shared design-system package with web via a `theme` + `ui-kit` monorepo package |
| Backend | Java 21, Spring Boot 3.x, Spring Cloud (Gateway, Config, OpenFeign), Spring Security (OAuth2 Resource Server / JWT) |
| Datastore | PostgreSQL (per-service schema, row-level tenant isolation via `tenant_id`), Redis (cache/session/rate-limit), S3-compatible object storage (logos/product images) |
| Messaging | Kafka (domain events: `product.created`, `inventory.updated`, `order.placed`) |
| Analytics | Kafka → stream processor (Kafka Streams or Flink) → ClickHouse/Postgres (OLAP) → Analytics Service API |
| Search | Elasticsearch/OpenSearch (product search/autocomplete) |
| Auth | Keycloak or custom Auth Service issuing JWT (access + refresh), OAuth2/OIDC for SSO (Google/Microsoft) |
| Infra | Docker, Kubernetes, Helm, API Gateway (Spring Cloud Gateway / Kong), Service discovery (Kubernetes DNS or Eureka) |
| Observability | Prometheus + Grafana, ELK/Loki for logs, OpenTelemetry tracing |
| CI/CD | GitHub Actions, Docker registry, Helm-based deploy |

## 3. Multi-Tenancy Model
- **Tenant = Merchant/Company.** Identified by `tenant_id` (UUID), resolved at login and embedded as a claim in the JWT (`tenant_id`, `merchant_slug`).
- **Isolation strategy:** Shared database, shared schema, **row-level isolation** via `tenant_id` column + Postgres Row Level Security (RLS) policies as defense-in-depth (app also filters by tenant in every query/repository layer).
- **Personalization (Merchant Profile Service):** stores logo URL, brand colors (primary/secondary/accent), store display name, domain/subdomain (e.g. `acme.yourapp.com`), locale/currency. Frontend/mobile fetch this on app bootstrap (`GET /merchants/{tenantId}/branding`) and hydrate a theme provider (React Context + CSS variables on web, a `ThemeProvider` on RN using the same JSON theme schema).
- **Tenant resolution flow:** subdomain/custom domain OR post-login tenant claim → API Gateway attaches `X-Tenant-Id` header (validated against JWT) → all downstream services trust the header only from the gateway (mTLS/internal network) and enforce it in queries.

## 3.1 Three Portals / User Domains
The platform serves three distinct audiences, each with its own login, permission boundary, and (mostly) its own frontend app, all backed by the same Auth Service but issuing JWTs scoped to a different **audience/realm**:

| Portal | Users | Audience claim | Access scope | Primary app |
|---|---|---|---|---|
| **BandaruStock Admin** | Internal platform ops/support staff | `aud: admin` | Cross-tenant: manage merchants, plans/billing, suspend/activate tenants, platform-wide analytics, feature flags, impersonation (with audit) | `admin-web` (React) |
| **Merchant Portal** | Tenant `OWNER`, `MANAGER`, `STAFF` | `aud: merchant`, `tenant_id: <uuid>` | Tenant-scoped: products, inventory, branding, onboarding, tenant analytics, QR label generation | `merchant-web` (React) + `mobile-app` (React Native, staff scanning/adjust) |
| **Customer Portal** | End customers who shop with a specific merchant | `aud: customer`, `tenant_id: <uuid>`, `customer_id` | Tenant-scoped, read-mostly: browse catalog, view product via QR scan, place orders, order history, profile | `customer-web` (React storefront), optionally extendable to a customer-facing RN app later |

- **Login separation:** `POST /auth/login` accepts a `loginContext` (`ADMIN` | `MERCHANT` | `CUSTOMER`) or is served from separate subpaths/base URLs (`/auth/admin/login`, `/auth/merchant/login`, `/auth/customer/login`) that each validate against the correct user table (`admin_users`, `users`, `customers`) and mint a JWT with the matching `aud` claim — a merchant JWT can never call admin or customer-only endpoints, enforced by `@PreAuthorize` on `aud` + role.
- **Admin isolation:** `admin_users` are **not** tenant-scoped; Admin Portal auth should ideally run through a separate, more hardened flow (mandatory MFA, IP allowlist/VPN, shorter token TTL) — optionally its own Keycloak realm.
- **Customer signup:** self-service, tenant-scoped (`POST /auth/customer/register` requires resolving the merchant first, e.g. via subdomain/custom-domain or a QR-scanned product link), no company/onboarding flow — just profile + optional address book.
- **Shared gateway:** all three portals go through the same API Gateway; gateway routes by path prefix (`/api/v1/admin/**`, `/api/v1/merchant/**` or default tenant-scoped, `/api/v1/customer/**`) and validates the JWT `aud` claim matches the route group before forwarding.


```
                        ┌───────────────────────┐
                        │   API Gateway (Spring  │
                        │  Cloud Gateway) + WAF  │
                        └──────────┬────────────┘
        ┌──────────────┬───────────┼───────────┬───────────────┬───────────────┐
        ▼              ▼           ▼           ▼               ▼               ▼
  ┌──────────┐  ┌──────────────┐ ┌────────┐ ┌───────────┐ ┌───────────┐ ┌──────────────┐
  │  Auth     │  │  Merchant/   │ │Product │ │ Inventory │ │ Analytics │ │ Notification │
  │  Service  │  │  Tenant Svc  │ │Catalog │ │  Service  │ │  Service  │ │   Service    │
  │ (JWT/OIDC)│  │ (branding,   │ │ Service│ │(stock,    │ │(dashboards│ │ (email/SMS/  │
  │           │  │ onboarding)  │ │        │ │ movements)│ │ /reports) │ │  push)       │
  └─────┬─────┘  └──────┬───────┘ └───┬────┘ └─────┬─────┘ └─────┬─────┘ └──────┬───────┘
        │               │             │            │             │              │
        └───────────────┴─────────────┴─── Kafka Event Bus ──────┴──────────────┘
                                              │
                                     ┌────────┴────────┐
                                     │  Postgres (per   │
                                     │  service schema),│
                                     │  Redis, S3, ES   │
                                     └──────────────────┘
```

### Services
1. **Auth Service** — signup/login for all three portals (admin/merchant/customer), JWT issuance (access 15min + refresh 7d) with `aud` claim per portal, OAuth2/OIDC (Google/Microsoft SSO) for merchant & admin, MFA (TOTP, mandatory for admin), password policies, RBAC roles (`PLATFORM_ADMIN`, `OWNER`, `MANAGER`, `STAFF`, `CUSTOMER`), account lockout, audit log of auth events.
2. **Merchant/Tenant Service** — tenant CRUD, branding config (logo, theme), subscription/plan tier, onboarding wizard state, custom domain mapping. Also exposes **admin-only** sub-routes (`/api/v1/admin/tenants/**`, requires `aud=admin` + `PLATFORM_ADMIN`) for cross-tenant listing, suspend/activate, plan changes — reusing the same service, gated by role/audience rather than a separate microservice.
3. **Product Catalog Service** — product CRUD, categories, variants, SKU, images (via S3 presigned upload), bulk CSV import for onboarding, product search (delegates to Elasticsearch), QR/barcode label generation, and a **customer-facing read catalog** (`/api/v1/customer/catalog/**`) for the storefront.
4. **Inventory Service** — stock levels per warehouse/location, stock in/out transactions, low-stock thresholds & alerts, reservation on order, audit trail of movements.
5. **Order Service** *(customer-facing, new)* — customer cart/checkout, order placement, order history; emits `order.placed`, reserves stock via Inventory Service.
6. **Analytics Service** — consumes Kafka events (`product.created`, `inventory.updated`, `order.placed`), aggregates into OLAP store, exposes dashboard APIs: tenant-scoped (merchant portal) **and** platform-wide (admin portal — cross-tenant GMV, active merchants, churn).
7. **Notification Service** — low-stock alerts, onboarding emails, order confirmations, async via Kafka consumer, sends email/SMS/push (FCM for mobile).
8. **API Gateway** — routing, rate limiting, JWT validation (incl. `aud` claim check per route group), tenant header injection, request/response logging.

### 4a. Product QR Code / Barcode Labeling (Product Service capability)
Once a merchant onboards a product, they can generate a scannable **QR code (or Code-128 barcode)** label to physically stick on the product. Scanning it opens the product record: **staff** (merchant portal/mobile app) get inventory quick-adjust; **customers** (customer portal) scanning the same code get a read-only product page (price, description, "add to cart") — the resolution endpoint branches behavior by the caller's `aud` claim.

- **Generation:** `Product Service` generates a QR code using a library like **ZXing (Java)**. The QR payload is **not** the raw productId — it's an opaque, unguessable `scanCode` stored in a `product_codes` lookup table (`scan_code`, `tenant_id`, `product_id`), so scanning never leaks internal IDs or requires the scanner to be authenticated to resolve basic product info.
- **Formats:** PNG/SVG for single-label download/print; a batch **PDF label sheet** (Avery 5160-style grid, configurable label size) for printing many at once — generated async as a job (same pattern as bulk import).
- **Storage:** Generated label images cached in S3 (`tenants/{tenantId}/labels/{scanCode}.png`), regenerable on demand.
- **Scan resolution:** App scans the code → calls `GET /products/scan/{scanCode}` → server resolves `scanCode` → `product_id`/`tenant_id` → response shape/actions depend on caller: staff (merchant/mobile) get stock + quick-adjust action; customer (customer-web) gets a storefront product card + add-to-cart.
- **Security:** the lookup endpoint returns only minimal product/stock info and requires the *scanning user* to be authenticated within the app (their own JWT + tenant/portal audience), so the QR code itself carries no auth power — it's just an opaque pointer. An **unauthenticated fallback** (`GET /public/scan/{scanCode}`) can optionally show basic product info to entice a non-logged-in customer to sign up, gated by a per-merchant setting. Codes can be revoked/regenerated (e.g. if a label is compromised or product SKU changes) via `POST /products/{productId}/qrcode/regenerate`.

## 5. Frontend (React) & Mobile (React Native) Architecture — Three Portals
- **Monorepo** (Turborepo/Nx) with shared packages:
  - `packages/ui-kit` — themeable components (Button, Card, ProductCard, etc.) built with a token-based theme (colors, spacing, fonts) consumable by both React (CSS-in-JS/Tailwind tokens) and React Native (StyleSheet from same tokens).
  - `packages/api-client` — typed API client (generated from OpenAPI spec via `openapi-typescript-codegen`), shared across all three web apps + mobile.
  - `packages/theme` — JSON schema for merchant branding, `ThemeProvider` for web (Context+CSS vars) and mobile (Context+StyleSheet). Admin portal uses BandaruStock's own fixed theme (not merchant-personalized).
- **`admin-web` (React)** — BandaruStock internal console: tenant list/search, suspend/activate, plan/billing management, platform-wide analytics, feature-flag toggles, support tools (impersonate merchant for troubleshooting, fully audit-logged). Locked down (VPN/IP allowlist recommended), mandatory MFA.
- **`merchant-web` (React)** — Auth (login/MFA), Onboarding wizard, Product management + QR label generation, Inventory dashboard, Analytics dashboard, Settings (branding, team/staff invites).
- **`mobile-app` (React Native)** — merchant staff app: Auth (biometric + JWT refresh), Product quick-add (camera for barcode/image), Inventory scan (barcode/QR scanner), Alerts/push notifications, Analytics summary widgets.
- **`customer-web` (React)** — merchant's public storefront: browse catalog (personalized with merchant branding/theme), scan a product QR to view/add to cart, checkout, order history, profile. Resolved per-merchant via subdomain/custom domain (`shop.acme.com`) so each merchant's storefront is separately themed and branded.
- **State/data:** React Query (server cache) + Redux Toolkit or Zustand (client/UI state) across all apps.
- **Theming flow:** On login/app load, fetch `GET /merchants/{tenantId}/branding` (merchant & customer apps only — admin has its own fixed theme) → store in secure storage/local cache → hydrate `ThemeProvider` → all components re-render with merchant colors/logo.

## 6. Security
- **Transport:** TLS everywhere; mTLS between internal services (via service mesh, e.g. Istio, optional).
- **AuthN:** JWT (RS256) issued by Auth Service, short-lived access token + rotating refresh token (stored httpOnly cookie on web, secure storage/Keychain on mobile).
- **AuthZ:** RBAC + tenant scoping + **portal audience (`aud`) scoping** enforced at Gateway (coarse — rejects mismatched `aud` per route group) and service layer (fine, via `@PreAuthorize` + tenant filter in repository layer / Postgres RLS). A customer JWT can never reach merchant/admin endpoints and vice versa.
- **MFA:** TOTP (Google Authenticator compatible); mandatory for `PLATFORM_ADMIN`, optional/required per merchant policy for merchant users, optional for customers.
- **Secrets:** Vault or cloud KMS; never in code/env committed to git.
- **Rate limiting & bot protection:** Gateway-level (Redis token bucket) + login attempt throttling/lockout.
- **Audit logging:** All auth events & sensitive admin actions logged to append-only audit table + SIEM export.
- **Data isolation validation:** automated tests asserting cross-tenant queries return zero rows; Postgres RLS as second line of defense.

## 7. Analytics Pipeline
`Product/Inventory/Order events → Kafka topics → Stream aggregator (Kafka Streams) → Analytics DB (ClickHouse/Postgres materialized views) → Analytics Service REST API → Dashboards (web/mobile)`
Key metrics: stock turnover rate, low-stock SKUs, top-selling products, category performance, onboarding completion rate.

## 8. Deployment Topology
- Kubernetes cluster, one namespace per environment (dev/stage/prod).
- Each microservice: Deployment + Service + HPA (CPU/RPS based autoscaling).
- API Gateway as Ingress-facing Deployment (or use Ingress + Kong).
- Postgres: managed (RDS/Cloud SQL) with per-service schema/DB.
- Kafka: managed (MSK/Confluent) or self-hosted via Strimzi operator.
- Config: Spring Cloud Config / Kubernetes ConfigMaps + Secrets, environment-specific overrides.
- CI/CD: GitHub Actions → build/test → Docker image → push to registry → Helm upgrade to k8s.

## 9. Async Processing Model
The platform is microservice-first with **synchronous REST** used only for request/response reads and simple writes; anything that is slow, bulk, cross-service, or notification-worthy is pushed to **Kafka** and processed asynchronously by consumers. This keeps services decoupled and API latency low.

**Patterns used:**
- **Transactional Outbox** — each service writes its state change + an outbox row in the same DB transaction; a CDC/poller (Debezium or a scheduled publisher) publishes the outbox row to Kafka, guaranteeing no lost events without distributed transactions.
- **Async job pattern (bulk import)** — client gets `202 Accepted` + `jobId` immediately; a worker consumer processes rows and the client polls `GET /products/bulk-import/{jobId}` (or receives a WebSocket/push update) for status.
- **Event-driven side effects** — inventory changes, low-stock detection, analytics aggregation, and notifications are all triggered by consuming domain events, not by direct service-to-service calls.
- **Retry & Dead-Letter Queue (DLQ)** — consumers retry with exponential backoff (Spring Kafka `DefaultErrorHandler` + `ExponentialBackOff`); after max attempts, message goes to a `<topic>.DLQ` topic for manual/automated reprocessing.
- **Idempotency** — every consumer is idempotent (dedup via event ID / `Idempotency-Key`), since Kafka delivery is at-least-once.
- **Sync-over-async for UX** — where the frontend needs near-real-time feedback (e.g. bulk import progress, low-stock badge), we use polling endpoints or WebSocket/SSE fed by the same consumers, rather than blocking HTTP calls.

## 10. Flow Diagrams
See [`FLOW_DIAGRAMS.md`](./FLOW_DIAGRAMS.md) for sequence/flow diagrams covering: merchant onboarding, product bulk import (async job), inventory update → low-stock alert (event-driven), analytics aggregation pipeline, and auth/login.

## 11. Suggested Repo Structure
```
Bandaru-Inventory/
├── backend/
│   ├── auth-service/            # issues JWTs for all 3 portals (admin/merchant/customer aud)
│   ├── merchant-service/        # tenant CRUD + admin-only cross-tenant routes
│   ├── product-service/         # catalog + QR/barcode labels + customer read-catalog
│   ├── inventory-service/
│   ├── order-service/           # customer cart/checkout/order history
│   ├── analytics-service/       # tenant-scoped + platform-wide (admin) analytics
│   ├── notification-service/
│   ├── api-gateway/             # routes by aud + path prefix (/admin, /merchant, /customer)
│   └── common-lib/              # shared DTOs, security filters, tenant/audience context
├── admin-web/                   # React — BandaruStock Admin console
├── merchant-web/                # React — Merchant dashboard (was frontend-web)
├── customer-web/                # React — Customer storefront (per-merchant themed)
├── mobile-app/                  # React Native — merchant staff app
├── packages/                    # shared ui-kit, theme, api-client (if monorepo)
└── docs/
    ├── ARCHITECTURE.md
    └── API_CONTRACT.md
```
