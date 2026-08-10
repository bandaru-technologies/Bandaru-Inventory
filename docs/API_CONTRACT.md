# API Contract (v1)

Base path convention: `https://api.yourapp.com/api/v1/{service}`
All authenticated requests require header: `Authorization: Bearer <JWT>`. Tenant is derived from JWT claim `tenant_id`; Gateway also injects `X-Tenant-Id` (validated) to downstream services.

**Three portals, three JWT audiences** — every JWT carries an `aud` claim (`admin` | `merchant` | `customer`). The Gateway rejects any request whose `aud` doesn't match the route group (`/api/v1/admin/**`, tenant-scoped default routes, `/api/v1/customer/**`). Roles by portal:
| Portal | `aud` | Roles |
|---|---|---|
| BandaruStock Admin | `admin` | `PLATFORM_ADMIN`, `SUPPORT_AGENT` |
| Merchant | `merchant` | `OWNER`, `MANAGER`, `STAFF` |
| Customer | `customer` | `CUSTOMER` |

Common envelope for list endpoints:
```json
{
  "data": [ ... ],
  "page": 0,
  "size": 20,
  "totalElements": 137,
  "totalPages": 7
}
```
Common error envelope:
```json
{
  "timestamp": "2026-08-10T07:00:00Z",
  "status": 400,
  "error": "VALIDATION_ERROR",
  "message": "email must be a valid email address",
  "path": "/api/v1/auth/register",
  "traceId": "8f2c...."
}
```

---
## 1. Auth Service (`/api/v1/auth`)
Each portal has its own login/register subpath (mirrors the `aud` table above); token refresh/logout/MFA-verify are shared endpoint shapes reused across portals.

### POST /auth/merchant/register
Registers the first Owner user + creates a tenant (used during merchant signup).
Request:
```json
{
  "companyName": "Acme Retail",
  "email": "owner@acme.com",
  "password": "P@ssw0rd123",
  "fullName": "Jane Doe"
}
```
Response `201`:
```json
{
  "tenantId": "b3a6...",
  "userId": "u_9f2...",
  "email": "owner@acme.com",
  "role": "OWNER",
  "status": "PENDING_VERIFICATION"
}
```

### POST /auth/merchant/login
Request: `{ "email": "owner@acme.com", "password": "P@ssw0rd123" }`
Response `200`:
```json
{
  "accessToken": "<jwt>",
  "refreshToken": "<jwt>",
  "expiresIn": 900,
  "mfaRequired": false,
  "tenantId": "b3a6...",
  "role": "OWNER",
  "aud": "merchant"
}
```
`202` (if MFA enabled): `{ "mfaChallengeToken": "...", "mfaRequired": true }`

### POST /auth/admin/login
BandaruStock internal staff login (MFA always required regardless of flag).
Request: `{ "email": "ops@bandarustock.com", "password": "..." }`
Response `202` (MFA always challenged): `{ "mfaChallengeToken": "...", "mfaRequired": true }` -> then `POST /auth/mfa/verify` -> `200 { accessToken, refreshToken, role: "PLATFORM_ADMIN", aud: "admin" }`. No `tenantId` (cross-tenant).

### POST /auth/customer/register
Self-service signup, scoped to a specific merchant (resolved via subdomain/custom-domain host header, or a `tenantId`/`scanCode` in the body when signing up from a QR scan).
Request:
```json
{ "tenantId": "b3a6...", "email": "shopper@example.com", "password": "P@ssw0rd123", "fullName": "Sam Lee" }
```
Response `201`: `{ "customerId": "c_44f1", "tenantId": "b3a6...", "email": "shopper@example.com", "status": "ACTIVE" }`

### POST /auth/customer/login
Request: `{ "tenantId": "b3a6...", "email": "shopper@example.com", "password": "P@ssw0rd123" }`
Response `200`: `{ "accessToken": "<jwt>", "refreshToken": "<jwt>", "expiresIn": 900, "tenantId": "b3a6...", "role": "CUSTOMER", "aud": "customer" }`

