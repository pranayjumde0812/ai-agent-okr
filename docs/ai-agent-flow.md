# OKR AI App Workflow

This document describes the workflow we created and applied in this app.

The app supports two working modes:

- `Applied/recommended mode`: this repo acts as an OKR tool server for OpenClaw
- `Legacy compatibility mode`: this repo directly handles Telegram webhook messages through `/ai`

## Workflow Summary

The applied design is a hybrid workflow:

1. User authenticates with email + OTP
2. A session is stored against `userId` or `telegramUserId`
3. The request is routed in one of two ways:
4. In tool-server mode, OpenClaw calls a specific `/tools/...` endpoint
5. In legacy mode, `/ai` decides whether the message is auth, help, logout, strategy, or an OKR action
6. Backend business data always comes from the OKR backend APIs
7. AI is used for intent planning and response generation, not as a source of truth

## Applied Architecture

### Mode 1. Tool server for OpenClaw

This is the workflow we should treat as the main production path:

1. OpenClaw receives a Telegram or chat message
2. OpenClaw decides which business action is needed
3. OpenClaw calls this app through `/tools/...`
4. This app validates auth from either:
5. `Authorization: Bearer <token>`
6. or stored session by `userId` / `telegramUserId`
7. The controller calls the correct backend service
8. The app returns structured JSON back to OpenClaw

Main endpoints:

```text
GET /tools/capabilities
POST /tools/auth/send-otp
POST /tools/auth/verify-otp
POST /tools/auth/logout
GET /tools/profile
GET /tools/objectives
POST /tools/objectives
PATCH /tools/objectives/progress
POST /tools/key-results
GET /tools/departments
POST /tools/department-objectives
GET /tools/department-objectives
POST /tools/department-objectives/task-key-result
POST /tools/strategy/advice
POST /tools/strategy/department-alignment
```

### Mode 2. Direct Telegram webhook through `/ai`

This mode is still active and useful for testing or backwards compatibility:

1. Telegram sends a message to `POST /ai`
2. `controllers/ai.controller.js` reads:
3. message text
4. Telegram user id
5. current session
6. recent chat history
7. The controller checks message type in this order:
8. help command
9. logout command
10. email input for OTP send
11. OTP input for OTP verify
12. unauthenticated request
13. authenticated business request
14. For authenticated business requests, `runAgent()` plans the action
15. The selected tool/service runs against backend APIs or Ollama
16. A final natural-language reply is sent back to Telegram

## End-to-End User Workflow

### A. Login workflow

This is the same core login flow in both `/login` and `/tools/auth/...`, and similar logic also exists in `/ai`.

1. User provides email
2. App calls `sendOtp(email)`
3. App stores the email in session using the user id
4. User provides OTP
5. App calls `verifyOtp(email, otp)`
6. App stores:
7. access token
8. organization id when available
9. role metadata
10. User is now authenticated for later OKR actions

Relevant files:

- [controllers/auth.controller.js](/home/admin1/PROJECTS-QQ/OKR-AI/ai-agent-okr/controllers/auth.controller.js:1)
- [controllers/tools.controller.js](/home/admin1/PROJECTS-QQ/OKR-AI/ai-agent-okr/controllers/tools.controller.js:1)
- [services/auth.service.js](/home/admin1/PROJECTS-QQ/OKR-AI/ai-agent-okr/services/auth.service.js:1)
- [utils/session.store.js](/home/admin1/PROJECTS-QQ/OKR-AI/ai-agent-okr/utils/session.store.js:1)

### B. Objective management workflow

Once logged in, the user or OpenClaw can:

1. Fetch objectives
2. Create one or more organization objectives
3. Create a key result under an objective
4. Update objective progress

The flow is:

1. Request arrives at `/tools/...` or `/ai`
2. Token is resolved from header or stored session
3. Objective controller/service validates required fields
4. Backend OKR API is called
5. Response is returned as JSON or converted into Telegram-friendly text

Relevant files:

- [services/objective.service.js](/home/admin1/PROJECTS-QQ/OKR-AI/ai-agent-okr/services/objective.service.js:1)
- [controllers/tools.controller.js](/home/admin1/PROJECTS-QQ/OKR-AI/ai-agent-okr/controllers/tools.controller.js:1)
- [services/agent.service.js](/home/admin1/PROJECTS-QQ/OKR-AI/ai-agent-okr/services/agent.service.js:1)

### C. Department workflow

The app also supports department-level planning:

1. List departments
2. Create department objectives linked to an organization objective
3. Fetch department objectives
4. Create a task + key result under a department objective

Important applied behavior:

1. If the user gives an organization objective name instead of an id, the app tries to resolve it
2. If the user gives a department objective name instead of an id, the app tries to match it before creating the task/key result

Relevant files:

