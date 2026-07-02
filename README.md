# BPM Portal — End-to-End Business Process Management

A production-ready, Dockerized BPM Portal with multi-tenant org structure, configurable approval matrix, ITIL case management, no-code BPMN process studio, integration hub, and real-time notifications.

## Quick Start

```bash
cd /opt/bpm/infra
docker compose up -d --build
```

Wait ~2 minutes for all services to be healthy, then open:

| URL | Service |
|-----|---------|
| http://localhost:8080 | **Frontend Portal** (React + MUI) |
| http://localhost:3000 | API Gateway |
| http://localhost:8443 | Keycloak Admin Console |
| http://localhost:8090 | Kafka UI |
| http://localhost:9000 | MinIO Console |
| http://localhost:9090 | Prometheus |
| http://localhost:3300 | Grafana (admin/admin) |

## Demo Users

All users share password: **Admin123!**

| Username | Email | Role |
|----------|-------|------|
| `admin` | admin@democorp.com | Platform Admin |
| `requester1` | requester1@democorp.com | Requester |
| `manager1` | manager1@democorp.com | Manager / Approver |
| `finance1` | finance1@democorp.com | Finance Controller |
| `cab1` | cab1@democorp.com | CAB Member |
| `engineer1` | engineer1@democorp.com | IT Engineer |

## Architecture

```
                ┌─────────────────────────────────────────────┐
                │            React Frontend (Nginx:80)        │
                └──────────────────┬──────────────────────────┘
                                   │ HTTPS/JWT (Keycloak)
                ┌──────────────────▼──────────────────────────┐
                │           API Gateway (:3000)                │
                │  JWT validation · Tenant injection · Proxy  │
                └──┬──────┬──────┬──────┬──────┬──────┬──────┘
                   │      │      │      │      │      │
            ┌──────▼┐ ┌───▼──┐ ┌▼────┐ ┌▼───┐ ┌▼────┐ ┌▼──────┐
            │ Org   │ │Approv│ │BPM  │ │Case│ │Integ│ │Notif  │
            │:3001  │ │:3002 │ │:3003│ │:3004│ │:3005│ │:3006  │
            └───┬───┘ └───┬──┘ └─┬───┘ └──┬─┘ └──┬──┘ └──┬────┘
                │         │      │        │       │       │
                └─────────┴──────┴────────┴───────┴───────┘
                                   │ All services publish/subscribe
                           ┌───────▼────────┐
                           │   Kafka KRaft  │
                           │  (Bitnami:9092)│
                           └───────┬────────┘
                                   │
            ┌──────────────────────┼───────────────────────┐
            │                      │                       │
     ┌──────▼──────┐      ┌────────▼──────┐      ┌────────▼──────┐
     │ PostgreSQL  │      │     MinIO     │      │  Keycloak     │
     │   :5432     │      │   :9000/9001  │      │    :8443      │
     └─────────────┘      └───────────────┘      └───────────────┘
```

## Services

### API Gateway (:3000)
- JWT validation via Keycloak JWKS
- Tenant ID injection into every downstream request
- Request logging to Kafka `bpm.gateway.requests`
- Dashboard aggregation (parallel calls to 3 services)

### Org Service (:3001)
- Multi-tenant org hierarchy: Company → Division → Department → Section → Team
- Materialized path for efficient tree queries
- Manager chain resolution (used by approval resolver)
- Users, Positions, Roles management

### Approval Service (:3002)
- **Core engine**: resolves approver chains from org hierarchy + roles + delegations
- Policy types: `hierarchy`, `role`, `specific_user`, `org_unit_manager`, `parallel`
- Conditional steps: evaluate `>=`, `<=`, `>`, `<`, `=`, `!=`, `in`, `not_in`
- Delegation substitution (date-range based)
- Immutable decision snapshots in JSONB

### BPM Orchestrator (:3003)
- Process definitions with BPMN 2.0 XML storage
- Lightweight BPMN parser (no Flowable/Camunda dependency)
- Token-based process execution: startEvent → userTask → gateway → endEvent
- Exclusive, parallel, and inclusive gateway support
- Task SLA breach detection (5-minute polling scheduler)

### Case Service (:3004)
- ITIL case types: Incident, Problem, Change, Request, Alarm
- Auto-generated case numbers: INC1001, CHG1001, etc.
- State machine with valid transition enforcement
- SLA calculation by type × priority (e.g. Critical Incident = 1h)
- MinIO-backed file attachments
- Work notes / comments

### Integration Hub (:3005)
- Connector types: REST, Webhook, Kafka Producer, Cron
- Variable interpolation in URL templates: `{{caseId}}`
- Bearer/Basic auth support for REST connectors
- Cron scheduling with `every_Xm` / `every_Xh` patterns
- Full execution log with request/response payloads
- Kafka consumer: triggers webhooks on `bpm.case.created` events

### Notification Service (:3006)
- Handlebars template rendering
- In-app notifications + email (SMTP optional)
- Kafka consumer for all `bpm.*` events
- Unread count API for badge display
- Mark single/all as read

## Database Schema

