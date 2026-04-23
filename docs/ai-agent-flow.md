# OKR AI Agent

This project now works as a Telegram-based AI agent, not just a fixed command bot.

## What it is

The bot receives Telegram messages on `POST /ai`, understands the user's intent with your local Ollama model, decides which backend action to use, calls that backend tool, and then replies in natural language.

It is a hybrid AI agent:

- Login and OTP are handled deterministically for reliability.
- After login, normal user requests are handled by the AI agent.
- The AI agent chooses from backend tools instead of relying only on exact keyword matches.

## Main flow

### 1. Telegram sends a webhook request

Telegram sends updates to your server webhook.

Your OpenClaw or Telegram webhook config should point to:

```text
POST /ai
```

In this project, that route is mounted in [server.js](/home/admin1/PROJECTS-QQ/OKR-AI/ai-agent-okr/server.js:1) and handled by [routes/ai.routes.js](/home/admin1/PROJECTS-QQ/OKR-AI/ai-agent-okr/routes/ai.routes.js:1).

### 2. Auth flow happens first

Handled in [controllers/ai.controller.js](/home/admin1/PROJECTS-QQ/OKR-AI/ai-agent-okr/controllers/ai.controller.js:1).

- If the user sends an email address, the bot sends OTP.
- If the user sends the OTP, the bot verifies it.
- The access token is stored in memory in [utils/session.store.js](/home/admin1/PROJECTS-QQ/OKR-AI/ai-agent-okr/utils/session.store.js:1).

### 3. AI agent takes over

After login, user messages are sent to [services/agent.service.js](/home/admin1/PROJECTS-QQ/OKR-AI/ai-agent-okr/services/agent.service.js:1).

The agent:

1. Reads the current message
2. Reads recent conversation history
3. Sends the request to Ollama
4. Lets the model choose the intended action
5. Executes the selected backend tool
6. Sends the tool result back to the model for a final natural reply
7. Returns a natural-language reply to Telegram

### 4. Backend tools available to the agent

The agent can currently use these tools:

- `create_objective`
- `get_objectives`
- `get_profile`
- `get_departments`
- `send_help`

Those tools map to your existing backend services:

- [services/objective.service.js](/home/admin1/PROJECTS-QQ/OKR-AI/ai-agent-okr/services/objective.service.js:1)
- [services/auth.service.js](/home/admin1/PROJECTS-QQ/OKR-AI/ai-agent-okr/services/auth.service.js:1)
- [services/department.service.js](/home/admin1/PROJECTS-QQ/OKR-AI/ai-agent-okr/services/department.service.js:1)

## How the bot behaves

### Before login

The bot will ask the user to log in first by sending their email.

Example:

```text
user: hi
bot: Please login first by sending your email address.
```

### During login

Example:

```text
user: user@company.com
bot: OTP sent to your email

user: 123456
bot: Login successful
```

### After login

The bot should behave like an assistant, not a rigid command parser.

Examples:

```text
user: show my objectives
user: list all my current okrs
user: create an objective for improving customer retention this quarter
user: show my organization profile
user: list departments with progress
```

The user does not need to use one exact fixed command anymore.

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
OLLAMA_MODEL=openclaw:cloud
```

### Step 3. Configure Telegram webhook

Your Telegram/OpenClaw webhook must send updates to:

```text
http://your-server-url/ai
```

If you are using a reverse proxy or public tunnel, use that public URL.

### Step 4. Talk to the bot in Telegram

Suggested first test:

```text
/start
your-email@example.com
123456
show my profile
create an objective for improving sales this quarter
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

## Current limitations

- Session storage is in-memory only. If the server restarts, login sessions are lost.
- Conversation history is also in-memory.
- Ollama must be running locally or on the configured host.
- If backend APIs change response shape, the tool formatters may need updates.

## Files involved

- [server.js](/home/admin1/PROJECTS-QQ/OKR-AI/ai-agent-okr/server.js:1): app bootstrap and route mounting
- [routes/ai.routes.js](/home/admin1/PROJECTS-QQ/OKR-AI/ai-agent-okr/routes/ai.routes.js:1): `/ai` route
- [controllers/ai.controller.js](/home/admin1/PROJECTS-QQ/OKR-AI/ai-agent-okr/controllers/ai.controller.js:1): webhook controller and auth gating
- [services/agent.service.js](/home/admin1/PROJECTS-QQ/OKR-AI/ai-agent-okr/services/agent.service.js:1): Ollama-based planning and action flow
- [services/ollama.service.js](/home/admin1/PROJECTS-QQ/OKR-AI/ai-agent-okr/services/ollama.service.js:1): Ollama client
- [utils/session.store.js](/home/admin1/PROJECTS-QQ/OKR-AI/ai-agent-okr/utils/session.store.js:1): session and chat history

## How to extend it

To add more agent skills:

1. Create a new service for the backend API
2. Add a tool definition in `services/agent.service.js`
3. Add the matching executor case in `executeTool`
4. Update the agent instructions so the model knows when to use it

Examples of future tools:

- create key result
- get dashboards
- update objective progress
- fetch team performance summary