### POST /auth/mfa/verify
Request: `{ "mfaChallengeToken": "...", "code": "123456" }` -> returns token pair as above (shape depends on originating portal).

### POST /auth/token/refresh
Request: `{ "refreshToken": "..." }` -> returns new `accessToken`/`refreshToken` pair (same `aud` as original).

### POST /auth/logout
Invalidates refresh token (adds to revocation list in Redis). `204`.

### GET /auth/me
Returns current user profile + role + `aud` + `tenantId` (omitted for admin). `200`.

### POST /auth/password/forgot
`{ "email": "..." }` -> sends reset link. `202`.

### POST /auth/password/reset
`{ "token": "...", "newPassword": "..." }` -> `204`.

### OAuth2/SSO
`GET /auth/oauth2/authorize/{provider}` (google|microsoft) -> redirect flow -> `GET /auth/oauth2/callback/{provider}` -> issues JWT pair (same shape as login). Available for merchant and admin portals; optional for customer portal.

**Roles:** `PLATFORM_ADMIN`, `SUPPORT_AGENT` (admin) - `OWNER`, `MANAGER`, `STAFF` (merchant) - `CUSTOMER` (customer) -- enforced via `@PreAuthorize("hasRole('OWNER')")` plus an `aud` check, on every write endpoint.

---
## 2. Merchant/Tenant Service (`/api/v1/merchants`)

### GET /merchants/{tenantId}
```json
{
  "tenantId": "b3a6...",
  "companyName": "Acme Retail",
  "slug": "acme",
  "customDomain": "shop.acme.com",
  "plan": "PRO",
  "onboardingStatus": "IN_PROGRESS",
  "createdAt": "2026-01-05T10:00:00Z"
}
```

### PATCH /merchants/{tenantId}
Update company profile (name, domain). Roles: `OWNER`.

### GET /merchants/{tenantId}/branding
```json
{
  "logoUrl": "https://cdn.yourapp.com/tenants/b3a6/logo.png",
  "theme": {
    "primaryColor": "#0A66C2",
    "secondaryColor": "#111827",
    "accentColor": "#F59E0B",
    "fontFamily": "Inter"
  },
  "storeName": "Acme Retail",
  "currency": "USD",
  "locale": "en-US"
}
```

### PUT /merchants/{tenantId}/branding
Update branding (logo upload handled separately via presigned URL, then this stores the URL + theme). Roles: `OWNER`, `MANAGER`.

### POST /merchants/{tenantId}/branding/logo-upload-url
Returns S3 presigned URL for direct client upload:
```json
{ "uploadUrl": "https://s3...", "fileUrl": "https://cdn.yourapp.com/tenants/b3a6/logo.png", "expiresIn": 300 }
```

### GET /merchants/{tenantId}/onboarding
Returns onboarding checklist state:
```json
{
  "steps": [
    { "key": "BRANDING_SETUP", "completed": true },
    { "key": "FIRST_PRODUCT_ADDED", "completed": false },
    { "key": "TEAM_INVITED", "completed": false },
    { "key": "PAYMENT_CONFIGURED", "completed": false }
  ],
  "completionPercent": 25
}
```

---
## 3. Product Catalog Service (`/api/v1/products`)

### POST /products
Onboard/create a product.
```json
{
  "sku": "ACME-TSHIRT-BLK-M",
  "name": "Black T-Shirt",
  "description": "100% cotton",
  "categoryId": "cat_101",
  "price": 19.99,
  "currency": "USD",
  "images": ["https://cdn.yourapp.com/tenants/b3a6/products/tshirt1.png"],
  "attributes": { "color": "Black", "size": "M" },
  "initialStock": { "warehouseId": "wh_1", "quantity": 100 }
}
```
Response `201`: full product object incl. generated `productId`, `tenantId`, `createdAt`.

### GET /products?page=0&size=20&categoryId=&search=
Paginated list (tenant-scoped automatically).

### GET /products/{productId}
### PATCH /products/{productId}
### DELETE /products/{productId} (soft delete)