| Migration | Contents |
|-----------|----------|
| 001 | Tenants, Org Units, Positions, Roles, Users, Assignments |
| 002 | Approval Policies, Instances, Decisions, Delegations |
| 003 | Process Definitions, Process Instances, Tasks |
| 004 | Cases, Case Sequences, Comments, Attachments |
| 005 | Connectors, Connector Logs, Notification Templates, Notifications |
| 006 | Audit Log (immutable — SQL rules prevent UPDATE/DELETE) |

## Kafka Topics

| Topic | Publisher | Consumers |
|-------|-----------|-----------|
| `bpm.gateway.requests` | API Gateway | — |
| `bpm.org.changed` | Org Service | — |
| `bpm.process.started` | BPM Orchestrator | Notification |
| `bpm.process.completed` | BPM Orchestrator | — |
| `bpm.task.created` | BPM Orchestrator | Notification |
| `bpm.task.sla_breach` | BPM Orchestrator | Notification |
| `bpm.task.claimed` | BPM Orchestrator | — |
| `bpm.task.completed` | BPM Orchestrator | — |
| `bpm.approvals` | Approval Service | Notification |
| `bpm.case.created` | Case Service | Notification, Integration Hub |
| `bpm.case.sla_breach` | Case Service | Notification |
| `bpm.case.assigned` | Case Service | Notification |
| `bpm.service.task` | BPM Orchestrator | Integration Hub |
| `bpm.connectors.updated` | Integration Hub | — |

## Approval Matrix

Policies define ordered steps. Each step has:

```json
{
  "order": 1,
  "name": "Line Manager Approval",
  "type": "hierarchy",
  "approver_level": 1,
  "condition": {
    "field": "amount",
    "operator": ">=",
    "value": 500
  },
  "sla_hours": 24,
  "escalation_hours": 48
}
```

**Step types:**
- `hierarchy` — resolves to manager N levels up from requester
- `role` — any user with the specified role
- `specific_user` — a named user UUID
- `org_unit_manager` — manager of a specific org unit

## Frontend Pages

| Page | Path | Description |
|------|------|-------------|
| Dashboard | `/dashboard` | Stats, charts, SLA breach alerts |
| Work Inbox | `/inbox` | My tasks, task pool, pending approvals, notifications |
| Cases | `/cases` | ITIL case list with filters |
| Case Detail | `/cases/:id` | Full case view, status transitions, work notes |
| Create Case | `/cases/new` | New incident/change/request/etc |
| Process Studio | `/processes` | BPMN process definitions list |
| BPMN Editor | `/processes/:id/studio` | bpmn-js visual editor |
| Approval Policies | `/approvals/policies` | Policy list & viewer |
| Approval Instances | `/approvals/instances` | Pending approvals with decide button |
| Org Structure | `/org` | Org tree, users, roles, positions |
| Audit Log | `/audit` | Immutable audit trail with filters |
| Connectors | `/admin/connectors` | REST/Webhook/Kafka/Cron connector management |

## Adding a New Process Template

1. Navigate to **Process Studio** → **New Process**
2. Enter a name and slug (e.g. `employee_onboarding`)
3. The bpmn-js editor opens with a starter template
4. Design your process flow (startEvent → userTasks → gateways → endEvent)
5. Click **Save** then **Publish** to make it active
6. Start instances via `POST /api/v1/processes/instances` with `{ "slug": "employee_onboarding" }`

## Security Model

- All requests authenticated via Keycloak JWT (JWKS validation)
- `X-Tenant-ID` header injected by API Gateway from JWT claim
- Every downstream service reads tenant from header (never from user input)
- Parameterized SQL queries throughout (no string interpolation)
- Audit log is append-only (PostgreSQL RULE prevents UPDATE/DELETE)
- MinIO presigned URLs expire in 1 hour

## Environment Variables

Key variables set in `docker-compose.yml`:

| Variable | Default | Description |
|----------|---------|-------------|
| `DATABASE_URL` | postgres://... | PostgreSQL connection string |
| `KAFKA_BROKERS` | kafka:9092 | Kafka bootstrap servers |
| `KEYCLOAK_URL` | http://keycloak:8080 | Keycloak base URL |
| `KEYCLOAK_REALM` | bpm | Realm name |
| `KEYCLOAK_CLIENT_ID` | bpm-backend | Backend client |
| `KEYCLOAK_CLIENT_SECRET` | bpm-backend-secret-2024 | Backend client secret |
| `MINIO_ENDPOINT` | minio | MinIO hostname |
| `MINIO_ACCESS_KEY` | minioadmin | MinIO access key |
| `MINIO_SECRET_KEY` | minioadmin | MinIO secret key |
| `SMTP_HOST` | (unset) | Optional: SMTP for email notifications |

## Troubleshooting

```bash
# View all service logs
docker compose logs -f

# Check service health
docker compose ps

# Reset database (WARNING: destroys all data)
docker compose down -v && docker compose up -d

# Access PostgreSQL directly
docker exec -it bpm-postgres psql -U bpmuser -d bpm

# View Kafka topics
docker exec -it bpm-kafka kafka-topics.sh --bootstrap-server localhost:9092 --list
```
