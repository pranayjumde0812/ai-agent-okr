# Telegram API Mapping and Scope

This document tracks the Telegram-facing API mapping for `ai-agent-okr` against:

- `EasyOKR.postman_collection.json`
- `easyokr-backend`
- `easyokr-management`
- `easyokr-department`

## Scope

The current Telegram agent scope is:

- Management login with OTP
- Department login with OTP
- Organization profile and profile-details lookup
- Department profile/current department lookup
- Organization objective listing and creation
- Department objective listing and creation
- Department task + key result creation
- Department objective key-result listing
- Management-side task weightage update for department objectives
- Dashboard year filters
- Dashboard objective growth
- Dashboard department growth
- Dashboard yearly growth
- Score-management schedule read/update
- Score edit status lookup
- Strategy suggestions for organization objectives
- AI-generated department alignment suggestions

## Collection to Agent Mapping

These collection/backend APIs are now mapped into `ai-agent-okr`:

- `POST /auth/sign-in/organization`
- `POST /auth/verify-otp/organization`
- `POST /auth/sign-in/department`
- `POST /auth/verify-otp/department`
- `POST /auth/sign-out`
- `GET /organization/current-organization`
- `GET /organization/profile-details`
- `GET /department/profile-details`
- `GET /dashboard/current-department`
- `GET /dashboard/current-department/objectives`
- `GET /dashboard/departments`
- `GET /objective`
- `POST /objective`
- `GET /department-objective`
- `POST /department-objective/add-department-objective`
- `POST /key-result/add-key-result`
- `GET /dashboard/department-objective/:id/key-results`
- `GET /dashboard/dept-objective/:id/key-results`
- `PUT /dashboard/add-weightage/key-result/:id`
- `GET /stats/year-filter`
- `GET /stats/objective-growth/:year/:quarter`
- `GET /stats/department-growth/:year/:quarter`
- `GET /stats/yearly-growth/:year`
- `GET /stats/department/year-filter`
- `GET /stats/department/objective-growth/:year/:quarter`
- `GET /stats/department/yearly-growth/:year`
- `PUT /setting/score-management/schedule`
- `GET /setting/score-management/schedule`
- `GET /setting/check-score-edit-status`

## Agent Commands

Natural language is supported, but these patterns are the most reliable:

- `my@email.com`
- `department my@email.com`
- `1234`
- `show my objectives`
- `create objective improve retention`
- `show company profile`
- `show my profile details`
- `list departments`
- `show current department`
- `show current department objectives`
- `create a department objective for sales under Improve Revenue`
- `add a task and key result to my onboarding department objective`
- `add a task and key result`
- `suggest tasks and key results for my onboarding department objective`
- `if I am organization user, create task and key result`
- `show key results for my onboarding department objective`
- `show dashboard year filters`
- `show objective growth for 2025-26 quarter 2`
- `show department growth for 2025-26 quarter 2`
- `show yearly growth for 2025-26`
- `show my score-management schedule`
- `update the schedule to Tuesday 14:30:00 in Asia/Kolkata with a 24 hour timer`
- `set up my meeting schedule`
- `show score edit status`
- `add weightage to tasks under my AI department objective`
- `allocate task weightage with ai`
- `suggest company objectives for next quarter`
- `break this objective into department objectives`

## Tool Endpoints

Structured tool-mode endpoints available in `ai-agent-okr`:

- `POST /tools/auth/send-otp`
- `POST /tools/auth/verify-otp`
- `POST /tools/auth/logout`
- `GET /tools/profile`
- `GET /tools/profile/details`
- `GET /tools/objectives`
- `POST /tools/objectives`
- `POST /tools/key-results`
- `PATCH /tools/objectives/progress`
- `GET /tools/departments`
- `GET /tools/departments/current`
- `GET /tools/departments/current/objectives`
- `GET /tools/department-objectives`
- `POST /tools/department-objectives`
- `POST /tools/department-objectives/task-key-result`
- `GET /tools/department-objectives/:id/key-results`
- `PUT /tools/department-objectives/key-results/:id/weightage`
- `GET /tools/dashboard/year-filters`
- `GET /tools/dashboard/objective-growth?year=YYYY-YY&quarter=Q`
- `GET /tools/dashboard/department-growth?year=YYYY-YY&quarter=Q`
- `GET /tools/dashboard/yearly-growth?year=YYYY-YY`
- `GET /tools/settings/schedule`
- `PUT /tools/settings/schedule`
- `GET /tools/settings/score-edit-status`
- `POST /tools/strategy/advice`
- `POST /tools/strategy/department-alignment`

## Notes for AI Agent Behavior

Use these operator rules while prompting or extending the bot:

- Prefer backend APIs as source of truth.
- Use AI for intent detection, objective drafting, and department-alignment suggestions.
- If login role is unclear, the bot auto-tries management first and falls back to department.
- If a user wants department login explicitly, they should send `department user@email.com`.
- Management-side department-objective fetch now uses `GET /department-objective?departmentId=<departmentId>`.
- For dashboard growth queries, capture both `year` and `quarter` when needed.
- Schedule creation/update needs exactly these fields: `dayName`, `meetingTime`, `timezone`, and `timeSlotHoursBeforeMeeting`.
- Telegram now supports a guided schedule flow with buttons for day, timezone, and timer, followed by one final time entry in `HH:mm:ss`.
- Telegram time entry also accepts friendlier input like `14:30`, `2:30 PM`, or `2 PM`, which the agent converts to backend `HH:mm:ss`.
- For department-objective task actions, resolve by exact objective name before guessing.
- If the task/key-result request does not clearly identify the department objective, the bot now shows department-objective selection buttons and then asks for `task | key result`.
- After a department objective is selected, the bot now suggests task and key-result pairs, with buttons to create one, create all, or switch to manual entry.
- For organization login, the guided flow is now: select department -> select department objective -> select suggested task/KR -> create or close.
- For management weightage changes, the guided flow is now: select department -> select department objective -> choose `Manual Weightage` or `AI Suggest Weightage`.
- Manual weightage uses the backend validation rule that the total across all tasks under one department objective must stay at `100%` or below.
- AI weightage mode generates a full task distribution, then applies it safely through the backend by resetting the selected department objective's task weightage before applying the final allocation.

## Suggestions to Make This Feel More Like a Stronger AI Agent

- Add a dedicated action memory layer so the bot remembers the last selected objective, department, and growth period.
- Introduce role-aware prompts so department users do not get management-only suggestions.
- Add deterministic entity extraction before LLM planning for year, quarter, objective name, and department name.
- Add write confirmations only for destructive or high-impact actions.
- Add audit logs per Telegram user for created objectives, department objectives, and key results.
- Add a command registry document if the team wants more predictable bot behavior in production.

## Not Yet Covered

These collection areas are still outside the Telegram agent scope in this pass:

- Payment and Razorpay flows
- Department setup-profile onboarding
- Excel upload/download flows
- Invite acceptance flow
- Department current-score mutation flows
- Coupon/subscription/invoice flows

Those can be added next, but they are better treated as phase-2 because they need stricter confirmations and richer UI handling than basic Telegram text.
