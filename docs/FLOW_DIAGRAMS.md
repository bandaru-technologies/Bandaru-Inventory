# Flow Diagrams

## 1. High-Level Microservice + Async Flow (overview)
```mermaid
flowchart LR
    subgraph Client
        WEB[React Web]
        MOB[React Native App]
    end

    WEB & MOB --> GW[API Gateway<br/>JWT validation, tenant header, rate limit]

    GW --> AUTH[Auth Service]
    GW --> MERCH[Merchant Service]
    GW --> PROD[Product Service]
    GW --> INV[Inventory Service]
    GW --> ANLT[Analytics Service]

    AUTH -- auth.login_failed / user.registered --> KAFKA[(Kafka Event Bus)]
    MERCH -- onboarding.step_completed --> KAFKA
    PROD -- product.created --> KAFKA
    INV -- inventory.updated / inventory.low_stock --> KAFKA

    KAFKA --> NOTIF[Notification Service]
    KAFKA --> STREAM[Stream Aggregator<br/>Kafka Streams]
    STREAM --> OLAP[(Analytics OLAP Store)]
    ANLT --> OLAP

    NOTIF --> PUSH[Email/SMS/Push - FCM]
```

---
## 2. Merchant Onboarding Flow (sync signup + async setup)
```mermaid
sequenceDiagram
    actor Owner
    participant WEB as React Web
    participant GW as API Gateway
    participant AUTH as Auth Service
    participant MERCH as Merchant Service
    participant KAFKA as Kafka
    participant NOTIF as Notification Service

    Owner->>WEB: Fill signup form (company, email, password)
    WEB->>GW: POST /auth/register
    GW->>AUTH: forward request
    AUTH->>AUTH: create tenant + OWNER user (DB txn + outbox row)
    AUTH-->>WEB: 201 Created {tenantId, userId, status: PENDING_VERIFICATION}
    AUTH->>KAFKA: publish user.registered (via outbox poller)

    KAFKA->>NOTIF: consume user.registered
    NOTIF->>Owner: send verification email (async)

    Owner->>WEB: Upload logo + pick theme colors
    WEB->>GW: POST /merchants/{id}/branding/logo-upload-url
    GW->>MERCH: forward
    MERCH-->>WEB: presigned S3 URL
    WEB->>S3: PUT logo file directly (client to storage)
    WEB->>GW: PUT /merchants/{id}/branding {theme, logoUrl}
    GW->>MERCH: forward
    MERCH->>MERCH: save branding + mark onboarding step BRANDING_SETUP=true
    MERCH->>KAFKA: publish onboarding.step_completed
    KAFKA->>NOTIF: consume (async) -> in-app "keep going" nudge
    MERCH-->>WEB: 200 OK
```

---
## 3. Product Onboarding — Bulk Import (async job pattern)
```mermaid
sequenceDiagram
    actor Manager
    participant WEB as React Web
    participant GW as API Gateway
    participant PROD as Product Service
    participant WORKER as Import Worker (consumer)
    participant KAFKA as Kafka
    participant DB as Postgres

    Manager->>WEB: Upload CSV of products
    WEB->>GW: POST /products/bulk-import (multipart)
    GW->>PROD: forward
    PROD->>DB: create import_job row (status=PROCESSING)
    PROD->>KAFKA: publish product.bulk_import.requested {jobId, fileUrl}
    PROD-->>WEB: 202 Accepted {jobId, status: PROCESSING}

    KAFKA->>WORKER: consume product.bulk_import.requested
    loop each row (batched)
        WORKER->>WORKER: validate row
        alt valid
            WORKER->>DB: insert product + inventory record (txn + outbox)
            WORKER->>KAFKA: publish product.created (via outbox)
        else invalid
            WORKER->>DB: append error to job.errors[]
        end
    end
    WORKER->>DB: update import_job status=COMPLETED, successCount, failedCount

    loop client polling (or WebSocket push)
        WEB->>GW: GET /products/bulk-import/{jobId}
        GW->>PROD: forward
        PROD->>DB: read job status
        PROD-->>WEB: {status, successCount, failedCount, errors[]}
    end
```

---
## 4. Inventory Update → Low-Stock Alert (event-driven)
```mermaid
sequenceDiagram
    actor Staff
    participant MOB as React Native App
    participant GW as API Gateway
    participant INV as Inventory Service
    participant KAFKA as Kafka
    participant STREAM as Stream Aggregator
    participant NOTIF as Notification Service
    participant ANLT as Analytics Service

    Staff->>MOB: Scan barcode, adjust stock (-3, reason=SOLD)
    MOB->>GW: POST /inventory/{productId}/adjust
    GW->>INV: forward
    INV->>INV: update quantity (DB txn + outbox row)
    INV-->>MOB: 200 OK {newQuantity, available}
    INV->>KAFKA: publish inventory.updated

    KAFKA->>STREAM: consume inventory.updated
    STREAM->>ANLT: write aggregate to OLAP (units_sold, turnover)

    alt newQuantity <= lowStockThreshold
        INV->>KAFKA: publish inventory.low_stock
        KAFKA->>NOTIF: consume inventory.low_stock
        NOTIF->>Staff: push/email "Low stock: ACME-TSHIRT-BLK-M (5 left)"
    end
```