### POST /products/bulk-import
Multipart CSV upload for onboarding many SKUs at once.
Response `202`:
```json
{ "jobId": "job_88f2", "status": "PROCESSING", "totalRows": 500 }
```
### GET /products/bulk-import/{jobId}
```json
{ "jobId": "job_88f2", "status": "COMPLETED", "successCount": 495, "failedCount": 5, "errors": [ { "row": 12, "reason": "duplicate SKU" } ] }
```

### GET /products/categories
List/create categories: `POST /products/categories`.

### QR Code / Label Generation

#### POST /products/{productId}/qrcode
Generates (or returns existing) scan code + QR image for a product. Roles: `OWNER`, `MANAGER`.
Response `201`:
```json
{
  "productId": "p_123",
  "scanCode": "qr_7f3a9c2e",
  "qrImageUrl": "https://cdn.yourapp.com/tenants/b3a6/labels/qr_7f3a9c2e.png",
  "svgUrl": "https://cdn.yourapp.com/tenants/b3a6/labels/qr_7f3a9c2e.svg",
  "createdAt": "2026-08-10T07:00:00Z"
}
```

#### POST /products/{productId}/qrcode/regenerate
Invalidates the old `scanCode` (old label stops resolving) and issues a new one. Roles: `OWNER`, `MANAGER`. Response `201` (same shape as above).

#### GET /products/{productId}/qrcode
Fetch existing label info (without regenerating). `404` if not yet generated.

#### POST /products/qrcodes/bulk-print
Async job to generate a printable label sheet (PDF) for multiple products.
Request:
```json
{ "productIds": ["p_123", "p_124", "p_125"], "labelSize": "AVERY_5160", "includeProductName": true, "includePrice": false }
```
Response `202`: `{ "jobId": "job_qr_552", "status": "PROCESSING" }`

#### GET /products/qrcodes/bulk-print/{jobId}
```json
{ "jobId": "job_qr_552", "status": "COMPLETED", "pdfUrl": "https://cdn.yourapp.com/tenants/b3a6/labels/batches/job_qr_552.pdf" }
```

#### GET /products/scan/{scanCode}
**Public resolution endpoint** — still requires the scanning user's own `Authorization: Bearer <JWT>` (their app session), but the `scanCode` itself carries no tenant/auth info; server looks it up in `product_codes` to resolve the product, regardless of which merchant the scanning employee belongs to being checked against `product_codes.tenant_id` matching the caller's `tenant_id` (returns `404` if mismatched/revoked).
Response `200`:
```json
{
  "productId": "p_123",
  "sku": "ACME-TSHIRT-BLK-M",
  "name": "Black T-Shirt",
  "price": 19.99,
  "currency": "USD",
  "inventory": { "warehouseId": "wh_1", "quantity": 87, "available": 82 }
}
```
`404`: `{ "error": "SCAN_CODE_NOT_FOUND_OR_REVOKED" }`

---
## 4. Inventory Service (`/api/v1/inventory`)

### GET /inventory/{productId}
```json
{
  "productId": "p_123",
  "sku": "ACME-TSHIRT-BLK-M",
  "warehouses": [
    { "warehouseId": "wh_1", "quantity": 87, "reserved": 5, "available": 82, "lowStockThreshold": 10 }
  ]
}
```

### POST /inventory/{productId}/adjust
Stock in/out (manual adjustment, receiving, damage, etc.)
```json
{ "warehouseId": "wh_1", "quantity": -3, "reason": "DAMAGED", "note": "Water damage" }
```
Response `200`: updated stock snapshot. Emits Kafka event `inventory.updated`.

### GET /inventory/movements?productId=&from=&to=&page=
Audit trail of stock movements.

### GET /inventory/low-stock
Returns SKUs at/below threshold, tenant-scoped, used for alerting/dashboard.

### GET /inventory/warehouses / POST /inventory/warehouses
Manage warehouse/location records.

---
## 5. Analytics Service (`/api/v1/analytics`)

### GET /analytics/dashboard/summary?range=30d
```json
{
  "totalProducts": 320,
  "totalStockValue": 45230.50,
  "lowStockCount": 12,
  "topProducts": [ { "productId": "p_123", "name": "Black T-Shirt", "unitsSold": 240 } ],
  "salesTrend": [ { "date": "2026-07-10", "unitsSold": 12, "revenue": 239.88 } ]
}
```

