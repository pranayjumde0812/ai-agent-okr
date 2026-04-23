# OKR Tool Server

This project now supports two modes:

- recommended: OpenClaw uses this repo as an OKR tool server
- legacy compatibility: Telegram webhook mode through `/ai`

## Recommended architecture

For your current setup, the recommended architecture is:

- Telegram handled by OpenClaw Gateway
- agent reasoning handled by OpenClaw
- this repo exposes OKR business capabilities as HTTP tool endpoints
- backend business data still comes from your OKR backend on port `3000`

That means OpenClaw should be the main agent, and this repo should focus on tool execution.

## Main flow

### 1. OpenClaw calls the tool server

OpenClaw can call this repo through `/tools/...` endpoints.

Core endpoints:

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
POST /tools/strategy/advice
POST /tools/strategy/department-alignment
```

These routes are mounted in [server.js](/home/admin1/PROJECTS-QQ/OKR-AI/ai-agent-okr/server.js:1) and implemented in [routes/tools.routes.js](/home/admin1/PROJECTS-QQ/OKR-AI/ai-agent-okr/routes/tools.routes.js:1).

### 2. Auth flow

Handled in [controllers/tools.controller.js](/home/admin1/PROJECTS-QQ/OKR-AI/ai-agent-okr/controllers/tools.controller.js:1).

- `send-otp` sends the OTP.
- `verify-otp` verifies it and returns a token.
- The access token and chat history are stored in [utils/session.store.js](/home/admin1/PROJECTS-QQ/OKR-AI/ai-agent-okr/utils/session.store.js:1).
- Sessions are persisted to disk, so restart no longer logs every user out immediately.

### 3. Tool execution

OpenClaw can then call tool endpoints with either:

- `Authorization: Bearer <token>`
- or a stored `userId` / `telegramUserId`

Supported tool capabilities:

- `create_objective`
- `create_key_result`
- `update_objective_progress`
- `get_objectives`
- `get_profile`
- `get_departments`
- `strategy_advice`
- `department_alignment`

Those tools map to your existing backend services:

- [services/objective.service.js](/home/admin1/PROJECTS-QQ/OKR-AI/ai-agent-okr/services/objective.service.js:1)
- [services/auth.service.js](/home/admin1/PROJECTS-QQ/OKR-AI/ai-agent-okr/services/auth.service.js:1)
- [services/department.service.js](/home/admin1/PROJECTS-QQ/OKR-AI/ai-agent-okr/services/department.service.js:1)

### 4. Health and readiness

Health endpoint:

```text
GET /health
```

This returns:

- backend reachability
- Ollama reachability
- configured model availability
- session-store stats

## Legacy mode

Legacy Telegram webhook mode still exists on:

```text
POST /ai
```

This is kept for compatibility, but it is no longer the recommended long-term architecture if OpenClaw is already acting as the main Telegram agent.

## Telegram usage

### Step 1. Start the server

```bash
npm start
```

### Step 2. Make sure `.env` is filled

Required values:

```env
PORT=6000
API_BASE_URL=http://127.0.0.1:3000/v1
TELEGRAM_BOT_TOKEN=your_telegram_bot_token
OLLAMA_BASE_URL=http://127.0.0.1:11434
OLLAMA_MODEL=gpt-oss:20b-cloud
SESSION_STORE_PATH=.data/sessions.json
SESSION_TTL_HOURS=168
KEY_RESULT_API_PATH=/key-result
OBJECTIVE_PROGRESS_API_PATH=/objective/progress
```

### Step 3. Configure OpenClaw to use the tool server

Use:

```text
GET  /tools/capabilities
```

to discover available tool routes.

If you still use legacy webhook mode, Telegram/OpenClaw webhook can point to:

```text
http://your-server-url/ai
```

If you are using a reverse proxy or public tunnel, use that public URL.

### Step 4. Talk to the bot in Telegram

If you are using legacy mode, suggested first test:

```text
/start
your-email@example.com
123456
show my profile
create an objective for improving sales this quarter
create a key result for my sales objective with target 25%
update my sales objective progress to 40%
```

If you are using the tool-server mode, test these HTTP endpoints first:

```text
GET /health
GET /tools/capabilities
POST /tools/auth/send-otp
POST /tools/auth/verify-otp
GET /tools/profile
GET /tools/objectives
```

## Behavior design

This is intentionally a hybrid agent, which is the safest structure for your app.

Why:

- Authentication is sensitive, so it should stay deterministic.
- Business actions can benefit from AI intent understanding.
- Backend data should still come from your APIs, not from the model's memory.

So the architecture is:

- deterministic auth
- AI intent understanding
- tool execution against your backend
- natural-language final response

In the recommended OpenClaw setup, the AI intent understanding moves to OpenClaw, and this repo focuses on tool execution.

## Current limitations

- Ollama must be running locally or on the configured host.
- If backend APIs change response shape, the tool formatters or write payloads may need updates.
- The key-result and progress-write endpoints are configurable because backend route shapes can differ by project.
- The current agent does not browse the internet yet. It can reason and suggest based on the model, but online research needs a dedicated search tool or external research API.

## Files involved

- [server.js](/home/admin1/PROJECTS-QQ/OKR-AI/ai-agent-okr/server.js:1): app bootstrap and route mounting
- [routes/tools.routes.js](/home/admin1/PROJECTS-QQ/OKR-AI/ai-agent-okr/routes/tools.routes.js:1): OKR tool endpoints for OpenClaw
- [controllers/tools.controller.js](/home/admin1/PROJECTS-QQ/OKR-AI/ai-agent-okr/controllers/tools.controller.js:1): tool-server HTTP handlers
- [routes/ai.routes.js](/home/admin1/PROJECTS-QQ/OKR-AI/ai-agent-okr/routes/ai.routes.js:1): `/ai` route
- [controllers/ai.controller.js](/home/admin1/PROJECTS-QQ/OKR-AI/ai-agent-okr/controllers/ai.controller.js:1): webhook controller and auth gating
- [services/agent.service.js](/home/admin1/PROJECTS-QQ/OKR-AI/ai-agent-okr/services/agent.service.js:1): Ollama-based planning and action flow
- [services/health.service.js](/home/admin1/PROJECTS-QQ/OKR-AI/ai-agent-okr/services/health.service.js:1): backend and Ollama readiness checks
- [services/ollama.service.js](/home/admin1/PROJECTS-QQ/OKR-AI/ai-agent-okr/services/ollama.service.js:1): Ollama client
- [utils/session.store.js](/home/admin1/PROJECTS-QQ/OKR-AI/ai-agent-okr/utils/session.store.js:1): session and chat history

## How to extend it

To add more agent skills:

1. Create a new service for the backend API
2. Add a tool definition in `services/agent.service.js`
3. Add the matching executor case in `executeTool`
4. Update the agent instructions so the model knows when to use it

Examples of future tools:

- get dashboards
- fetch team performance summary
- create initiatives
- update key result progress

## Strategic advice flow

The agent can be used in two different advisory modes:

### 1. Internal strategy mode

In this mode, the user asks for help such as:

```text
How can I use my objectives to grow my business?
What should my company goals be for this quarter?
How should I manage objectives across teams?
```

The agent can already answer these using:

- company profile data
- organization context
- conversation history
- general reasoning from the model

This works now, but the advice is based on the model and your internal context, not on live internet research.

Example prompts that work now:

```text
Suggest company objectives to increase revenue this quarter
How should I manage objectives to improve my business?
Create 3 organization OKRs for growth based on my company profile
```

### 2. Online research mode

If you want the agent to check the internet and then give suggestions, we need to add a web-search capability to the agent.

That future flow would be:

1. User asks for strategic guidance
2. Agent detects this is a research request
3. Agent calls a search tool
4. Agent summarizes market guidance, OKR references, or industry benchmarks
5. Agent converts findings into business objectives and key results
6. Agent suggests department-wise aligned objectives

Right now, step 3 is not implemented in the Telegram bot code.

## How to use objectives to improve business

A practical OKR approach is:

1. Start from one business outcome, not many
2. Define 1 to 3 organization objectives for a quarter
3. Assign 3 to 5 measurable key results per objective
4. Derive department objectives from the organization objective
5. Review progress every week and score monthly

General OKR guidance from Atlassian says strong OKRs usually follow these rules:

- define 1 to 3 objectives
- use 3 to 5 key results per objective
- keep key results measurable and outcome-oriented
- review progress regularly

Sources:

- Atlassian OKR Playbook: https://www.atlassian.com/team-playbook/plays/okrs
- Atlassian OKR Guide: https://www.atlassian.com/agile/agile-at-scale/okr
- Workpath alignment article: https://www.workpath.com/en/magazine/alignment-through-okrs

## Example organization objective to department objective flow

Suppose the company-level objective is:

```text
Objective: Increase profitable revenue growth in Q3
```

Possible company key results:

- Increase quarterly revenue from 10 Cr to 13 Cr
- Improve gross margin from 28% to 34%
- Increase repeat customer rate from 32% to 42%

That organization objective can then be translated into department objectives like this:

### Sales department

```text
Objective: Win more qualified revenue faster
```

Key result examples:

- Increase qualified pipeline coverage from 2.1x to 3.0x
- Improve win rate from 18% to 24%
- Reduce average sales cycle from 45 days to 32 days

### Marketing department

```text
Objective: Generate higher-converting demand for revenue growth
```

Key result examples:

- Increase marketing-qualified leads by 40%
- Improve landing page conversion from 3.2% to 5.5%
- Reduce cost per qualified lead by 20%

### Customer success / support

```text
Objective: Increase retention and expansion from existing customers
```

Key result examples:

- Reduce churn from 6% to 4%
- Increase upsell revenue by 25%
- Improve NPS from 38 to 50

### Product / operations

```text
Objective: Improve delivery quality and speed to support growth
```

Key result examples:

- Reduce onboarding time from 10 days to 4 days
- Reduce critical issue resolution time from 48 hours to 12 hours
- Improve release success rate from 92% to 98%

## How to derive department objectives from an organization objective

Use this logic:

1. Define the company outcome clearly
2. Ask which departments directly influence that outcome
3. For each department, define its contribution in one sentence
4. Convert that contribution into one department objective
5. Add measurable key results owned by that department

Simple formula:

```text
Organization objective -> Department contribution -> Department objective -> Department key results
```

Example:

```text
Organization objective:
Improve customer retention this quarter