- [services/department.service.js](/home/admin1/PROJECTS-QQ/OKR-AI/ai-agent-okr/services/department.service.js:1)
- [services/agent.service.js](/home/admin1/PROJECTS-QQ/OKR-AI/ai-agent-okr/services/agent.service.js:1)

### D. Strategy workflow

The app has two AI advisory flows:

1. `strategy_advice`
2. `department_alignment`

Applied flow:

1. Load organization profile from backend
2. Load department list from backend
3. Build structured prompt context
4. Ask Ollama for practical OKR advice
5. Return readable guidance
6. If the advice contains suggested organization objectives, store them in session
7. If the user later says to create all suggested objectives, the app can create them in bulk

This is handled in [services/agent.service.js](/home/admin1/PROJECTS-QQ/OKR-AI/ai-agent-okr/services/agent.service.js:1).

## Legacy AI Decision Workflow

In `/ai`, the applied decision tree is:

```text
Incoming Telegram message
-> help?
-> logout?
-> email input while logged out?
-> OTP input while logged out?
-> not logged in?
-> run AI planner
-> execute backend action or strategy generation
-> send final Telegram reply
```

The planner can choose actions such as:

- `create_objective`
- `create_bulk_objectives`
- `create_department_objective`
- `get_department_objectives`
- `create_department_task_key_result`
- `create_key_result`
- `update_objective_progress`
- `get_objectives`
- `get_profile`
- `get_departments`
- `strategy_advice`
- `department_alignment`
- `send_help`
- `ask_clarification`
- `general_reply`

## Error and Fallback Workflow

The app already applies these fallback behaviors:

1. If no session exists during OTP verify, auth endpoints return an error
2. If auth expires, the stored auth session is cleared
3. If the backend or token fails, tool endpoints return safe JSON errors
4. If Ollama is unreachable in `/ai`, the user gets a specific message about Ollama connectivity
5. If the AI cannot confidently identify an objective, it asks for clarification instead of guessing

## Health Workflow

Use:

```text
GET /health
```

This checks:

1. backend reachability
2. Ollama reachability
3. configured model readiness
4. session-store status

## File Map

- [server.js](/home/admin1/PROJECTS-QQ/OKR-AI/ai-agent-okr/server.js:1): app bootstrap and route mounting
- [routes/auth.routes.js](/home/admin1/PROJECTS-QQ/OKR-AI/ai-agent-okr/routes/auth.routes.js:1): direct login endpoints
- [routes/ai.routes.js](/home/admin1/PROJECTS-QQ/OKR-AI/ai-agent-okr/routes/ai.routes.js:1): Telegram-compatible AI entrypoint
- [routes/tools.routes.js](/home/admin1/PROJECTS-QQ/OKR-AI/ai-agent-okr/routes/tools.routes.js:1): applied tool-server endpoints
- [controllers/auth.controller.js](/home/admin1/PROJECTS-QQ/OKR-AI/ai-agent-okr/controllers/auth.controller.js:1): OTP login flow
- [controllers/ai.controller.js](/home/admin1/PROJECTS-QQ/OKR-AI/ai-agent-okr/controllers/ai.controller.js:1): webhook orchestration
- [controllers/tools.controller.js](/home/admin1/PROJECTS-QQ/OKR-AI/ai-agent-okr/controllers/tools.controller.js:1): structured business tools
- [services/agent.service.js](/home/admin1/PROJECTS-QQ/OKR-AI/ai-agent-okr/services/agent.service.js:1): AI planning, execution, and strategy support
- [services/auth.service.js](/home/admin1/PROJECTS-QQ/OKR-AI/ai-agent-okr/services/auth.service.js:1): backend auth integration
- [services/objective.service.js](/home/admin1/PROJECTS-QQ/OKR-AI/ai-agent-okr/services/objective.service.js:1): organization objective operations
- [services/department.service.js](/home/admin1/PROJECTS-QQ/OKR-AI/ai-agent-okr/services/department.service.js:1): department objective operations
- [services/health.service.js](/home/admin1/PROJECTS-QQ/OKR-AI/ai-agent-okr/services/health.service.js:1): readiness checks
- [utils/session.store.js](/home/admin1/PROJECTS-QQ/OKR-AI/ai-agent-okr/utils/session.store.js:1): session and conversation storage

## Recommended Usage

For the workflow we applied, use the app like this:

1. Start the server
2. Check `GET /health`
3. Use `/tools/capabilities` to confirm available actions
4. Authenticate with OTP through `/tools/auth/send-otp` and `/tools/auth/verify-otp`
5. Let OpenClaw call the OKR tool endpoints for business actions
6. Keep `/ai` available only if you still want direct Telegram webhook compatibility

That keeps authentication deterministic, business actions reliable, and AI focused on planning and guidance instead of owning the entire workflow.