### GET /analytics/inventory-turnover?range=90d
### GET /analytics/category-performance
### GET /analytics/onboarding-funnel (merchant-level funnel for admin/internal use)

---
## 6. Notification Service (`/api/v1/notifications`)

### GET /notifications?page=0 — list in-app notifications for current user.
### POST /notifications/{id}/read — mark as read.
### GET /notifications/preferences / PUT /notifications/preferences — email/SMS/push toggles per alert type (low stock, onboarding reminders).
Internal (not public): consumes Kafka `inventory.low_stock`, `onboarding.step_completed` to trigger sends.

---
## 7. BandaruStock Admin API (`/api/v1/admin`) — `aud: admin`, role `PLATFORM_ADMIN`/`SUPPORT_AGENT`

### GET /admin/tenants?page=0&status=&plan=
Cross-tenant merchant listing for the admin console.
```json
{
  "data": [
    { "tenantId": "b3a6...", "companyName": "Acme Retail", "plan": "PRO", "status": "ACTIVE", "createdAt": "2026-01-05T10:00:00Z", "productCount": 320 }
  ],
  "page": 0, "size": 20, "totalElements": 812
}
```

### GET /admin/tenants/{tenantId} — full tenant detail (usage, plan, billing status, onboarding progress).
### PATCH /admin/tenants/{tenantId}/status
`{ "status": "SUSPENDED", "reason": "Payment overdue" }` → `200`. Emits audit log entry + `tenant.status_changed` event (triggers merchant-facing notification).

### PATCH /admin/tenants/{tenantId}/plan
`{ "plan": "ENTERPRISE" }` → `200`.

### POST /admin/tenants/{tenantId}/impersonate
Issues a short-lived, fully-audited support token scoped as that merchant's `OWNER` for troubleshooting.
Response `200`: `{ "impersonationToken": "<jwt>", "expiresIn": 600 }`. Every action taken with this token is tagged `impersonatedBy: <adminUserId>` in the audit log.

### GET /admin/analytics/platform-summary?range=30d
Platform-wide (cross-tenant) metrics.
```json
{
  "activeMerchants": 812,
  "newMerchantsThisPeriod": 34,
  "totalGMV": 1250340.55,
  "churnRate": 0.021,
  "topPlans": [ { "plan": "PRO", "count": 410 } ]
}
```

### GET /admin/feature-flags / PUT /admin/feature-flags/{key} — global or per-tenant feature flag toggles.
### GET /admin/audit-log?tenantId=&actorId=&page=0 — searchable platform audit trail.

---
## 8. Customer Portal API (`/api/v1/customer`) — `aud: customer`, role `CUSTOMER`
Tenant is resolved via subdomain/custom-domain host header (or `tenantId` for API-direct calls); all endpoints below are implicitly tenant-scoped to the merchant the customer is shopping with.

### GET /customer/catalog?page=0&categoryId=&search=
Public-facing (post-login) product listing, themed per merchant branding.
```json
{ "data": [ { "productId": "p_123", "sku": "ACME-TSHIRT-BLK-M", "name": "Black T-Shirt", "price": 19.99, "currency": "USD", "imageUrl": "...", "inStock": true } ], "page": 0, "totalElements": 320 }
```

### GET /customer/catalog/{productId} — full product detail page.

### GET /customer/scan/{scanCode}
Customer-portal variant of the QR scan resolution (see Product Service §"QR Code / Label Generation"); returns a storefront product card instead of stock-adjust controls.
```json
{ "productId": "p_123", "sku": "ACME-TSHIRT-BLK-M", "name": "Black T-Shirt", "price": 19.99, "currency": "USD", "description": "100% cotton", "inStock": true }
```

### GET /customer/cart / POST /customer/cart/items / DELETE /customer/cart/items/{productId}
Manage the shopping cart (server-side, persisted per customer).