---
## 5. Analytics Aggregation Pipeline (continuous async)
```mermaid
flowchart LR
    P1[product.created] --> KAFKA[(Kafka)]
    P2[inventory.updated] --> KAFKA
    P3[order.placed] --> KAFKA
    P4[onboarding.step_completed] --> KAFKA

    KAFKA --> KS[Kafka Streams App<br/>windowed aggregation<br/>per tenant/product/day]
    KS --> MAT[(Materialized Views /<br/>ClickHouse OLAP tables)]
    MAT --> ANLT[Analytics Service REST API]
    ANLT --> DASH_WEB[React Dashboard]
    ANLT --> DASH_MOB[React Native Summary Widgets]
```

---
## 6. QR Code Label — Generate & Scan Flow
```mermaid
sequenceDiagram
    actor Manager
    actor Staff
    participant WEB as React Web
    participant MOB as React Native App
    participant GW as API Gateway
    participant PROD as Product Service
    participant DB as Postgres (product_codes)
    participant S3 as Object Storage

    Manager->>WEB: Click "Generate QR Label" on product
    WEB->>GW: POST /products/{productId}/qrcode
    GW->>PROD: forward
    PROD->>PROD: generate opaque scanCode (ZXing QR render)
    PROD->>DB: insert product_codes(scanCode, tenantId, productId, ACTIVE)
    PROD->>S3: store qr image (png/svg)
    PROD-->>WEB: 201 {scanCode, qrImageUrl}
    Manager->>Manager: Print & stick label on physical product

    Note over Staff,MOB: Later, on warehouse floor
    Staff->>MOB: Scan QR label with camera
    MOB->>GW: GET /products/scan/{scanCode}  (with own JWT)
    GW->>PROD: forward
    PROD->>DB: lookup scanCode -> validate tenant match + status=ACTIVE
    alt found & tenant matches
        PROD-->>MOB: 200 {product, sku, price, inventory}
        Staff->>MOB: Tap "Adjust Stock"
        MOB->>GW: POST /inventory/{productId}/adjust
        GW->>INV: forward (as in Flow 4)
    else not found / revoked / tenant mismatch
        PROD-->>MOB: 404 SCAN_CODE_NOT_FOUND_OR_REVOKED
    end
```

**Bulk label printing (async job)** follows the same async job pattern as CSV bulk import: `POST /products/qrcodes/bulk-print` → `202 {jobId}` → worker renders a multi-label PDF sheet → client polls `GET /products/qrcodes/bulk-print/{jobId}` for the final `pdfUrl` to print and cut out labels.

---
## 7. Login / Auth Flow (sync, with optional MFA)
```mermaid
sequenceDiagram
    actor User
    participant APP as Web/Mobile
    participant GW as API Gateway
    participant AUTH as Auth Service
    participant REDIS as Redis (session/lockout)

    User->>APP: Enter email + password
    APP->>GW: POST /auth/{portal}/login
    GW->>AUTH: forward
    AUTH->>REDIS: check login attempt count (lockout policy)
    AUTH->>AUTH: verify password hash against matching table<br/>(admin_users | users | customers)
    alt MFA enabled (mandatory for admin)
        AUTH-->>APP: 202 {mfaChallengeToken, mfaRequired: true}
        User->>APP: Enter TOTP code
        APP->>GW: POST /auth/mfa/verify
        GW->>AUTH: forward
        AUTH->>AUTH: verify TOTP
        AUTH-->>APP: 200 {accessToken, refreshToken, aud}
    else no MFA
        AUTH-->>APP: 200 {accessToken, refreshToken, aud}
    end
    AUTH->>REDIS: reset attempt counter
    AUTH-->>GW: (async) publish auth.login_succeeded to Kafka for audit
```

---
## 8. Three Portals — Gateway Audience Routing
```mermaid
flowchart TB
    subgraph Portals
        ADMIN_UI[BandaruStock Admin - admin-web]
        MERCH_UI[Merchant Portal - merchant-web + mobile-app]
        CUST_UI[Customer Storefront - customer-web]
    end

    ADMIN_UI -- "JWT aud=admin" --> GW[API Gateway]
    MERCH_UI -- "JWT aud=merchant, tenant_id" --> GW
    CUST_UI -- "JWT aud=customer, tenant_id, customer_id" --> GW

    GW -->|validate aud matches route group| ROUTE{Route by path prefix}
    ROUTE -->|"/api/v1/admin/**<br/>requires aud=admin"| ADMIN_SVC[Merchant/Tenant Service<br/>admin sub-routes]
    ROUTE -->|"/api/v1/merchants, /products,<br/>/inventory, /analytics<br/>requires aud=merchant"| MERCH_SVCS[Merchant, Product,<br/>Inventory, Analytics Services]
    ROUTE -->|"/api/v1/customer/**<br/>requires aud=customer"| CUST_SVCS[Product read-catalog,<br/>Order Service]

    ROUTE -->|"aud mismatch"| REJECT[403 Forbidden]
```