Sales contribution:
Sell to better-fit customers

Customer success contribution:
Improve onboarding and adoption

Product contribution:
Reduce friction in key workflows
```

Then the department objectives become aligned without copying the same wording everywhere.

Example prompt that works now:

```text
My organization objective is to improve customer retention this quarter. What should be the objectives for sales, customer success, product, and operations?
```

## Recommended management cadence

To manage these objectives well:

- Set OKRs quarterly
- Review leading indicators weekly
- Review KR score monthly
- Keep organization objectives stable during the quarter unless strategy changes
- Allow department initiatives to change if KRs are off track

## What the agent can do next

The current bot can already help with:

- suggesting organization objectives from your business context
- translating organization objectives into department objectives
- helping rewrite vague goals into measurable OKRs

## Persistence and health

Sessions now persist on disk and expire based on `SESSION_TTL_HOURS`.

Default behavior:

- session store file: `.data/sessions.json`
- session TTL: 168 hours
- store file is ignored by Git

The app also performs startup checks for:

- backend API reachability
- Ollama API reachability
- configured Ollama model presence

You can manually inspect readiness with:

```text
GET /health
```

## New Telegram prompts

These prompts are now supported:

```text
create a key result for my revenue objective with target 20%
add a key result to increase repeat customers for my retention objective
update my onboarding objective progress to 60%
set progress of increase sales objective to 45%
```

If you want full online-research-based strategic recommendations inside Telegram, the next enhancement is to add a research/search tool to the agent.