### POST /customer/orders
Places an order from the current cart (delegates to Order Service; reserves stock via Inventory Service).
Response `201`:
```json
{ "orderId": "o_5521", "status": "PLACED", "items": [ { "productId": "p_123", "qty": 2, "price": 19.99 } ], "total": 39.98, "createdAt": "2026-08-10T09:00:00Z" }
```

### GET /customer/orders?page=0 — order history.
### GET /customer/orders/{orderId} — order detail + status timeline.
### GET /customer/profile / PATCH /customer/profile — profile & address book.

---
## 9. Core Data Models (simplified ERD)

```
admin_users(admin_user_id PK, email, password_hash, full_name, role[PLATFORM_ADMIN|SUPPORT_AGENT], mfa_enabled, created_at)  -- not tenant-scoped
tenants(tenant_id PK, company_name, slug, custom_domain, plan, status[ACTIVE|SUSPENDED|CANCELLED], onboarding_status, created_at)
tenant_branding(tenant_id PK/FK, logo_url, primary_color, secondary_color, accent_color, font_family, currency, locale)
users(user_id PK, tenant_id FK, email, password_hash, full_name, role, mfa_enabled, status, created_at)
customers(customer_id PK, tenant_id FK, email, password_hash, full_name, status, created_at)  -- end-shopper accounts, scoped per merchant
products(product_id PK, tenant_id FK, sku, name, description, category_id FK, price, currency, attributes JSONB, created_at, deleted_at)
categories(category_id PK, tenant_id FK, name, parent_id)
warehouses(warehouse_id PK, tenant_id FK, name, address)
product_codes(scan_code PK, tenant_id FK, product_id FK, status[ACTIVE|REVOKED], created_at)
inventory(product_id FK, warehouse_id FK, quantity, reserved, low_stock_threshold, PRIMARY KEY(product_id, warehouse_id))
inventory_movements(movement_id PK, tenant_id FK, product_id FK, warehouse_id FK, quantity_delta, reason, note, created_by, created_at)
orders(order_id PK, tenant_id FK, customer_id FK, status[PLACED|CONFIRMED|SHIPPED|CANCELLED], total, currency, created_at)
order_items(order_item_id PK, order_id FK, product_id FK, qty, unit_price)
analytics_daily_aggregates(tenant_id, product_id, date, units_sold, revenue) -- OLAP materialized view
audit_log(id PK, tenant_id, actor_id, actor_type[ADMIN|MERCHANT_USER|CUSTOMER], action, entity, entity_id, ip, created_at)
```
All tenant-scoped tables include `tenant_id` with a composite index `(tenant_id, ...)` and Postgres RLS policy: `USING (tenant_id = current_setting('app.current_tenant')::uuid)`. `admin_users` is intentionally not tenant-scoped and lives in a separate, more restricted schema/DB.

---
## 10. Kafka Event Contracts (topics)
| Topic | Producer | Payload |
|---|---|---|
| `product.created` | Product Service | `{tenantId, productId, sku, categoryId, createdAt}` |
| `inventory.updated` | Inventory Service | `{tenantId, productId, warehouseId, quantityDelta, newQuantity, reason}` |
| `inventory.low_stock` | Inventory Service | `{tenantId, productId, warehouseId, currentQuantity, threshold}` |
| `order.placed` | Order Service | `{tenantId, orderId, customerId, items:[{productId, qty, price}], total}` |
| `onboarding.step_completed` | Merchant Service | `{tenantId, step, completedAt}` |
| `auth.login_failed` | Auth Service | `{tenantId?, email, ip, aud, reason, timestamp}` |
| `tenant.status_changed` | Merchant Service (admin action) | `{tenantId, oldStatus, newStatus, changedByAdminId}` |
| `customer.registered` | Auth Service | `{tenantId, customerId, email, createdAt}` |

---
## 11. Versioning & Conventions
- URI versioning: `/api/v1/...`.
- Pagination: `page` (0-based), `size` (default 20, max 100).
- Dates: ISO-8601 UTC.
- IDs: UUIDs (except human-friendly SKU strings).
- All mutating endpoints require idempotency-safe design; bulk-import and adjust endpoints accept optional `Idempotency-Key` header.
