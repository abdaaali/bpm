# Launch process definitions

BPMN lifecycles for the first-wave processes, published via the API gateway
(respecting process-version safety — each publish creates a new version; running
instances keep their pinned version).

| Process | slug | Highlights |
|---|---|---|
| Incident Management | `incident_management` | Triage → Assign → Investigate → Resolve → Close (seeded) |
| Fault Management | `fault_management` | Validate → Classify → Assign → Diagnose → (resolve \| **Exception** phase: request → review → monitor) |
| Change Management | `change_management` | Assess → **CAB approval** (delegated to approval-service) → Implement → Validate → Close |

## Publish / update
Run against a running stack (needs an admin token; uses the gateway):
```bash
python3 infra/processes/publish_launch_processes.py
```
Auto-started per case type via `case-service` `TYPE_PROCESS` (incident/fault/change/request).
Each rides C1 (case⇄process sync), C2 (approval delegation), C3 (routing), C4 (SLA).
