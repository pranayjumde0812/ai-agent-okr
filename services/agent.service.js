const { chatWithModel } = require("./ollama.service");
const {
  createObjective,
  getObjectives,
  createKeyResult,
  updateObjectiveProgress,
} = require("./objective.service");
const {
  getCurrentOrganizationProfile,
  getProfileDetails,
} = require("./auth.service");
const {
  getDepartments,
  createDepartmentObjective,
  getDepartmentObjectives,
  createDepartmentTaskKeyResult,
  getCurrentDepartment,
  getCurrentDepartmentObjectives,
  getDepartmentObjectiveKeyResults,
  getDepartmentObjectivesForDepartment,
  addWeightageToKeyResult,
  updateCurrentScoreForKeyResult,
} = require("./department.service");
const {
  getYearFilters,
  getObjectiveGrowth,
  getDepartmentGrowth,
  getYearlyGrowth,
} = require("./stats.service");
const {
  getScheduleDetails,
  updateScheduleDetails,
  getScoreEditStatus,
} = require("./setting.service");
const config = require("../config/env");

const MAX_HISTORY_ITEMS = 8;

const AGENT_INSTRUCTIONS = `
You are OKR AI Agent for a Telegram bot connected to an OKR backend.

Your job is to help the user naturally, not force exact commands.
You can decide which tool to use based on user intent.

Rules:
- Be concise, clear, and action-oriented.
- If the user asks to create an objective, use the create_objective tool.
- If the user asks to create a department objective (an objective for a specific department under an organization objective), use create_department_objective.
- If the user asks to list, show, or search department objectives, use get_department_objectives.
- If the user asks to add a task with a key result under a department objective, use create_department_task_key_result.
- If the user asks to create a key result, add a KR, or define a measurable result for an objective, use create_key_result.
- If the user asks to update objective progress, change progress, or set completion percentage, use update_objective_progress.
- If the user asks to list, show, or fetch objectives, use the get_objectives tool.
- If the user asks about profile, organization details, company information, mission, or vision, use the get_profile tool.
- If the user asks for account profile details, owner details, or my-account details, use the get_profile_details tool.
- If the user asks about departments, team progress, or department list, use the get_departments tool.
- If the user asks about the current department, department account, or department-specific dashboard details, use get_current_department or get_current_department_objectives.
- If the user asks for year filters, dashboard objective growth, yearly growth, or department growth trends, use the dashboard stats tools.
- If the user asks for schedule details, meeting schedule, score-management schedule, timer details, or score edit status, use the schedule tools.
- If the user asks to create or update the schedule, require day, time, timezone, and timer hours before meeting.
- If the user asks to list tasks or key results under a department objective, use get_department_objective_key_results.
- If the user asks for business growth suggestions, OKR advice, strategic objectives, key results, or how to manage objectives, use strategy_advice.
- If the user asks how department objectives should support an organization objective, use department_alignment.
- If the user asks what you can do, use the send_help tool.
- If the user request is missing key information for creating an objective, ask a follow-up question instead of guessing.
- For create_department_objective, the user must provide or you must identify the organization objective it belongs to.
- For create_department_task_key_result, both a task name and key result name are needed, plus the department objective it belongs to.
- Never invent backend data. Use tools for backend data.
- If the user is not authenticated, explain that they need to log in by sending their email first.
`.trim();

const formatObjectives = (objectives) => {
  if (!objectives?.length) {
    return "No objectives found.";
  }

  return objectives
    .map((objective, index) => {
      return `${index + 1}. ${objective.objectiveName} - ${objective.description || "No description"}`;
    })
    .join("\n");
};

const formatProfile = (organization) => {
  return [
    `Name: ${organization.fullName || "-"}`,
    `Company: ${organization.companyName || "-"}`,
    `About: ${organization.aboutCompany || "-"}`,
    `Mission: ${organization.companyMission || "-"}`,
    `Vision: ${organization.companyVision || "-"}`,
    `Purpose: ${organization.purpose || "-"}`,
    `Solution: ${organization.solution || "-"}`,
  ].join("\n");
};

const formatDepartments = (departments) => {
  if (!departments?.length) {
    return "No departments found.";
  }

  return departments
    .map((department, index) => {
      return [
        `${index + 1}. ${department.departmentName || "-"}`,
        `Name: ${department.fullName || "-"}`,
        `Email: ${department.email || "-"}`,
        `Progress: ${department.progressPercentage ?? 0}%`,
      ].join("\n");
    })
    .join("\n\n");
};

const formatProfileDetails = (profileDetails) => {
  if (!profileDetails || typeof profileDetails !== "object") {
    return "No profile details found.";
  }

  return Object.entries(profileDetails)
    .filter(([, value]) => value !== null && value !== undefined && value !== "")
    .map(([key, value]) => {
      const label = key
        .replace(/([A-Z])/g, " $1")
        .replace(/_/g, " ")
        .replace(/\s+/g, " ")
        .trim();

      return `${label.charAt(0).toUpperCase()}${label.slice(1)}: ${value}`;
    })
    .join("\n");
};

const formatDepartmentObjectives = (departmentObjectives) => {
  if (!departmentObjectives?.length) {
    return "No department objectives found.";
  }

  return departmentObjectives
    .map((obj, index) => {
      return [
        `${index + 1}. ${obj.objective || obj.departmentObjective || "-"}`,
        `   Description: ${obj.description || "-"}`,
        `   Org Objective ID: ${obj.organizationObjectiveId || "-"}`,
        `   Department ID: ${obj.departmentId || "-"}`,
      ].join("\n");
    })
    .join("\n\n");
};

const formatCurrentDepartment = (department) => {
  if (!department || typeof department !== "object") {
    return "No current department details found.";
  }

  return [
    `Department: ${department.departmentName || department.fullName || "-"}`,
    `Owner: ${department.fullName || "-"}`,
    `Email: ${department.email || "-"}`,
    `Progress: ${department.progressPercentage ?? department.score ?? 0}%`,
    `Organization: ${department.organizationName || department.companyName || "-"}`,
  ].join("\n");
};

const formatDepartmentObjectiveKeyResults = (items) => {
  if (!items?.length) {
    return "No key results found for that department objective.";
  }

  return items
    .map((item, index) => {
      return [
        `${index + 1}. Task: ${item.objectiveInitiativeTask || item.task || item.taskName || "-"}`,
        `   Key Result: ${item.keyResult || item.keyResultName || "-"}`,
        `   Weightage: ${item.weightage ?? "-"}`,
        `   Current Score: ${item.currentScore ?? item.score ?? "-"}`,
      ].join("\n");
    })
    .join("\n\n");
};

const extractDepartmentObjectiveKeyResultItems = (payload) => {
  if (!payload) {
    return [];
  }

  if (Array.isArray(payload)) {
    return payload;
  }

  return payload.response || payload.keyResults || payload.tasks || payload.data || [];
};

const formatDashboardStats = (title, payload) => {
  if (payload === null || payload === undefined) {
    return `${title}: No data found.`;
  }

  if (Array.isArray(payload)) {
    if (!payload.length) {
      return `${title}: No data found.`;
    }

    return [
      `${title}:`,
      ...payload.map((item, index) => `${index + 1}. ${JSON.stringify(item)}`),
    ].join("\n");
  }

  if (typeof payload === "object") {
    return [
      `${title}:`,
      ...Object.entries(payload).map(([key, value]) => `${key}: ${JSON.stringify(value)}`),
    ].join("\n");
  }

  return `${title}: ${payload}`;
};

const toTitleCase = (value) => {
  const normalized = String(value || "").trim().toLowerCase();

  if (!normalized) {
    return "-";
  }

  return normalized.charAt(0).toUpperCase() + normalized.slice(1);
};

const formatTimeForDisplay = (value) => {
  const normalized = String(value || "").trim();

  if (!normalized) {
    return "-";
  }

  const timePartMatch = normalized.match(/(\d{2}):(\d{2})(?::(\d{2}))?$/);

  if (!timePartMatch) {
    return normalized;
  }

  const [, hourValue, minuteValue] = timePartMatch;
  let hours = Number(hourValue);
  const minutes = minuteValue;
  const meridiem = hours >= 12 ? "PM" : "AM";

  hours = hours % 12 || 12;

  return `${hours}:${minutes} ${meridiem}`;
};

const formatScheduleDetails = (scheduleDetails) => {
  if (!scheduleDetails || Object.keys(scheduleDetails).length === 0) {
    return "No score-management schedule has been configured yet.";
  }

  return [
    `Meeting day: Every ${toTitleCase(scheduleDetails.dayName)} each week`,
    `Meeting time: ${formatTimeForDisplay(scheduleDetails.meetingTimeTimezone || scheduleDetails.meetingTimeUtc)}`,
    `Timezone: ${scheduleDetails.timezone || "-"}`,
    `Score Window will open to add score before meeting: ${scheduleDetails.timeSlotHoursBeforeMeeting ?? "-"} hours`,
  ].join("\n");
};

const formatScoreEditStatus = (details) => {
  if (!details || typeof details !== "object") {
    return "No score edit status found.";
  }

  return [
    `Allow edit: ${details.allowEdit ? "Yes" : "No"}`,
    `Edit window end: ${details.endTime || "-"}`,
  ].join("\n");
};

const formatKeyResultCurrentScoreItems = (items) => {
  if (!items?.length) {
    return "No tasks found for this department objective.";
  }

  return items
    .map((item, index) => {
      return [
        `${index + 1}. Task: ${item.objectiveInitiativeTask || item.task || "-"}`,
        `   Key Result: ${item.keyResult || "-"}`,
        `   Last Two Week Scores: ${item.weekBeforeLastWeekScore ?? 0}, ${item.lastWeekScore ?? 0}`,
        `   Current Score: ${item.currentScore ?? 0}`,
      ].join("\n");
    })
    .join("\n\n");
};

const formatKeyResultWeightageItems = (items) => {
  if (!items?.length) {
    return "No tasks found for this department objective.";
  }

  const totalWeightage = items.reduce(
    (sum, item) => sum + Number(item.weightage || 0),
    0
  );

  return [
    `Current total allocated weightage: ${totalWeightage}%`,
    "",
    ...items.map((item, index) => [
      `${index + 1}. Task: ${item.objectiveInitiativeTask || item.task || "-"}`,
      `   Key Result: ${item.keyResult || "-"}`,
      `   Current Weightage: ${item.weightage ?? 0}%`,
    ].join("\n")),
  ].join("\n\n");
};

const HELP_TEXT = [
  "I can help you with your OKR workspace.",
  "Login tip: send `department your@email.com` if you want a department login.",
  "",
  "Examples:",
  '- "Create an objective for improving sales this quarter"',
  '- "Create these organization objectives: Improve retention | Grow revenue, and add department objectives for sales and support"',
  '- "Suggest company objectives for this quarter"',
  '- "Create all suggested objectives"',
  '- "Create objectives 1,3"',
  '- "Create a department objective for the AI team under my Use Of AI Agent objective"',
  '- "Show department objectives"',
  '- "Add a task and key result to my Test 1 department objective"',
  '- "Ask for task and KR suggestions for my onboarding department objective"',
  '- "If you are logged in as organization and ask to create task and KR, I will first show departments, then department objectives, then suggested task/KR pairs"',
  '- "After selecting a department objective button, choose a suggested task/KR or send: Prepare onboarding checklist | Complete onboarding checklist for 100% of new hires"',
  '- "Create a key result for my revenue objective"',
  '- "Update my onboarding objective progress to 60%"',
  '- "Show my objectives"',
  '- "Get my company profile"',
  '- "Show my profile details"',
  '- "List departments and progress"',
  '- "Show dashboard year filters"',
  '- "Show objective growth for 2025-26 quarter 2"',
  '- "Show yearly growth for 2025-26"',
  '- "Show my score-management schedule"',
  '- "Update the schedule to Tuesday 14:30:00 in Asia/Kolkata with a 24 hour timer"',
  '- "Set up my meeting schedule" and use the buttons for day, timezone, and timer',
  '- "For meeting time you can send 2:30 PM and I will convert it automatically"',
  '- "Show score edit status"',
  '- "Add weightage to tasks under a department objective"',
  '- "Manage task weightage for the AI department"',
  '- "Allocate task weightage with AI"',
  '- "Update current score for my department task"',
  '- "Add current score to my task" (department login only, and only when the score window is open)',
  '- "Show my current department objectives"',
  '- "Show key results for my onboarding department objective"',
  '- "Suggest company objectives to grow my business"',
  '- "Break this organization objective into department objectives"',
].join("\n");

const isCreateSuggestedObjectivesCommand = (message) => {
  const normalized = String(message || "").trim().toLowerCase();

  if (!normalized) {
    return false;
  }

  const includesCreate = normalized.includes("create");
  const includesObjective = normalized.includes("objective");
  const includesBulkReference =
    normalized.includes("all") ||
    normalized.includes("these") ||
    normalized.includes("them") ||
    normalized.includes("three") ||
    normalized.includes("suggested") ||
    normalized.includes("above") ||
    normalized.includes("those");

  return includesCreate && includesObjective && includesBulkReference;
};

const isAffirmativeSelectionCommand = (message) => {
  const normalized = String(message || "").trim().toLowerCase();

  return [
    "yes",
    "y",
    "yes create",
    "create them",
    "create it",
    "go ahead",
    "proceed",
    "confirm",
    "ok create",
    "okay create",
  ].includes(normalized);
};

const ORDINAL_WORD_TO_INDEX = {
  first: 1,
  second: 2,
  third: 3,
  fourth: 4,
  fifth: 5,
  sixth: 6,
  seventh: 7,
  eighth: 8,
  ninth: 9,
  tenth: 10,
};

const extractSelectionIndexes = (normalizedMessage, maxItems) => {
  const indexes = [];
  const numericMatches = normalizedMessage.match(/\d+/g) || [];
  const idMatches = normalizedMessage.match(/\bs(\d+)\b/gi) || [];

  numericMatches.forEach((value) => {
    const numericValue = Number(value);

    if (numericValue >= 1 && numericValue <= maxItems) {
      indexes.push(numericValue);
    }
  });

  idMatches.forEach((value) => {
    const numericValue = Number(String(value).replace(/[^0-9]/g, ""));

    if (numericValue >= 1 && numericValue <= maxItems) {
      indexes.push(numericValue);
    }
  });

  Object.entries(ORDINAL_WORD_TO_INDEX).forEach(([word, index]) => {
    const pattern = new RegExp(`\\b${word}\\b`, "i");

    if (pattern.test(normalizedMessage) && index <= maxItems) {
      indexes.push(index);
    }
  });

  return [...new Set(indexes)].sort((left, right) => left - right);
};

const extractSuggestedObjectiveSelection = ({
  message,
  suggestedObjectives = [],
  allowAffirmativeSelection = false,
}) => {
  const normalized = String(message || "").trim().toLowerCase();

  if (!normalized || !suggestedObjectives.length) {
    return null;
  }

  if (allowAffirmativeSelection && isAffirmativeSelectionCommand(normalized)) {
    return {
      selectedObjectives: suggestedObjectives,
      selectionLabel: "all",
    };
  }

  const includesCreateIntent =
    normalized.includes("create") ||
    normalized.includes("add") ||
    normalized.includes("make");

  if (!includesCreateIntent) {
    return null;
  }

  if (
    normalized.includes("all") ||
    normalized.includes("everything") ||
    normalized.includes("all of them") ||
    normalized.includes("all suggested")
  ) {
    return {
      selectedObjectives: suggestedObjectives,
      selectionLabel: "all",
    };
  }

  const indexes = extractSelectionIndexes(
    normalized,
    suggestedObjectives.length
  );

  if (!indexes.length) {
    return null;
  }

  return {
    selectedObjectives: indexes.map((index) => suggestedObjectives[index - 1]),
    selectionLabel: indexes.join(", "),
  };
};

const buildReplyKeyboard = (rows) => ({
  keyboard: rows.map((row) => row.map((text) => ({ text }))),
  resize_keyboard: true,
  one_time_keyboard: false,
});

const shortenButtonLabel = (text, maxLength = 28) => {
  const value = String(text || "").replace(/\s+/g, " ").trim();

  if (value.length <= maxLength) {
    return value;
  }

  return `${value.slice(0, maxLength - 1).trim()}...`;
};

const getObjectiveDisplayName = (objective) => {
  return (
    objective?.objectiveName ||
    objective?.objective ||
    objective?.departmentObjective ||
    "Objective"
  );
};

const buildObjectiveActionLabel = (prefix, objective) => {
  return `${prefix}: ${shortenButtonLabel(getObjectiveDisplayName(objective))}`;
};

const CALLBACK_PREFIX = "cb";

const buildCallbackData = (...parts) => {
  return [CALLBACK_PREFIX, ...parts].join(":");
};

const parseCallbackData = (message) => {
  const normalized = String(message || "").trim();

  if (!normalized.startsWith(`${CALLBACK_PREFIX}:`)) {
    return null;
  }

  const [, action, ...args] = normalized.split(":");

  if (!action || !args.length) {
    return null;
  }

  return { action, args };
};

const buildInlineObjectiveSelectionKeyboard = (objectives = [], action) => ({
  inline_keyboard: objectives.map((objective) => [
    {
      text: shortenButtonLabel(getObjectiveDisplayName(objective), 40),
      callback_data: buildCallbackData(
        action,
        objective.id || objective._id || objective.objectiveId
      ),
    },
  ]),
});

const getDepartmentDisplayName = (department) => {
  return (
    department?.departmentName ||
    department?.fullName ||
    department?.name ||
    "Department"
  );
};

const buildInlineDepartmentSelectionKeyboard = (
  departments = [],
  action = "select_dept_for_org"
) => ({
  inline_keyboard: departments.map((department, index) => [
    {
      text: shortenButtonLabel(getDepartmentDisplayName(department), 40),
      callback_data: buildCallbackData(action, String(index)),
    },
  ]),
});

const buildInlineDepartmentObjectiveCreateKeyboard = (
  departmentName,
  departmentObjectives = []
) => {
  const rows = departmentObjectives.map((item, index) => [
    {
      text: shortenButtonLabel(
        `Create ${departmentName}: ${item.departmentObjective}`,
        55
      ),
      callback_data: buildCallbackData("create_suggested_dept_obj", String(index)),
    },
  ]);

  if (departmentObjectives.length > 1) {
    rows.push([
      {
        text: shortenButtonLabel(`Create All for ${departmentName}`, 55),
        callback_data: buildCallbackData("create_all_suggested_dept_obj", "all"),
      },
    ]);
  }

  rows.push([
    {
      text: "Close",
      callback_data: buildCallbackData("close_suggested_dept_obj_flow", "close"),
    },
  ]);

  return { inline_keyboard: rows };
};

const buildInlineDepartmentObjectiveTaskKeyboard = (
  departmentObjectives = []
) => ({
  inline_keyboard: [
    ...departmentObjectives.map((item) => [
      {
        text: shortenButtonLabel(
          `Task/KR: ${item.objective || item.departmentObjective || "Department Objective"}`,
          55
        ),
        callback_data: buildCallbackData(
          "select_dept_obj_for_task_kr",
          String(item.id || item._id || item.departmentObjectiveId || "")
        ),
      },
    ]),
    [
      {
        text: "Close",
        callback_data: buildCallbackData("close_task_kr_flow", "close"),
      },
    ],
  ],
});

const buildInlineDepartmentObjectiveWeightageKeyboard = (
  departmentObjectives = []
) => ({
  inline_keyboard: [
    ...departmentObjectives.map((item) => [
      {
        text: shortenButtonLabel(
          `Weightage: ${item.objective || item.departmentObjective || "Department Objective"}`,
          55
        ),
        callback_data: buildCallbackData(
          "select_dept_obj_for_weightage",
          String(item.id || item._id || item.departmentObjectiveId || "")
        ),
      },
    ]),
    [
      {
        text: "Close",
        callback_data: buildCallbackData("close_weightage_flow", "close"),
      },
    ],
  ],
});

const buildInlineDepartmentObjectiveCurrentScoreKeyboard = (
  departmentObjectives = []
) => ({
  inline_keyboard: [
    ...departmentObjectives.map((item) => [
      {
        text: shortenButtonLabel(
          `Score: ${item.objective || item.departmentObjective || "Department Objective"}`,
          55
        ),
        callback_data: buildCallbackData(
          "select_dept_obj_for_current_score",
          String(item.id || item._id || item.departmentObjectiveId || "")
        ),
      },
    ]),
    [
      {
        text: "Close",
        callback_data: buildCallbackData("close_current_score_flow", "close"),
      },
    ],
  ],
});

const buildInlineSuggestedTaskKeyResultKeyboard = (items = []) => {
  const rows = items.map((item, index) => [
    {
      text: shortenButtonLabel(
        `Create: ${item.taskName} -> ${item.departmentKeyResult}`,
        55
      ),
      callback_data: buildCallbackData("create_suggested_task_kr", String(index)),
    },
  ]);

  if (items.length > 1) {
    rows.push([
      {
        text: "Create All",
        callback_data: buildCallbackData("create_all_suggested_task_kr", "all"),
      },
    ]);
  }

  rows.push([
    {
      text: "Manual Entry",
      callback_data: buildCallbackData("manual_task_kr_entry", "manual"),
    },
  ]);

  rows.push([
    {
      text: "Close",
      callback_data: buildCallbackData("close_task_kr_flow", "close"),
    },
  ]);

  return { inline_keyboard: rows };
};

const SCHEDULE_DAYS = [
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
  "sunday",
];

const SCHEDULE_TIMEZONE_OPTIONS = [
  { label: "Asia/Kolkata", value: "Asia/Kolkata" },
  { label: "UTC", value: "UTC" },
  { label: "Asia/Dubai", value: "Asia/Dubai" },
  { label: "Europe/London", value: "Europe/London" },
  { label: "America/New_York", value: "America/New_York" },
  { label: "Asia/Singapore", value: "Asia/Singapore" },
];

const SCHEDULE_TIMER_OPTIONS = [12, 24, 36, 48];

const buildInlineScheduleActionKeyboard = (hasExistingSchedule = false) => ({
  inline_keyboard: [
    [
      {
        text: hasExistingSchedule ? "Update Schedule" : "Set Up Schedule",
        callback_data: buildCallbackData(
          hasExistingSchedule ? "schedule_start_update" : "schedule_start_setup",
          "start"
        ),
      },
    ],
    ...(hasExistingSchedule
      ? [[{ text: "Show Current", callback_data: buildCallbackData("schedule_show_current", "show") }]]
      : []),
    [{ text: "Close", callback_data: buildCallbackData("schedule_close", "close") }],
  ],
});

const buildInlineScheduleDayKeyboard = () => ({
  inline_keyboard: [
    ...SCHEDULE_DAYS.map((dayName, index) => [
      {
        text: dayName.charAt(0).toUpperCase() + dayName.slice(1),
        callback_data: buildCallbackData("schedule_day", String(index)),
      },
    ]),
    [{ text: "Close", callback_data: buildCallbackData("schedule_close", "close") }],
  ],
});

const buildInlineScheduleTimezoneKeyboard = () => ({
  inline_keyboard: [
    ...SCHEDULE_TIMEZONE_OPTIONS.map((timezone, index) => [
      {
        text: timezone.label,
        callback_data: buildCallbackData("schedule_timezone", String(index)),
      },
    ]),
    [
      {
        text: "Manual Timezone",
        callback_data: buildCallbackData("schedule_timezone_manual", "manual"),
      },
    ],
    [{ text: "Close", callback_data: buildCallbackData("schedule_close", "close") }],
  ],
});

const buildInlineScheduleTimerKeyboard = () => ({
  inline_keyboard: [
    ...SCHEDULE_TIMER_OPTIONS.map((hours) => [
      {
        text: `${hours} Hrs`,
        callback_data: buildCallbackData("schedule_timer", String(hours)),
      },
    ]),
    [{ text: "Close", callback_data: buildCallbackData("schedule_close", "close") }],
  ],
});

const buildInlineWeightageModeKeyboard = () => ({
  inline_keyboard: [
    [
      {
        text: "Manual Weightage",
        callback_data: buildCallbackData("weightage_mode_manual", "manual"),
      },
    ],
    [
      {
        text: "AI Suggest Weightage",
        callback_data: buildCallbackData("weightage_mode_ai", "ai"),
      },
    ],
    [{ text: "Close", callback_data: buildCallbackData("close_weightage_flow", "close") }],
  ],
});

const buildInlineKeyResultWeightageKeyboard = (items = []) => ({
  inline_keyboard: [
    ...items.map((item) => [
      {
        text: shortenButtonLabel(
          `${item.objectiveInitiativeTask || item.task || "Task"} (${item.weightage ?? 0}%)`,
          55
        ),
        callback_data: buildCallbackData(
          "select_key_result_for_weightage",
          String(item.id || item._id || "")
        ),
      },
    ]),
    [{ text: "Close", callback_data: buildCallbackData("close_weightage_flow", "close") }],
  ],
});

const buildInlineKeyResultCurrentScoreKeyboard = (items = []) => ({
  inline_keyboard: [
    ...items.map((item) => [
      {
        text: shortenButtonLabel(
          `${item.objectiveInitiativeTask || item.task || "Task"} (${item.currentScore ?? 0})`,
          55
        ),
        callback_data: buildCallbackData(
          "select_key_result_for_current_score",
          String(item.id || item._id || "")
        ),
      },
    ]),
    [{ text: "Close", callback_data: buildCallbackData("close_current_score_flow", "close") }],
  ],
});

const buildInlineSuggestedWeightageKeyboard = (items = []) => ({
  inline_keyboard: [
    ...items.map((item, index) => [
      {
        text: shortenButtonLabel(
          `${item.taskName} -> ${item.weightage}%`,
          55
        ),
        callback_data: buildCallbackData("apply_suggested_weightage", String(index)),
      },
    ]),
    ...(items.length
      ? [[{ text: "Apply All", callback_data: buildCallbackData("apply_all_suggested_weightage", "all") }]]
      : []),
    [{ text: "Manual Mode", callback_data: buildCallbackData("weightage_mode_manual", "manual") }],
    [{ text: "Close", callback_data: buildCallbackData("close_weightage_flow", "close") }],
  ],
});

const buildSuggestedObjectiveKeyboard = (objectives = []) => {
  const rows = objectives.map((objective) => [
    buildObjectiveActionLabel("Create", objective),
    buildObjectiveActionLabel("Dept", objective),
  ]);

  if (objectives.length > 1) {
    rows.push(["Create All"]);
  }

  rows.push(["Show Objectives", "Help"]);

  return buildReplyKeyboard(rows);
};

const buildObjectiveListKeyboard = (objectives = []) => {
  const rows = objectives.map((objective) => [
    buildObjectiveActionLabel("Dept", objective),
    buildObjectiveActionLabel("KR", objective),
  ]);

  rows.push(["Show Objectives", "Help"]);

  return buildReplyKeyboard(rows);
};

const isDepartmentObjectiveIntentMessage = (message) => {
  const normalized = String(message || "").trim().toLowerCase();

  return (
    normalized.includes("department objective") ||
    normalized.includes("department-wise") ||
    normalized.includes("departmentwise")
  );
};

const matchObjectiveFromMessage = (message, objectives = []) => {
  const normalized = String(message || "").trim().toLowerCase();

  if (!normalized || !objectives.length) {
    return null;
  }

  const indexes = extractSelectionIndexes(normalized, objectives.length);

  if (indexes.length) {
    return objectives[indexes[0] - 1] || null;
  }

  return objectives.find((objective) => {
    const name = getObjectiveDisplayName(objective).toLowerCase();
    return normalized.includes(name) || name.includes(normalized.replace(/^(create|dept|kr)\s*:\s*/i, "").trim());
  }) || null;
};

const extractDepartmentObjectiveSelection = (message, objectives = []) => {
  const normalized = String(message || "").trim().toLowerCase();

  if (!normalized.includes("dept")) {
    return null;
  }

  return matchObjectiveFromMessage(message, objectives);
};

const extractKeyResultObjectiveSelection = (message, objectives = []) => {
  const normalized = String(message || "").trim().toLowerCase();

  if (!normalized.includes("kr")) {
    return null;
  }

  return matchObjectiveFromMessage(message, objectives);
};

const extractCreateObjectiveSelection = (message, objectives = []) => {
  const normalized = String(message || "").trim().toLowerCase();

  if (!normalized.startsWith("create:")) {
    return null;
  }

  return matchObjectiveFromMessage(message, objectives);
};

const extractTaskAndKeyResultInput = (message) => {
  const normalized = String(message || "").trim();

  if (!normalized) {
    return null;
  }

  const pipeParts = normalized.split("|").map((part) => part.trim()).filter(Boolean);

  if (pipeParts.length >= 2) {
    return {
      taskName: pipeParts[0].replace(/^task\s*:?\s*/i, "").trim(),
      departmentKeyResult: pipeParts
        .slice(1)
        .join(" | ")
        .replace(/^key\s*result\s*:?\s*/i, "")
        .trim(),
    };
  }

  const taskMatch = normalized.match(/task\s*:?\s*(.+?)(?:\s+key\s*result\s*:?\s*|\s*\|\s*|$)/i);
  const keyResultMatch = normalized.match(/key\s*result\s*:?\s*(.+)$/i);

  const taskName = taskMatch?.[1]?.trim() || "";
  const departmentKeyResult = keyResultMatch?.[1]?.trim() || "";

  if (!taskName || !departmentKeyResult) {
    return null;
  }

  return {
    taskName,
    departmentKeyResult,
  };
};

const isScheduleAffirmative = (message) => {
  const normalized = String(message || "").trim().toLowerCase();
  return ["yes", "y", "yes please", "setup", "set up", "update", "ok", "okay"].includes(normalized);
};

const extractScheduleTimeInput = (message) => {
  const normalized = String(message || "").trim();

  if (/^\d{2}:\d{2}:\d{2}$/.test(normalized)) {
    return normalized;
  }

  if (/^\d{1,2}:\d{2}$/.test(normalized)) {
    const [hours, minutes] = normalized.split(":");
    return toTwentyFourHourTime(hours, minutes, 0);
  }

  const amPmWithMinutes = normalized.match(
    /^(\d{1,2})(?::(\d{2}))?(?::(\d{2}))?\s*([AaPp][Mm])$/
  );

  if (amPmWithMinutes) {
    const [, hours, minutes = "00", seconds = "00", meridiem] = amPmWithMinutes;
    return toTwentyFourHourTime(hours, minutes, seconds, meridiem);
  }

  const hourWithMeridiem = normalized.match(/^(\d{1,2})\s*([AaPp][Mm])$/);

  if (hourWithMeridiem) {
    const [, hours, meridiem] = hourWithMeridiem;
    return toTwentyFourHourTime(hours, 0, 0, meridiem);
  }

  return null;
};

const extractTimezoneInput = (message) => {
  const normalized = String(message || "").trim();
  if (!normalized.includes("/")) {
    return null;
  }

  return normalized;
};

const extractWeightageInput = (message) => {
  const normalized = String(message || "").trim();
  const match = normalized.match(/(\d{1,3})(?:\s*%|$)/);

  if (!match) {
    return null;
  }

  const value = Number(match[1]);

  if (Number.isNaN(value) || value < 0 || value > 100) {
    return null;
  }

  return value;
};

const extractCurrentScoreInput = (message) => {
  return extractWeightageInput(message);
};

const getKeyResultIdentifier = (item) => {
  return String(item?.id || item?._id || item?.keyResultId || "").trim();
};

const getTaskDisplayName = (item) => {
  return (
    item?.objectiveInitiativeTask ||
    item?.task ||
    item?.taskName ||
    "Task"
  );
};

const getDepartmentObjectiveDisplayName = (item) => {
  return item?.objective || item?.departmentObjective || "Department objective";
};

const normalizeComparableText = (value) => {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
};

const getTotalWeightage = (items = []) => {
  return items.reduce((sum, item) => sum + Number(item?.weightage || 0), 0);
};

const formatSuggestedWeightageAllocations = (items = []) => {
  if (!items?.length) {
    return "I could not prepare weightage suggestions for these tasks.";
  }

  const totalWeightage = getTotalWeightage(items);

  return [
    `Suggested total weightage: ${totalWeightage}%`,
    "",
    ...items.map((item, index) => [
      `${index + 1}. Task: ${item.taskName || "-"}`,
      `   Key Result: ${item.keyResult || "-"}`,
      `   Suggested Weightage: ${item.weightage}%`,
      `   Reason: ${item.reason || "-"}`,
    ].join("\n")),
  ].join("\n\n");
};

const matchWeightageSuggestionToItem = (suggestion, items = []) => {
  const normalizedTaskName = normalizeComparableText(suggestion?.taskName);

  if (!normalizedTaskName) {
    return null;
  }

  return (
    items.find((item) => normalizeComparableText(getTaskDisplayName(item)) === normalizedTaskName) ||
    items.find((item) => normalizeComparableText(getTaskDisplayName(item)).includes(normalizedTaskName)) ||
    items.find((item) => normalizedTaskName.includes(normalizeComparableText(getTaskDisplayName(item)))) ||
    null
  );
};

const normalizeSuggestedWeightageAllocations = (items = [], suggestions = []) => {
  if (!items.length || !suggestions.length) {
    return [];
  }

  const matchedSuggestions = suggestions
    .map((suggestion) => {
      const matchedItem = matchWeightageSuggestionToItem(suggestion, items);

      if (!matchedItem) {
        return null;
      }

      return {
        keyResultId: getKeyResultIdentifier(matchedItem),
        taskName: getTaskDisplayName(matchedItem),
        keyResult: matchedItem.keyResult || "-",
        weightage: Math.max(0, Math.min(100, Math.round(Number(suggestion.weightage || 0)))),
        reason: suggestion.reason || "Prioritized based on expected impact and urgency.",
      };
    })
    .filter(Boolean)
    .filter((item, index, array) => {
      return array.findIndex((candidate) => candidate.keyResultId === item.keyResultId) === index;
    });

  if (!matchedSuggestions.length) {
    return [];
  }

  const allocationByKeyResultId = new Map(
    matchedSuggestions.map((item) => [item.keyResultId, item])
  );

  const allocations = items.map((item) => {
    const keyResultId = getKeyResultIdentifier(item);
    const matched = allocationByKeyResultId.get(keyResultId);

    return {
      keyResultId,
      taskName: getTaskDisplayName(item),
      keyResult: item.keyResult || "-",
      weightage: matched?.weightage ?? 0,
      reason:
        matched?.reason ||
        "Kept at 0% because it was not prioritized in the current AI allocation set.",
    };
  });

  let totalWeightage = getTotalWeightage(allocations);

  if (totalWeightage > 100) {
    const scaledAllocations = allocations.map((item) => ({
      ...item,
      weightage: Math.floor((item.weightage / totalWeightage) * 100),
    }));
    let remainder = 100 - getTotalWeightage(scaledAllocations);
    const byWeightage = [...scaledAllocations].sort(
      (left, right) => right.weightage - left.weightage
    );

    while (remainder > 0 && byWeightage.length) {
      for (const item of byWeightage) {
        if (remainder <= 0) {
          break;
        }

        item.weightage += 1;
        remainder -= 1;
      }
    }

    totalWeightage = getTotalWeightage(scaledAllocations);
    return scaledAllocations.map((item) => ({
      ...item,
      reason:
        totalWeightage === 100
          ? item.reason
          : `${item.reason} Adjusted to keep the total within 100%.`,
    }));
  }

  if (totalWeightage < 100) {
    const targetItem =
      [...allocations].sort((left, right) => right.weightage - left.weightage)[0] ||
      allocations[0];

    if (targetItem) {
      targetItem.weightage += 100 - totalWeightage;
      targetItem.reason = `${targetItem.reason} Added the remaining capacity so the allocation totals 100%.`;
    }
  }

  return allocations;
};

const buildManualWeightagePrompt = ({
  departmentObjectiveName,
  selectedItem,
  items = [],
}) => {
  const selectedKeyResultId = getKeyResultIdentifier(selectedItem);
  const allocatedExcludingSelected = items.reduce((sum, item) => {
    if (getKeyResultIdentifier(item) === selectedKeyResultId) {
      return sum;
    }

    return sum + Number(item?.weightage || 0);
  }, 0);
  const maxAllowed = Math.max(0, 100 - allocatedExcludingSelected);

  return [
    `Department objective: ${departmentObjectiveName || "Department objective"}`,
    `Selected task: ${getTaskDisplayName(selectedItem)}`,
    `Current key result: ${selectedItem?.keyResult || "-"}`,
    `Current task weightage: ${selectedItem?.weightage ?? 0}%`,
    `Current total across this department objective: ${getTotalWeightage(items)}%`,
    `You can set this task from 0% to ${maxAllowed}% without crossing the 100% limit.`,
    "",
    "Send just the weightage number or percentage.",
    "Example: 35 or 35%",
  ].join("\n");
};

const buildCurrentScorePrompt = ({
  departmentObjectiveName,
  selectedItem,
}) => {
  return [
    `Department objective: ${departmentObjectiveName || "Department objective"}`,
    `Selected task: ${getTaskDisplayName(selectedItem)}`,
    `Current key result: ${selectedItem?.keyResult || "-"}`,
    `Last two week scores: ${selectedItem?.weekBeforeLastWeekScore ?? 0}, ${selectedItem?.lastWeekScore ?? 0}`,
    `Current score: ${selectedItem?.currentScore ?? 0}`,
    "",
    "Send the new current score from 0 to 100.",
    "Example: 70",
  ].join("\n");
};

const normalizeLooseText = (message) => {
  return String(message || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ");
};

const isScheduleIntentMessage = (message) => {
  const normalized = normalizeLooseText(message);
  const hasScheduleWord =
    normalized.includes("schedule") ||
    normalized.includes("scedule") ||
    normalized.includes("schedul");
  const hasMeetingWord = normalized.includes("meeting");
  const hasTimeWord =
    normalized.includes("time") ||
    normalized.includes("timer") ||
    normalized.includes("timing");
  const hasScoreWord = normalized.includes("score");
  const hasSetupWord =
    normalized.includes("setup") ||
    normalized.includes("set up") ||
    normalized.includes("configure") ||
    normalized.includes("update");

  return (
    hasScheduleWord ||
    normalized.includes("score management") ||
    normalized.includes("score schedule") ||
    normalized.includes("weekly meeting") ||
    (hasMeetingWord && hasTimeWord) ||
    (hasMeetingWord && hasSetupWord) ||
    (hasScoreWord && hasTimeWord)
  );
};

const isScheduleSetupIntentMessage = (message) => {
  const normalized = normalizeLooseText(message);

  const setupKeywords = [
    "set up",
    "setup",
    "create",
    "configure",
    "change",
    "update",
    "edit",
  ];

  return (
    isScheduleIntentMessage(normalized) &&
    setupKeywords.some((keyword) => normalized.includes(keyword))
  );
};

const isScheduleViewIntentMessage = (message) => {
  const normalized = normalizeLooseText(message);

  const viewKeywords = [
    "what",
    "show",
    "view",
    "get",
    "when",
    "time",
    "details",
  ];

  return (
    isScheduleIntentMessage(normalized) &&
    (viewKeywords.some((keyword) => normalized.includes(keyword)) ||
      (normalized.includes("meeting") && normalized.includes("take place")))
  );
};

const isWeightageIntentMessage = (message) => {
  const normalized = normalizeLooseText(message);

  return (
    normalized.includes("weightage") ||
    normalized.includes("weight age") ||
    (normalized.includes("task") && normalized.includes("weight")) ||
    (normalized.includes("allocate") && normalized.includes("weight")) ||
    (normalized.includes("distribute") && normalized.includes("weight"))
  );
};

const isCurrentScoreIntentMessage = (message) => {
  const normalized = normalizeLooseText(message);

  return (
    normalized.includes("current score") ||
    normalized.includes("add score") ||
    normalized.includes("update score") ||
    (normalized.includes("score") && normalized.includes("task")) ||
    (normalized.includes("score") && normalized.includes("key result"))
  );
};

const padTimePart = (value) => String(value).padStart(2, "0");

const toTwentyFourHourTime = (hours, minutes = 0, seconds = 0, meridiem = "") => {
  let normalizedHours = Number(hours);
  const normalizedMinutes = Number(minutes);
  const normalizedSeconds = Number(seconds);
  const normalizedMeridiem = String(meridiem || "").trim().toLowerCase();

  if (
    Number.isNaN(normalizedHours) ||
    Number.isNaN(normalizedMinutes) ||
    Number.isNaN(normalizedSeconds)
  ) {
    return null;
  }

  if (normalizedMeridiem) {
    if (normalizedHours < 1 || normalizedHours > 12) {
      return null;
    }

    if (normalizedMeridiem === "pm" && normalizedHours !== 12) {
      normalizedHours += 12;
    }

    if (normalizedMeridiem === "am" && normalizedHours === 12) {
      normalizedHours = 0;
    }
  }

  if (
    normalizedHours < 0 ||
    normalizedHours > 23 ||
    normalizedMinutes < 0 ||
    normalizedMinutes > 59 ||
    normalizedSeconds < 0 ||
    normalizedSeconds > 59
  ) {
    return null;
  }

  return `${padTimePart(normalizedHours)}:${padTimePart(normalizedMinutes)}:${padTimePart(normalizedSeconds)}`;
};

const buildConversationContext = (history = []) => {
  const trimmedHistory = history.slice(-MAX_HISTORY_ITEMS);

  if (!trimmedHistory.length) {
    return "No previous conversation.";
  }

  return trimmedHistory
    .map((message) => `${message.role === "assistant" ? "Assistant" : "User"}: ${message.content}`)
    .join("\n");
};

const buildPlannerMessages = ({ message, session, history }) => {
  return [
    {
      role: "system",
      content: [
        AGENT_INSTRUCTIONS,
        "",
        "You are an intent planner for this bot.",
        "Return only valid JSON.",
        "Pick one action from: create_objective, create_department_objective, create_bulk_objectives, get_department_objectives, create_department_task_key_result, create_key_result, update_objective_progress, get_objectives, get_profile, get_profile_details, get_departments, get_current_department, get_current_department_objectives, get_department_objective_key_results, get_dashboard_year_filters, get_dashboard_objective_growth, get_dashboard_department_growth, get_dashboard_yearly_growth, get_schedule_details, update_schedule_details, get_score_edit_status, strategy_advice, department_alignment, send_help, ask_clarification, general_reply.",
        "Schema:",
        '{',
        '  "action": "string",',
        '  "objectiveId": "string",',
        '  "objectiveName": "string",',
        '  "departmentObjective": "string",',
        '  "organizationObjectiveId": "string",',
        '  "departmentId": "string",',
        '  "keyResultName": "string",',
        '  "targetValue": "string",',
        '  "startValue": "string",',
        '  "currentValue": "string",',
        '  "progressValue": "string",',
        '  "description": "string",',
        '  "organizationObjective": "string",',
        '  "taskName": "string",',
        '  "departmentKeyResult": "string",',
        '  "departmentObjectiveId": "string",',
        '  "departmentObjectiveName": "string",',
        '  "year": "string",',
        '  "quarter": "string",',
        '  "dayName": "string",',
        '  "meetingTime": "string",',
        '  "timezone": "string",',
        '  "timeSlotHoursBeforeMeeting": "string",',
        '  "organizationObjectives": [{"objectiveName":"string","description":"string"}],',
        '  "departmentObjectives": [{"departmentObjective":"string","description":"string","organizationObjectiveId":"string","organizationObjective":"string","objectiveName":"string"}],',
        '  "reply": "string"',
        '}',
        'Use empty strings when a field is not needed.',
        'If the user is asking for help or greeting, use send_help or general_reply.',
        'If objective creation is requested but the title is unclear, use ask_clarification.',
        'If create_key_result or update_objective_progress is requested and the objective is unclear, use ask_clarification.',
        'For create_department_objective, require organizationObjectiveId (or find it from the objective name) and departmentObjective title.',
        'Use create_bulk_objectives when the user wants multiple organization objectives, multiple department objectives, or both in one request.',
        'For create_bulk_objectives, fill organizationObjectives and/or departmentObjectives arrays.',
        'For get_department_objectives, optionally accept departmentId to filter by department.',
        'For create_department_task_key_result, require departmentObjectiveId (or find it from the department objective name), taskName, and departmentKeyResult.',
        'For get_department_objective_key_results, provide departmentObjectiveId when possible, otherwise use departmentObjectiveName.',
        'For dashboard stat actions, fill year and quarter when the user mentions them.',
        'For update_schedule_details, require dayName, meetingTime in HH:mm:ss, timezone, and timeSlotHoursBeforeMeeting.',
        'Use strategy_advice for broad OKR/business-growth guidance.',
        'Use department_alignment when the user wants department objectives or department-wise breakdown from a company/organization objective.',
      ].join("\n"),
    },
    {
      role: "user",
      content: [
        `Authenticated: ${session?.token ? "yes" : "no"}`,
        `Session role: ${session?.role || "unknown"}`,
        `Backend base URL: ${config.apiBaseUrl}`,
        "Recent conversation:",
        buildConversationContext(history),
        "",
        `Current user message: ${message}`,
      ].join("\n"),
    },
  ];
};

const parseJson = (jsonString) => {
  try {
    return JSON.parse(jsonString);
  } catch (error) {
    throw new Error("Model returned invalid JSON");
  }
};

const normalizeKeyResultItems = (keyResults) => {
  if (!Array.isArray(keyResults)) {
    return [];
  }

  return keyResults
    .map((item) => String(item || "").trim())
    .filter(Boolean)
    .slice(0, 4);
};

const generateObjectiveDescription = async ({
  objectiveName,
  organizationProfile,
}) => {
  const response = await chatWithModel({
    messages: [
      {
        role: "system",
        content: [
          "You write concise OKR objective descriptions for a company.",
          "Return only the description text.",
          "Keep it to one sentence, practical, and outcome-focused.",
          "Do not use bullet points, numbering, quotes, or markdown.",
          "Do not repeat the objective title verbatim unless necessary.",
        ].join("\n"),
      },
      {
        role: "user",
        content: [
          `Objective title: ${objectiveName}`,
          "",
          "Company context:",
          `Company: ${organizationProfile?.companyName || "-"}`,
          `About: ${organizationProfile?.aboutCompany || "-"}`,
          `Mission: ${organizationProfile?.companyMission || "-"}`,
          `Vision: ${organizationProfile?.companyVision || "-"}`,
          `Purpose: ${organizationProfile?.purpose || "-"}`,
          `Solution: ${organizationProfile?.solution || "-"}`,
        ].join("\n"),
      },
    ],
  });

  return (
    response.message?.content?.trim() ||
    `Drive measurable progress for ${objectiveName.toLowerCase()} this cycle.`
  );
};

const ensureObjectiveDescriptions = async ({
  token,
  objectives,
}) => {
  const itemsMissingDescriptions = objectives.filter(
    (item) => !String(item.description || "").trim()
  );

  if (!itemsMissingDescriptions.length) {
    return objectives;
  }

  const organizationProfile = (
    await getCurrentOrganizationProfile(token)
  ).data.data;

  const enrichedObjectives = [];

  for (const item of objectives) {
    if (String(item.description || "").trim()) {
      enrichedObjectives.push(item);
      continue;
    }

    const description = await generateObjectiveDescription({
      objectiveName: item.objectiveName,
      organizationProfile,
    });

    enrichedObjectives.push({
      ...item,
      description,
    });
  }

  return enrichedObjectives;
};

const normalizeStructuredStrategyPlan = (plan) => {
  const items = Array.isArray(plan?.organizationObjectives)
    ? plan.organizationObjectives
    : [];

  return items
    .map((item, index) => ({
      id: `s${index + 1}`,
      objectiveName: String(item?.objectiveName || "").trim(),
      description: String(item?.description || "").trim(),
      keyResults: normalizeKeyResultItems(item?.keyResults),
    }))
    .filter((item) => item.objectiveName)
    .slice(0, 5);
};

const normalizeStructuredDepartmentPlan = (plan) => {
  const items = Array.isArray(plan?.departmentObjectives)
    ? plan.departmentObjectives
    : [];

  return items
    .map((item, index) => ({
      id: `d${index + 1}`,
      departmentObjective: String(
        item?.departmentObjective || item?.objectiveName || ""
      ).trim(),
      description: String(item?.description || "").trim(),
      keyResults: normalizeKeyResultItems(item?.keyResults),
    }))
    .filter((item) => item.departmentObjective)
    .slice(0, 5);
};

const normalizeStructuredDepartmentTaskPlan = (plan) => {
  const items = Array.isArray(plan?.taskKeyResults)
    ? plan.taskKeyResults
    : [];

  return items
    .map((item, index) => ({
      id: `t${index + 1}`,
      taskName: String(item?.taskName || item?.task || "").trim(),
      departmentKeyResult: String(
        item?.departmentKeyResult || item?.keyResult || item?.key_result || ""
      ).trim(),
      description: String(item?.description || "").trim(),
    }))
    .filter((item) => item.taskName && item.departmentKeyResult)
    .slice(0, 5);
};

const buildStructuredStrategyMessages = ({
  message,
  profile,
  departments,
}) => {
  const departmentList = departments?.length
    ? departments
        .map((department, index) => {
          return `${index + 1}. ${department.departmentName || "-"} (${department.fullName || "No owner"})`;
        })
        .join("\n")
    : "No department data available.";

  const profileSummary = profile
    ? [
        `Company: ${profile.companyName || "-"}`,
        `Organization name: ${profile.fullName || "-"}`,
        `About: ${profile.aboutCompany || "-"}`,
        `Mission: ${profile.companyMission || "-"}`,
        `Vision: ${profile.companyVision || "-"}`,
        `Purpose: ${profile.purpose || "-"}`,
        `Solution: ${profile.solution || "-"}`,
      ].join("\n")
    : "No organization profile available.";

  return [
    {
      role: "system",
      content: [
        "You are an OKR strategy planner for a business.",
        "Return only valid JSON.",
        "Propose exactly 3 distinct organization objectives unless the user explicitly asks for fewer.",
        "Each objective must be independently creatable in an OKR system.",
        "Descriptions must be one sentence and outcome-focused.",
        "Each objective must include 2-4 outcome-focused key results.",
        "Do not include department objectives, tasks, explanations, markdown, or extra text outside JSON.",
        "Schema:",
        '{',
        '  "organizationObjectives": [',
        '    {',
        '      "objectiveName": "string",',
        '      "description": "string",',
        '      "keyResults": ["string"]',
        '    }',
        '  ]',
        '}',
      ].join("\n"),
    },
    {
      role: "user",
      content: [
        `User request: ${message}`,
        "",
        "Organization profile:",
        profileSummary,
        "",
        "Known departments:",
        departmentList,
      ].join("\n"),
    },
  ];
};

const generateStructuredStrategyPlan = async (token, message) => {
  const { profile, departments } = await loadStrategyContext(token);
  const response = await chatWithModel({
    messages: buildStructuredStrategyMessages({
      message,
      profile,
      departments,
    }),
    format: "json",
  });

  const parsed = parseJson(response.message?.content || "{}");
  const organizationObjectives = normalizeStructuredStrategyPlan(parsed);

  return {
    profile,
    departments,
    organizationObjectives,
  };
};

const generateStructuredDepartmentPlan = async (
  token,
  organizationObjective,
  departmentName
) => {
  const { profile, departments } = await loadStrategyContext(token);
  const response = await chatWithModel({
    messages: [
      {
        role: "system",
        content: [
          "You are an OKR department objective planner.",
          "Return only valid JSON.",
          "Propose exactly 3 department objectives for the selected department under the given organization objective.",
          "Each department objective must be actionable and independently creatable in an OKR system.",
          "Descriptions must be one sentence and outcome-focused.",
          "Each department objective must include 2-4 outcome-focused key results.",
          "Do not include markdown or extra text outside JSON.",
          "Schema:",
          '{',
          '  "departmentObjectives": [',
          '    {',
          '      "departmentObjective": "string",',
          '      "description": "string",',
          '      "keyResults": ["string"]',
          '    }',
          '  ]',
          '}',
        ].join("\n"),
      },
      {
        role: "user",
        content: [
          `Organization objective: ${organizationObjective}`,
          `Target department: ${departmentName}`,
          "",
          "Organization profile:",
          [
            `Company: ${profile?.companyName || "-"}`,
            `Organization name: ${profile?.fullName || "-"}`,
            `About: ${profile?.aboutCompany || "-"}`,
            `Mission: ${profile?.companyMission || "-"}`,
            `Vision: ${profile?.companyVision || "-"}`,
          ].join("\n"),
          "",
          "Known departments:",
          departments
            .map((department, index) => {
              return `${index + 1}. ${department.departmentName || "-"} (${department.fullName || "No owner"})`;
            })
            .join("\n"),
        ].join("\n"),
      },
    ],
    format: "json",
  });

  const parsed = parseJson(response.message?.content || "{}");
  return normalizeStructuredDepartmentPlan(parsed);
};

const generateStructuredDepartmentTaskPlan = async (
  token,
  departmentObjectiveName,
  departmentName = ""
) => {
  const { profile, departments } = await loadStrategyContext(token);
  const response = await chatWithModel({
    messages: [
      {
        role: "system",
        content: [
          "You are an OKR task and key-result planner for a department objective.",
          "Return only valid JSON.",
          "Propose exactly 3 practical task and key-result pairs for the selected department objective.",
          "Each task must be concrete and execution-focused.",
          "Each key result must be measurable and outcome-focused.",
          "Do not include markdown or extra text outside JSON.",
          "Schema:",
          "{",
          '  "taskKeyResults": [',
          "    {",
          '      "taskName": "string",',
          '      "departmentKeyResult": "string",',
          '      "description": "string"',
          "    }",
          "  ]",
          "}",
        ].join("\n"),
      },
      {
        role: "user",
        content: [
          `Department objective: ${departmentObjectiveName}`,
          `Department: ${departmentName || "-"}`,
          "",
          "Organization profile:",
          [
            `Company: ${profile?.companyName || "-"}`,
            `Organization name: ${profile?.fullName || "-"}`,
            `About: ${profile?.aboutCompany || "-"}`,
            `Mission: ${profile?.companyMission || "-"}`,
            `Vision: ${profile?.companyVision || "-"}`,
          ].join("\n"),
          "",
          "Known departments:",
          departments
            .map((department, index) => {
              return `${index + 1}. ${department.departmentName || "-"} (${department.fullName || "No owner"})`;
            })
            .join("\n"),
        ].join("\n"),
      },
    ],
    format: "json",
  });

  const parsed = parseJson(response.message?.content || "{}");
  return normalizeStructuredDepartmentTaskPlan(parsed);
};

const formatStructuredStrategyAdvice = ({
  organizationObjectives,
  departments,
}) => {
  if (!organizationObjectives.length) {
    return "I could not generate organization objective suggestions right now.";
  }

  const lines = [
    "Suggested organization objectives:",
    ...organizationObjectives.map((item, index) => (
      `${index + 1}. ${item.objectiveName} - ${item.description || "No description"}`
    )),
    "",
    "Recommended key results:",
  ];

  organizationObjectives.forEach((item, index) => {
    lines.push(`${index + 1}. ${item.objectiveName}`);

    if (item.keyResults.length) {
      item.keyResults.forEach((keyResult, keyResultIndex) => {
        lines.push(`   ${keyResultIndex + 1}. ${keyResult}`);
      });
    } else {
      lines.push("   1. Define measurable outcome targets for this objective.");
    }
  });

  if (departments?.length) {
    lines.push("");
    lines.push(
      `Known departments that can support execution: ${departments
        .map((department) => department.departmentName || department.fullName || "-")
        .filter(Boolean)
        .join(", ")}.`
    );
  }

  lines.push("");
  lines.push("Reply with 'create all', 'create 1,3', or 'create first and third objective'.");

  return lines.join("\n");
};

const formatStructuredDepartmentAdvice = ({
  organizationObjective,
  departmentName,
  departmentObjectives,
}) => {
  if (!departmentObjectives.length) {
    return `I could not generate department objectives for ${departmentName} right now.`;
  }

  const lines = [
    `Selected organization objective: ${organizationObjective}`,
    `Selected department: ${departmentName}`,
    "",
    `Suggested Department Objectives for ${departmentName}:`,
    ...departmentObjectives.map((item, index) => (
      `${index + 1}. ${item.departmentObjective} - ${item.description || "No description"}`
    )),
    "",
    "Key Results:",
  ];

  departmentObjectives.forEach((item, index) => {
    lines.push(`${index + 1}. ${item.departmentObjective}`);
    if (item.keyResults.length) {
      item.keyResults.forEach((keyResult, keyResultIndex) => {
        lines.push(`   ${keyResultIndex + 1}. ${keyResult}`);
      });
    } else {
      lines.push("   1. Define measurable outcome targets for this department objective.");
    }
  });

  lines.push("");
  lines.push("Use the buttons below to create one or all of these department objectives.");

  return lines.join("\n");
};

const formatStructuredDepartmentTaskAdvice = ({
  departmentObjectiveName,
  departmentName,
  taskKeyResults,
}) => {
  if (!taskKeyResults.length) {
    return `I could not generate task and key-result suggestions for ${departmentObjectiveName} right now.`;
  }

  const lines = [
    `Selected department objective: ${departmentObjectiveName}`,
    `Department: ${departmentName || "-"}`,
    "",
    "Suggested task and key-result pairs:",
    ...taskKeyResults.map((item, index) => (
      `${index + 1}. ${item.taskName} -> ${item.departmentKeyResult}`
    )),
    "",
    "Use the buttons below to create one, create all, or switch to manual entry.",
  ];

  return lines.join("\n");
};

const formatSuggestedObjectives = (objectives = []) => {
  if (!objectives.length) {
    return "";
  }

  return [
    "",
    "Suggested organization objectives:",
    ...objectives.map((item, index) => {
      const description = String(item.description || "").trim();
      return description
        ? `${index + 1}. ${item.objectiveName} - ${description}`
        : `${index + 1}. ${item.objectiveName}`;
    }),
    "",
    "Reply with 'create all' to create all of them, or 'create 1,3' to create selected ones.",
  ].join("\n");
};

const getObjectiveByIndex = async (token, index) => {
  const response = await getObjectives(token);
  const objectives = response.data.data.objectives || [];

  if (!index || index < 1 || index > objectives.length) {
    return null;
  }

  return objectives[index - 1] || null;
};

const getObjectiveById = async (token, objectiveId) => {
  const response = await getObjectives(token);
  const objectives = response.data.data.objectives || [];

  return (
    objectives.find((objective) => {
      const id = objective.id || objective._id || objective.objectiveId;
      return String(id) === String(objectiveId);
    }) || null
  );
};

const getDepartmentById = async (token, departmentId) => {
  const response = await getDepartments(token);
  const departments =
    response.data.data.departments || response.data.data.departmentUsers || [];

  return (
    departments.find((department) => {
      const id = department.id || department._id || department.departmentId;
      return String(id) === String(departmentId);
    }) || null
  );
};

const buildDepartmentSessionOptions = (departments = []) => {
  return departments
    .map((department, index) => ({
      index,
      id: String(
        department.id || department._id || department.departmentId || ""
      ).trim(),
      name: getDepartmentDisplayName(department),
    }))
    .filter((department) => department.id);
};

const normalizeObjectiveItems = (plan) => {
  const items = Array.isArray(plan.organizationObjectives)
    ? plan.organizationObjectives
    : [];

  const normalizedItems = items
    .map((item) => ({
      objectiveName: String(item?.objectiveName || "").trim(),
      description: String(item?.description || "").trim(),
    }))
    .filter((item) => item.objectiveName);

  if (normalizedItems.length) {
    return normalizedItems;
  }

  if (!plan.objectiveName) {
    return [];
  }

  return [
    {
      objectiveName: String(plan.objectiveName).trim(),
      description: String(plan.description || "").trim(),
    },
  ];
};

const normalizeDepartmentObjectiveItems = (plan) => {
  const items = Array.isArray(plan.departmentObjectives)
    ? plan.departmentObjectives
    : [];

  const normalizedItems = items
    .map((item) => ({
      departmentObjective: String(
        item?.departmentObjective || item?.objectiveName || ""
      ).trim(),
      description: String(item?.description || "").trim(),
      departmentId: String(item?.departmentId || "").trim(),
      organizationObjectiveId: String(item?.organizationObjectiveId || "").trim(),
      organizationObjective: String(
        item?.organizationObjective || item?.objectiveName || ""
      ).trim(),
    }))
    .filter((item) => item.departmentObjective);

  if (normalizedItems.length) {
    return normalizedItems;
  }

  if (!plan.departmentObjective && !plan.objectiveName) {
    return [];
  }

  return [
    {
      departmentObjective: String(
        plan.departmentObjective || plan.objectiveName || ""
      ).trim(),
      description: String(plan.description || "").trim(),
      departmentId: String(plan.departmentId || "").trim(),
      organizationObjectiveId: String(plan.organizationObjectiveId || "").trim(),
      organizationObjective: String(plan.organizationObjective || plan.objectiveName || "").trim(),
    },
  ];
};

const findObjectiveByReference = (objectives, objectiveId, objectiveName) => {
  if (objectiveId) {
    const byId = objectives.find((objective) => {
      const id = objective.id || objective._id || objective.objectiveId;
      return String(id) === String(objectiveId);
    });

    if (byId) {
      return byId;
    }
  }

  if (!objectiveName) {
    return null;
  }

  const normalizedName = objectiveName.trim().toLowerCase();

  return (
    objectives.find((objective) => {
      return (
        objective.objectiveName &&
        objective.objectiveName.trim().toLowerCase() === normalizedName
      );
    }) ||
    objectives.find((objective) => {
      return (
        objective.objectiveName &&
        objective.objectiveName.trim().toLowerCase().includes(normalizedName)
      );
    }) ||
    null
  );
};

const resolveOrganizationObjectiveId = async (
  token,
  item,
  fallbackReference = ""
) => {
  if (item.organizationObjectiveId) {
    return item.organizationObjectiveId;
  }

  const response = await getObjectives(token);
  const objectives = response.data.data.objectives || [];
  const matched = findObjectiveByReference(
    objectives,
    item.organizationObjectiveId,
    item.organizationObjective || fallbackReference
  );

  return matched
    ? matched.id || matched._id || matched.objectiveId || ""
    : "";
};

const createBulkObjectives = async ({ plan, session }) => {
  const organizationObjectives = await ensureObjectiveDescriptions({
    token: session.token,
    objectives: normalizeObjectiveItems(plan),
  });
  const departmentObjectives = normalizeDepartmentObjectiveItems(plan);

  if (!organizationObjectives.length && !departmentObjectives.length) {
    return {
      success: false,
      action: "create_bulk_objectives",
      summary:
        "Please provide at least one organization objective or department objective to create.",
    };
  }

  const createdOrganizationObjectives = [];
  const createdDepartmentObjectives = [];
  const failures = [];

  if (organizationObjectives.length) {
    await createObjective(
      session.token,
      organizationObjectives.map((item) => ({
        objectiveName: item.objectiveName,
        description: item.description,
      }))
    );

    createdOrganizationObjectives.push(...organizationObjectives);
  }

  for (const item of departmentObjectives) {
    const organizationObjectiveId = await resolveOrganizationObjectiveId(
      session.token,
      item,
      organizationObjectives.length === 1
        ? organizationObjectives[0].objectiveName
        : ""
    );

    if (!organizationObjectiveId) {
      failures.push(
        `Could not match organization objective for department objective "${item.departmentObjective}".`
      );
      continue;
    }

    await createDepartmentObjective(session.token, {
      organizationObjectiveId,
      departmentId: item.departmentId || session.selectedDepartmentId || "",
      departmentObjective: item.departmentObjective,
      description: item.description || "",
    });

    createdDepartmentObjectives.push({
      departmentObjective: item.departmentObjective,
      organizationObjectiveId,
    });
  }

  const summaryParts = [];

  if (createdOrganizationObjectives.length) {
    summaryParts.push(
      `Created ${createdOrganizationObjectives.length} organization objective${createdOrganizationObjectives.length === 1 ? "" : "s"}: ${createdOrganizationObjectives
        .map((item) => item.objectiveName)
        .join(", ")}.`
    );
  }

  if (createdDepartmentObjectives.length) {
    summaryParts.push(
      `Created ${createdDepartmentObjectives.length} department objective${createdDepartmentObjectives.length === 1 ? "" : "s"}: ${createdDepartmentObjectives
        .map((item) => item.departmentObjective)
        .join(", ")}.`
    );
  }

  if (failures.length) {
    summaryParts.push(failures.join(" "));
  }

  return {
    success: failures.length === 0,
    action: "create_bulk_objectives",
    createdOrganizationObjectives,
    createdDepartmentObjectives,
    failures,
    summary:
      summaryParts.join(" ") ||
      "No objectives were created.",
  };
};

const executeAction = async ({ plan, session }) => {
  switch (plan.action) {
    case "create_objective": {
      const objectiveItems = normalizeObjectiveItems(plan);

      if (!objectiveItems.length) {
        return {
          success: false,
          action: "create_objective",
          summary: "Please provide at least one organization objective title.",
        };
      }

      const objectiveItemsWithDescriptions = await ensureObjectiveDescriptions({
        token: session.token,
        objectives: objectiveItems,
      });

      await createObjective(
        session.token,
        objectiveItemsWithDescriptions.map((item) => ({
          objectiveName: item.objectiveName,
          description: item.description,
        }))
      );

      return {
        success: true,
        action: "create_objective",
        summary:
          objectiveItemsWithDescriptions.length === 1
            ? `Objective "${objectiveItemsWithDescriptions[0].objectiveName}" created successfully.`
            : `Created ${objectiveItemsWithDescriptions.length} organization objectives: ${objectiveItemsWithDescriptions
                .map((item) => item.objectiveName)
                .join(", ")}.`,
      };
    }

    case "create_key_result": {
      const objective = await findObjective(session.token, plan);

      if (!objective) {
        return {
          success: false,
          action: "create_key_result",
          summary:
            "I could not match that objective. Please send the exact objective name first.",
        };
      }

      const objectiveIdentifier =
        objective.id || objective._id || objective.objectiveId;

      await createKeyResult(session.token, {
        objectiveId: objectiveIdentifier,
        keyResultName: plan.keyResultName,
        description: plan.description || "",
        startValue: plan.startValue || "0",
        currentValue: plan.currentValue || plan.startValue || "0",
        targetValue: plan.targetValue || "100",
      });

      return {
        success: true,
        action: "create_key_result",
        summary: `Key result "${plan.keyResultName}" created for objective "${objective.objectiveName}".`,
      };
    }

    case "update_objective_progress": {
      const objective = await findObjective(session.token, plan);

      if (!objective) {
        return {
          success: false,
          action: "update_objective_progress",
          summary:
            "I could not match that objective. Please send the exact objective name first.",
        };
      }

      const objectiveIdentifier =
        objective.id || objective._id || objective.objectiveId;

      await updateObjectiveProgress(session.token, {
        objectiveId: objectiveIdentifier,
        progress: Number(plan.progressValue),
      });

      return {
        success: true,
        action: "update_objective_progress",
        summary: `Objective "${objective.objectiveName}" progress updated to ${plan.progressValue}%.`,
      };
    }

    case "get_objectives": {
      const response = await getObjectives(session.token);

      return {
        success: true,
        action: "get_objectives",
        objectives: response.data.data.objectives || [],
        summary: formatObjectives(response.data.data.objectives || []),
      };
    }

    case "create_department_objective": {
      const departmentItems = normalizeDepartmentObjectiveItems(plan);

      if (!departmentItems.length) {
        return {
          success: false,
          action: "create_department_objective",
          summary: "Please provide at least one department objective title.",
        };
      }

      if (departmentItems.length > 1) {
        return createBulkObjectives({ plan, session });
      }

      const [departmentItem] = departmentItems;
      const organizationObjectiveId = await resolveOrganizationObjectiveId(
        session.token,
        departmentItem,
        plan.objectiveName
      );

      if (!organizationObjectiveId) {
          return {
            success: false,
            action: "create_department_objective",
            summary: "I could not find the organization objective. Please provide the exact name or ID.",
          };
      }

      const response = await createDepartmentObjective(session.token, {
        organizationObjectiveId,
        departmentId:
          departmentItem.departmentId || session.selectedDepartmentId || "",
        departmentObjective: departmentItem.departmentObjective,
        description: departmentItem.description || "",
      });

      return {
        success: true,
        action: "create_department_objective",
        summary: `Department objective "${departmentItem.departmentObjective}" created successfully.`,
        data: response.data,
      };
    }

    case "create_bulk_objectives":
      return createBulkObjectives({ plan, session });

    case "get_department_objectives": {
      const response = await getDepartmentObjectives(
        session.token,
        plan.departmentId || ""
      );
      const deptObjectives = response.data.data.departmentObjectives ||
        response.data.data || [];

      return {
        success: true,
        action: "get_department_objectives",
        departmentObjectives: deptObjectives,
        summary: formatDepartmentObjectives(
          Array.isArray(deptObjectives) ? deptObjectives : []
        ),
      };
    }

    case "create_department_task_key_result": {
      let deptObjId = plan.departmentObjectiveId;

      if (!deptObjId) {
        const deptObjResponse = await getDepartmentObjectives(session.token, "");
        const deptObjectives = deptObjResponse.data.data.departmentObjectives ||
          deptObjResponse.data.data || [];

        if (Array.isArray(deptObjectives)) {
          const searchName = (plan.departmentObjective || plan.objectiveName || "").trim().toLowerCase();
          const matched = deptObjectives.find((d) => {
            const name = (d.objective || d.departmentObjective || "").trim().toLowerCase();
            return searchName && (name === searchName || name.includes(searchName));
          });

          if (matched) {
            deptObjId = matched.id || matched._id;
          }
        }
      }

      if (!deptObjId) {
        return {
          success: false,
          action: "create_department_task_key_result",
          summary: "I could not find the department objective. Please provide the exact name or ID.",
        };
      }

      const taskName = plan.taskName || plan.objectiveName || "";
      const krName = plan.departmentKeyResult || plan.keyResultName || "";

      if (!taskName || !krName) {
        return {
          success: false,
          action: "create_department_task_key_result",
          summary: "Both a task name and a key result name are needed. Please provide both.",
        };
      }

      const response = await createDepartmentTaskKeyResult(session.token, {
        departmentObjectiveId: deptObjId,
        task: taskName,
        keyResult: krName,
      });

      return {
        success: true,
        action: "create_department_task_key_result",
        summary: `Task "${taskName}" with key result "${krName}" created successfully.`,
        data: response.data,
      };
    }

    case "get_profile": {
      const response = await getCurrentOrganizationProfile(session.token);

      return {
        success: true,
        action: "get_profile",
        profile: response.data.data,
        summary: formatProfile(response.data.data),
      };
    }

    case "get_profile_details": {
      const response = await getProfileDetails(session.token, session.role);

      return {
        success: true,
        action: "get_profile_details",
        profileDetails: response.data.data,
        summary: formatProfileDetails(response.data.data),
      };
    }

    case "get_departments": {
      const response = await getDepartments(session.token);
      const departments =
        response.data.data.departments || response.data.data.departmentUsers || [];

      return {
        success: true,
        action: "get_departments",
        departments,
        summary: formatDepartments(departments),
      };
    }

    case "get_current_department": {
      const response = await getCurrentDepartment(session.token);

      return {
        success: true,
        action: "get_current_department",
        department: response.data.data,
        summary: formatCurrentDepartment(response.data.data),
      };
    }

    case "get_current_department_objectives": {
      const response = await getCurrentDepartmentObjectives(session.token);
      const departmentObjectives =
        response.data.data.departmentObjectives ||
        response.data.data.objectives ||
        response.data.data ||
        [];

      return {
        success: true,
        action: "get_current_department_objectives",
        departmentObjectives,
        summary: formatDepartmentObjectives(
          Array.isArray(departmentObjectives) ? departmentObjectives : []
        ),
      };
    }

    case "get_department_objective_key_results": {
      const departmentObjective = await findDepartmentObjective(
        session.token,
        plan
      );

      if (!departmentObjective) {
        return {
          success: false,
          action: "get_department_objective_key_results",
          summary:
            "I could not find that department objective. Please send the exact department objective name first.",
        };
      }

      const departmentObjectiveId =
        departmentObjective.id ||
        departmentObjective._id ||
        departmentObjective.departmentObjectiveId;
      const response = await getDepartmentObjectiveKeyResults(
        session.token,
        departmentObjectiveId,
        session.role
      );
      const items = extractDepartmentObjectiveKeyResultItems(response.data.data);

      return {
        success: true,
        action: "get_department_objective_key_results",
        keyResults: items,
        summary: formatDepartmentObjectiveKeyResults(
          Array.isArray(items) ? items : []
        ),
      };
    }

    case "get_dashboard_year_filters": {
      const response = await getYearFilters(session.token, session.role);

      return {
        success: true,
        action: "get_dashboard_year_filters",
        data: response.data.data,
        summary: formatDashboardStats("Dashboard year filters", response.data.data),
      };
    }

    case "get_dashboard_objective_growth": {
      if (!plan.year || !plan.quarter) {
        return {
          success: false,
          action: "get_dashboard_objective_growth",
          summary: "Please provide both year and quarter, for example 2025-26 quarter 2.",
        };
      }

      const response = await getObjectiveGrowth(session.token, {
        year: plan.year,
        quarter: plan.quarter,
        role: session.role,
      });

      return {
        success: true,
        action: "get_dashboard_objective_growth",
        data: response.data.data,
        summary: formatDashboardStats(
          `Objective growth for ${plan.year} Q${plan.quarter}`,
          response.data.data
        ),
      };
    }

    case "get_dashboard_department_growth": {
      if (!plan.year || !plan.quarter) {
        return {
          success: false,
          action: "get_dashboard_department_growth",
          summary: "Please provide both year and quarter, for example 2025-26 quarter 2.",
        };
      }

      const response = await getDepartmentGrowth(session.token, {
        year: plan.year,
        quarter: plan.quarter,
      });

      return {
        success: true,
        action: "get_dashboard_department_growth",
        data: response.data.data,
        summary: formatDashboardStats(
          `Department growth for ${plan.year} Q${plan.quarter}`,
          response.data.data
        ),
      };
    }

    case "get_dashboard_yearly_growth": {
      if (!plan.year) {
        return {
          success: false,
          action: "get_dashboard_yearly_growth",
          summary: "Please provide the year, for example 2025-26.",
        };
      }

      const response = await getYearlyGrowth(session.token, {
        year: plan.year,
        role: session.role,
      });

      return {
        success: true,
        action: "get_dashboard_yearly_growth",
        data: response.data.data,
        summary: formatDashboardStats(
          `Yearly growth for ${plan.year}`,
          response.data.data
        ),
      };
    }

    case "get_schedule_details": {
      const response = await getScheduleDetails(session.token);
      const scheduleDetails = response.data.data.scheuleDetails || response.data.data || {};
      const hasSchedule = Boolean(Object.keys(scheduleDetails).length);

      return {
        success: true,
        action: "get_schedule_details",
        scheduleDetails,
        hasSchedule,
        summary: hasSchedule
          ? formatScheduleDetails(scheduleDetails)
          : [
              formatScheduleDetails(scheduleDetails),
              "",
              "Would you like to set it up now?",
            ].join("\n"),
      };
    }

    case "update_schedule_details": {
      if (
        !plan.dayName ||
        !plan.meetingTime ||
        !plan.timezone ||
        !plan.timeSlotHoursBeforeMeeting
      ) {
        return {
          success: false,
          action: "update_schedule_details",
          summary:
            "Please provide day, meeting time, timezone, and timer hours before meeting. Example: Tuesday 14:30:00 Asia/Kolkata 24 hours before.",
        };
      }

      const response = await updateScheduleDetails(session.token, {
        dayName: plan.dayName,
        meetingTime: plan.meetingTime,
        timezone: plan.timezone,
        timeSlotHoursBeforeMeeting: Number(plan.timeSlotHoursBeforeMeeting),
      });
      const scheduleDetails = response.data.data.scheuleDetails || response.data.data || {};

      return {
        success: true,
        action: "update_schedule_details",
        scheduleDetails,
        summary: [
          "Score-management schedule updated successfully.",
          "",
          formatScheduleDetails(scheduleDetails),
        ].join("\n"),
      };
    }

    case "get_score_edit_status": {
      const response = await getScoreEditStatus(session.token);
      const scoreEditDetails =
        response.data.data.scoreEditDetails || response.data.data || {};

      return {
        success: true,
        action: "get_score_edit_status",
        scoreEditDetails,
        summary: formatScoreEditStatus(scoreEditDetails),
      };
    }

    case "send_help":
      return {
        success: true,
        action: "send_help",
        help: HELP_TEXT,
        summary: HELP_TEXT,
      };

    default:
      throw new Error(`Unsupported action: ${plan.action}`);
  }
};

const normalizePlan = (plan) => {
  return {
    action: plan.action || "general_reply",
    objectiveId: plan.objectiveId || "",
    objectiveName: plan.objectiveName || "",
    departmentObjective: plan.departmentObjective || "",
    organizationObjectiveId: plan.organizationObjectiveId || "",
    departmentObjectiveId: plan.departmentObjectiveId || "",
    departmentId: plan.departmentId || "",
    taskName: plan.taskName || "",
    departmentKeyResult: plan.departmentKeyResult || "",
    departmentObjectiveName: plan.departmentObjectiveName || "",
    keyResultName: plan.keyResultName || "",
    targetValue: plan.targetValue || "",
    startValue: plan.startValue || "",
    currentValue: plan.currentValue || "",
    progressValue: plan.progressValue || "",
    year: plan.year || "",
    quarter: plan.quarter || "",
    dayName: plan.dayName || "",
    meetingTime: plan.meetingTime || "",
    timezone: plan.timezone || "",
    timeSlotHoursBeforeMeeting: plan.timeSlotHoursBeforeMeeting || "",
    description: plan.description || "",
    organizationObjective: plan.organizationObjective || "",
    organizationObjectives: Array.isArray(plan.organizationObjectives)
      ? plan.organizationObjectives
      : [],
    departmentObjectives: Array.isArray(plan.departmentObjectives)
      ? plan.departmentObjectives
      : [],
    reply: plan.reply || "",
  };
};

const findObjective = async (token, plan) => {
  const response = await getObjectives(token);
  const objectives = response.data.data.objectives || [];

  return findObjectiveByReference(
    objectives,
    plan.objectiveId,
    plan.objectiveName
  );
};

const findDepartmentObjective = async (token, plan) => {
  const response = plan.departmentId
    ? await getDepartmentObjectivesForDepartment(
        token,
        plan.departmentId,
        plan.role || "MANAGEMENT"
      )
    : await getDepartmentObjectives(token, plan.departmentId || "");
  const departmentObjectives =
    response.data.data.departmentObjectives ||
    response.data.data.departments ||
    response.data.data ||
    [];
  const normalizedName = String(
    plan.departmentObjectiveName || plan.departmentObjective || plan.objectiveName || ""
  )
    .trim()
    .toLowerCase();

  if (plan.departmentObjectiveId) {
    const byId = departmentObjectives.find((item) => {
      const id = item.id || item._id || item.departmentObjectiveId;
      return String(id) === String(plan.departmentObjectiveId);
    });

    if (byId) {
      return byId;
    }
  }

  if (!normalizedName) {
    return null;
  }

  return (
    departmentObjectives.find((item) => {
      const value = String(item.objective || item.departmentObjective || "")
        .trim()
        .toLowerCase();
      return value === normalizedName;
    }) ||
    departmentObjectives.find((item) => {
      const value = String(item.objective || item.departmentObjective || "")
        .trim()
        .toLowerCase();
      return value.includes(normalizedName);
    }) ||
    null
  );
};

const buildStrategyMessages = ({ message, profile, departments, mode, organizationObjective }) => {
  const departmentList = departments?.length
    ? departments
        .map((department, index) => {
          return `${index + 1}. ${department.departmentName || "-"} (${department.fullName || "No owner"})`;
        })
        .join("\n")
    : "No department data available.";

  const profileSummary = profile
    ? [
        `Company: ${profile.companyName || "-"}`,
        `Organization name: ${profile.fullName || "-"}`,
        `About: ${profile.aboutCompany || "-"}`,
        `Mission: ${profile.companyMission || "-"}`,
        `Vision: ${profile.companyVision || "-"}`,
        `Purpose: ${profile.purpose || "-"}`,
        `Solution: ${profile.solution || "-"}`,
      ].join("\n")
    : "No organization profile available.";

  return [
    {
      role: "system",
      content: [
        "You are an OKR strategy advisor for a business using Telegram.",
        "Write practical, structured guidance.",
        "Keep the response concise but useful.",
        "For strategy_advice mode, propose exactly 3 alternative organization objectives unless the user explicitly asks for only one final objective.",
        "Each organization objective must be distinct and independently creatable in the OKR system.",
        "After the objective list, give 2-4 measurable key results for each objective.",
        "Key results must be outcome-focused, not task-focused.",
        "If department alignment is requested, map likely department contributions from the organization objective.",
        "Avoid markdown symbols like ** because Telegram plain text may show them literally.",
        "Use this plain-text structure for strategy_advice mode:",
        "Suggested Organization Objectives:",
        "1. <objective title> - <one-line description>",
        "2. <objective title> - <one-line description>",
        "3. <objective title> - <one-line description>",
        "",
        "Then add supporting sections like Key Results and Department Contributions.",
      ].join("\n"),
    },
    {
      role: "user",
      content: [
        `Mode: ${mode}`,
        `User request: ${message}`,
        `Organization objective hint: ${organizationObjective || "-"}`,
        "",
        "Organization profile:",
        profileSummary,
        "",
        "Known departments:",
        departmentList,
        "",
        "Respond with plain text sections and actionable suggestions.",
      ].join("\n"),
    },
  ];
};

const buildFinalMessages = ({ message, plan, toolResult }) => {
  return [
    {
      role: "system",
      content: [
        "You are OKR AI Agent replying to a Telegram user.",
        "Write a concise, helpful final message.",
        "Do not mention internal planning, JSON, tools, or API calls.",
        "If data came from the backend, present it clearly.",
      ].join("\n"),
    },
    {
      role: "user",
      content: [
        `Original user message: ${message}`,
        `Chosen action: ${plan.action}`,
        `Planner hint: ${plan.reply || "-"}`,
        "Backend/tool result:",
        JSON.stringify(toolResult, null, 2),
      ].join("\n"),
    },
  ];
};

const loadStrategyContext = async (token) => {
  const profileResponse = await getCurrentOrganizationProfile(token);
  const departmentResponse = await getDepartments(token);
  const departments =
    departmentResponse.data.data.departments ||
    departmentResponse.data.data.departmentUsers ||
    [];

  return {
    profile: profileResponse.data.data,
    departments,
  };
};

const generateStrategyAdvice = async (token, message) => {
  const strategyPlan = await generateStructuredStrategyPlan(token, message);

  return {
    text: formatStructuredStrategyAdvice(strategyPlan),
    organizationObjectives: strategyPlan.organizationObjectives.map(
      ({ objectiveName, description }) => ({
        objectiveName,
        description,
      })
    ),
  };
};

const generateDepartmentAlignment = async (
  token,
  message,
  organizationObjective
) => {
  const { profile, departments } = await loadStrategyContext(token);
  const response = await chatWithModel({
    messages: buildStrategyMessages({
      message,
      profile,
      departments,
      mode: "department_alignment",
      organizationObjective,
    }),
  });

  return (
    response.message?.content?.trim() ||
    "I can help map department objectives from your organization objective."
  );
};

const generateDepartmentSpecificAlignment = async (
  token,
  organizationObjective,
  departmentName
) => {
  const departmentObjectives = await generateStructuredDepartmentPlan(
    token,
    organizationObjective,
    departmentName
  );

  return {
    text: formatStructuredDepartmentAdvice({
      organizationObjective,
      departmentName,
      departmentObjectives,
    }),
    departmentObjectives,
  };
};

const generateDepartmentTaskSuggestions = async (
  token,
  departmentObjectiveName,
  departmentName
) => {
  const taskKeyResults = await generateStructuredDepartmentTaskPlan(
    token,
    departmentObjectiveName,
    departmentName
  );

  return {
    text: formatStructuredDepartmentTaskAdvice({
      departmentObjectiveName,
      departmentName,
      taskKeyResults,
    }),
    taskKeyResults,
  };
};

const generateWeightageSuggestions = async (
  token,
  departmentObjectiveName,
  tasks = []
) => {
  const response = await chatWithModel({
    messages: [
      {
        role: "system",
        content: [
          "You are an OKR weightage allocator.",
          "Return only valid JSON.",
          "Distribute task weightage across the provided tasks.",
          "The total weightage must be exactly 100.",
          "Each weightage must be an integer from 0 to 100.",
          "Prefer higher weightage for higher business impact, precedence, and execution priority.",
          "Schema:",
          "{",
          '  "allocations": [',
          "    {",
          '      "taskName": "string",',
          '      "weightage": 0,',
          '      "reason": "string"',
          "    }",
          "  ]",
          "}",
        ].join("\n"),
      },
      {
        role: "user",
        content: [
          `Department objective: ${departmentObjectiveName}`,
          "",
          "Tasks:",
          ...tasks.map((task, index) => (
            `${index + 1}. ${task.objectiveInitiativeTask || task.task || "-"} | KR: ${task.keyResult || "-"} | Current weightage: ${task.weightage ?? 0}%`
          )),
        ].join("\n"),
      },
    ],
    format: "json",
  });

  const parsed = parseJson(response.message?.content || "{}");
  const allocations = Array.isArray(parsed.allocations) ? parsed.allocations : [];

  const normalized = allocations
    .map((item) => ({
      taskName: String(item?.taskName || "").trim(),
      weightage: Number(item?.weightage || 0),
      reason: String(item?.reason || "").trim(),
    }))
    .filter((item) => item.taskName && Number.isFinite(item.weightage))
    .map((item) => ({
      ...item,
      weightage: Math.max(0, Math.min(100, Math.round(item.weightage))),
    }));

  return normalized;
};

const clearScheduleFlowState = {
  scheduleFlowMode: "",
  pendingScheduleDayName: "",
  pendingScheduleTimezone: "",
  pendingScheduleTimerHours: "",
  awaitingScheduleTimeInput: false,
  awaitingScheduleTimezoneInput: false,
  awaitingScheduleSetupConfirmation: false,
  promptedForScheduleSetup: false,
};

const clearWeightageFlowState = {
  pendingWeightageDepartmentId: "",
  pendingWeightageDepartmentName: "",
  pendingWeightageDepartmentObjectiveId: "",
  pendingWeightageDepartmentObjectiveName: "",
  pendingWeightageItems: [],
  pendingWeightageKeyResultId: "",
  pendingWeightageTaskName: "",
  awaitingWeightageInput: false,
  suggestedWeightageAllocations: [],
  weightageFlowMode: "",
};

const clearCurrentScoreFlowState = {
  pendingCurrentScoreDepartmentObjectiveId: "",
  pendingCurrentScoreDepartmentObjectiveName: "",
  pendingCurrentScoreItems: [],
  pendingCurrentScoreKeyResultId: "",
  pendingCurrentScoreTaskName: "",
  awaitingCurrentScoreInput: false,
};

const runAgent = async ({ message, session, history }) => {
  const callbackSelection = parseCallbackData(message);

  if (session?.awaitingScheduleSetupConfirmation && isScheduleAffirmative(message)) {
    return {
      text: "Let's set up your score-management schedule. First, choose the meeting day.",
      replyMarkup: buildInlineScheduleDayKeyboard(),
      sessionUpdates: {
        ...clearScheduleFlowState,
        scheduleFlowMode: "setup",
      },
    };
  }

  if (isScheduleAffirmative(message) && session?.promptedForScheduleSetup) {
    return {
      text: "Let's set up your score-management schedule. First, choose the meeting day.",
      replyMarkup: buildInlineScheduleDayKeyboard(),
      sessionUpdates: {
        ...clearScheduleFlowState,
        scheduleFlowMode: "setup",
        promptedForScheduleSetup: false,
      },
    };
  }

  if (callbackSelection?.action === "schedule_start_setup" || callbackSelection?.action === "schedule_start_update") {
    const flowMode =
      callbackSelection.action === "schedule_start_update" ? "update" : "setup";

    return {
      text: `Let's ${flowMode} your score-management schedule. First, choose the meeting day.`,
      clearSourceReplyMarkup: true,
      replyMarkup: buildInlineScheduleDayKeyboard(),
      sessionUpdates: {
        ...clearScheduleFlowState,
        scheduleFlowMode: flowMode,
      },
    };
  }

  if (callbackSelection?.action === "schedule_show_current") {
    const response = await getScheduleDetails(session.token);
    const scheduleDetails = response.data.data.scheuleDetails || response.data.data || {};

    return {
      text: formatScheduleDetails(scheduleDetails),
      clearSourceReplyMarkup: true,
      replyMarkup: buildInlineScheduleActionKeyboard(
        Boolean(Object.keys(scheduleDetails).length)
      ),
      sessionUpdates: {
        awaitingScheduleSetupConfirmation: false,
      },
    };
  }

  if (callbackSelection?.action === "schedule_day") {
    const selectedDay = SCHEDULE_DAYS[Number(callbackSelection.args[0])];

    if (!selectedDay) {
      return {
        text: "I could not read that day selection. Please try again.",
      };
    }

    return {
      text: `Selected day: ${selectedDay}.\n\nNow choose the timezone.`,
      clearSourceReplyMarkup: true,
      replyMarkup: buildInlineScheduleTimezoneKeyboard(),
      sessionUpdates: {
        pendingScheduleDayName: selectedDay,
      },
    };
  }

  if (callbackSelection?.action === "schedule_timezone") {
    const timezoneOption =
      SCHEDULE_TIMEZONE_OPTIONS[Number(callbackSelection.args[0])];

    if (!timezoneOption) {
      return {
        text: "I could not read that timezone selection. Please try again.",
      };
    }

    return {
      text: `Selected timezone: ${timezoneOption.value}.\n\nNow choose how many hours before the meeting score updates should close.`,
      clearSourceReplyMarkup: true,
      replyMarkup: buildInlineScheduleTimerKeyboard(),
      sessionUpdates: {
        pendingScheduleTimezone: timezoneOption.value,
        awaitingScheduleTimezoneInput: false,
      },
    };
  }

  if (callbackSelection?.action === "schedule_timezone_manual") {
    return {
      text: "Send your timezone in IANA format, for example: Asia/Kolkata",
      clearSourceReplyMarkup: true,
      sessionUpdates: {
        awaitingScheduleTimezoneInput: true,
      },
    };
  }

  if (session?.awaitingScheduleTimezoneInput) {
    const timezone = extractTimezoneInput(message);

    if (!timezone) {
      return {
        text: "Please send a valid timezone like Asia/Kolkata.",
      };
    }

    return {
      text: `Selected timezone: ${timezone}.\n\nNow choose how many hours before the meeting score updates should close.`,
      replyMarkup: buildInlineScheduleTimerKeyboard(),
      sessionUpdates: {
        pendingScheduleTimezone: timezone,
        awaitingScheduleTimezoneInput: false,
      },
    };
  }

  if (callbackSelection?.action === "schedule_timer") {
    const timerHours = String(callbackSelection.args[0] || "").trim();

    if (!timerHours) {
      return {
        text: "I could not read that timer selection. Please try again.",
      };
    }

    return {
      text: [
        `Selected timer: ${timerHours} hours before meeting.`,
        "",
        "Now send the meeting time.",
        "Accepted formats: 14:30:00, 14:30, 2:30 PM, 2 PM",
      ].join("\n"),
      clearSourceReplyMarkup: true,
      sessionUpdates: {
        pendingScheduleTimerHours: timerHours,
        awaitingScheduleTimeInput: true,
      },
    };
  }

  if (callbackSelection?.action === "schedule_close") {
    return {
      text: "Closed the schedule setup flow.",
      clearSourceReplyMarkup: true,
      sessionUpdates: clearScheduleFlowState,
    };
  }

  if (session?.awaitingScheduleTimeInput) {
    const meetingTime = extractScheduleTimeInput(message);

    if (!meetingTime) {
      return {
        text:
          "Please send a valid meeting time. Accepted formats: 14:30:00, 14:30, 2:30 PM, 2 PM",
      };
    }

    const toolResult = await executeAction({
      plan: {
        action: "update_schedule_details",
        dayName: session.pendingScheduleDayName,
        meetingTime,
        timezone: session.pendingScheduleTimezone,
        timeSlotHoursBeforeMeeting: session.pendingScheduleTimerHours,
      },
      session,
    });

    return {
      text: toolResult.summary || "Schedule updated successfully.",
      sessionUpdates: clearScheduleFlowState,
    };
  }

  if (isScheduleSetupIntentMessage(message)) {
    const scheduleResponse = await getScheduleDetails(session.token);
    const scheduleDetails =
      scheduleResponse.data.data.scheuleDetails || scheduleResponse.data.data || {};
    const hasExistingSchedule = Boolean(Object.keys(scheduleDetails).length);

    return {
      text: hasExistingSchedule
        ? "I understood that you want to update your meeting schedule. Use the buttons below to continue."
        : "I understood that you want to set up your meeting schedule. Use the buttons below to continue.",
      replyMarkup: buildInlineScheduleActionKeyboard(hasExistingSchedule),
      sessionUpdates: {
        awaitingScheduleSetupConfirmation: !hasExistingSchedule,
        promptedForScheduleSetup: !hasExistingSchedule,
      },
    };
  }

  if (isScheduleViewIntentMessage(message)) {
    const scheduleResponse = await getScheduleDetails(session.token);
    const scheduleDetails =
      scheduleResponse.data.data.scheuleDetails || scheduleResponse.data.data || {};
    const hasExistingSchedule = Boolean(Object.keys(scheduleDetails).length);

    return {
      text: hasExistingSchedule
        ? formatScheduleDetails(scheduleDetails)
        : [
            formatScheduleDetails(scheduleDetails),
            "",
            "Use the buttons below if you want to set it up now.",
          ].join("\n"),
      replyMarkup: buildInlineScheduleActionKeyboard(hasExistingSchedule),
      sessionUpdates: {
        awaitingScheduleSetupConfirmation: !hasExistingSchedule,
        promptedForScheduleSetup: !hasExistingSchedule,
      },
    };
  }

  if (callbackSelection?.action === "select_org_for_dept") {
    const [objectiveId] = callbackSelection.args;
    const selectedObjective = await getObjectiveById(
      session.token,
      objectiveId
    );

    if (!selectedObjective) {
      return {
        text: "I could not find that organization objective anymore. Please try again.",
      };
    }

    const objectiveName = getObjectiveDisplayName(selectedObjective);
    const { departments } = await loadStrategyContext(session.token);
    const departmentOptions = buildDepartmentSessionOptions(departments);
    const objectiveIdentifier =
      selectedObjective.id ||
      selectedObjective._id ||
      selectedObjective.objectiveId;

    return {
      text: `Selected organization objective: ${objectiveName}\n\nNow select the department below.`,
      replyMarkup: buildInlineDepartmentSelectionKeyboard(departments),
      sessionUpdates: {
        selectedOrganizationObjectiveId: objectiveIdentifier,
        selectedOrganizationObjectiveName: objectiveName,
        selectedDepartmentId: "",
        selectedDepartmentName: "",
        pendingDepartmentOptions: departmentOptions,
        suggestedDepartmentObjectives: [],
      },
    };
  }

  if (callbackSelection?.action === "select_dept_for_org") {
    const [departmentIndexValue] = callbackSelection.args;
    const departmentIndex = Number(departmentIndexValue);
    const selectedObjective = session?.selectedOrganizationObjectiveId
      ? await getObjectiveById(
          session.token,
          session.selectedOrganizationObjectiveId
        )
      : null;
    const selectedDepartmentOption = Array.isArray(session?.pendingDepartmentOptions)
      ? session.pendingDepartmentOptions[departmentIndex]
      : null;
    const selectedDepartment = selectedDepartmentOption?.id
      ? await getDepartmentById(session.token, selectedDepartmentOption.id)
      : null;

    if (!selectedObjective || !selectedDepartment) {
      return {
        text: "I could not find that objective or department anymore. Please try again.",
      };
    }

    const objectiveName = getObjectiveDisplayName(selectedObjective);
    const departmentName = getDepartmentDisplayName(selectedDepartment);
    const departmentPlan = await generateDepartmentSpecificAlignment(
      session.token,
      objectiveName,
      departmentName
    );

    return {
      text: departmentPlan.text,
      replyMarkup: buildInlineDepartmentObjectiveCreateKeyboard(
        departmentName,
        departmentPlan.departmentObjectives
      ),
      sessionUpdates: {
        selectedOrganizationObjectiveId:
          selectedObjective.id ||
          selectedObjective._id ||
          selectedObjective.objectiveId,
        selectedOrganizationObjectiveName: objectiveName,
        selectedDepartmentId:
          selectedDepartment.id ||
          selectedDepartment._id ||
          selectedDepartment.departmentId,
        selectedDepartmentName: departmentName,
        pendingDepartmentOptions: [],
        suggestedDepartmentObjectives: departmentPlan.departmentObjectives,
      },
    };
  }

  if (callbackSelection?.action === "select_dept_for_task_kr") {
    const [departmentIndexValue] = callbackSelection.args;
    const departmentIndex = Number(departmentIndexValue);
    const selectedDepartmentOption = Array.isArray(session?.pendingDepartmentOptions)
      ? session.pendingDepartmentOptions[departmentIndex]
      : null;
    const selectedDepartment = selectedDepartmentOption?.id
      ? await getDepartmentById(session.token, selectedDepartmentOption.id)
      : null;

    if (!selectedDepartment) {
      return {
        text: "I could not find that department anymore. Please try again.",
      };
    }

    const selectedDepartmentId =
      selectedDepartment.id ||
      selectedDepartment._id ||
      selectedDepartment.departmentId;
    const selectedDepartmentName = getDepartmentDisplayName(selectedDepartment);
    const departmentObjectivesResponse =
      await getDepartmentObjectivesForDepartment(
        session.token,
        selectedDepartmentId,
        session.role
      );
    const departmentObjectives =
      departmentObjectivesResponse.data.data.departmentObjectives ||
      departmentObjectivesResponse.data.data.departments ||
      departmentObjectivesResponse.data.data ||
      [];

    if (!Array.isArray(departmentObjectives) || !departmentObjectives.length) {
      return {
        text: `No department objectives found for ${selectedDepartmentName}. Create a department objective first, then come back to task and key result creation.`,
        clearSourceReplyMarkup: true,
        sessionUpdates: {
          selectedDepartmentId: selectedDepartmentId || "",
          selectedDepartmentName,
          pendingDepartmentOptions: [],
          pendingDepartmentObjectiveId: "",
          pendingDepartmentObjectiveName: "",
          suggestedTaskKeyResults: [],
          awaitingTaskKeyResultInput: false,
        },
      };
    }

    return {
      text: `Selected department: ${selectedDepartmentName}\n\nNow choose the department objective below.`,
      replyMarkup: buildInlineDepartmentObjectiveTaskKeyboard(
        departmentObjectives
      ),
      clearSourceReplyMarkup: true,
      sessionUpdates: {
        selectedDepartmentId: selectedDepartmentId || "",
        selectedDepartmentName,
        pendingDepartmentOptions: [],
        pendingDepartmentObjectiveId: "",
        pendingDepartmentObjectiveName: "",
        suggestedTaskKeyResults: [],
        awaitingTaskKeyResultInput: false,
      },
    };
  }

  if (callbackSelection?.action === "create_suggested_dept_obj") {
    const [indexValue] = callbackSelection.args;
    const selectedIndex = Number(indexValue);
    const departmentObjectives = Array.isArray(session?.suggestedDepartmentObjectives)
      ? session.suggestedDepartmentObjectives
      : [];
    const selectedItem = departmentObjectives[selectedIndex];

    if (
      !selectedItem ||
      !session?.selectedOrganizationObjectiveId ||
      !session?.selectedDepartmentId
    ) {
      return {
        text: "I could not find the selected department-objective draft. Please generate department objectives again.",
      };
    }

    const response = await createDepartmentObjective(session.token, {
      organizationObjectiveId: session.selectedOrganizationObjectiveId,
      departmentId: session.selectedDepartmentId,
      departmentObjective: selectedItem.departmentObjective,
      description: selectedItem.description || "",
    });
    const remainingDepartmentObjectives = departmentObjectives.filter(
      (_, index) => index !== selectedIndex
    );

    return {
      text: remainingDepartmentObjectives.length
        ? `Department objective "${selectedItem.departmentObjective}" created successfully for ${session.selectedDepartmentName}.\n\nYou can create the remaining ${remainingDepartmentObjectives.length} suggestion${remainingDepartmentObjectives.length === 1 ? "" : "s"} below, or tap Close to exit this flow.`
        : `Department objective "${selectedItem.departmentObjective}" created successfully for ${session.selectedDepartmentName}.\n\nAll set. No more draft department objectives are left in this flow.`,
      data: response.data,
      clearSourceReplyMarkup: true,
      ...(remainingDepartmentObjectives.length
        ? {
            replyMarkup: buildInlineDepartmentObjectiveCreateKeyboard(
              session.selectedDepartmentName || "Department",
              remainingDepartmentObjectives
            ),
          }
        : {}),
      sessionUpdates: {
        suggestedDepartmentObjectives: remainingDepartmentObjectives,
      },
    };
  }

  if (callbackSelection?.action === "create_all_suggested_dept_obj") {
    const departmentObjectives = Array.isArray(session?.suggestedDepartmentObjectives)
      ? session.suggestedDepartmentObjectives
      : [];

    if (
      !departmentObjectives.length ||
      !session?.selectedOrganizationObjectiveId ||
      !session?.selectedDepartmentId
    ) {
      return {
        text: "I could not find the stored department-objective drafts. Please generate department objectives again.",
      };
    }

    for (const item of departmentObjectives) {
      await createDepartmentObjective(session.token, {
        organizationObjectiveId: session.selectedOrganizationObjectiveId,
        departmentId: session.selectedDepartmentId,
        departmentObjective: item.departmentObjective,
        description: item.description || "",
      });
    }

    return {
      text: `Created ${departmentObjectives.length} department objectives for ${session.selectedDepartmentName}.\n\nThis department-objective flow is now closed.`,
      clearSourceReplyMarkup: true,
      sessionUpdates: {
        suggestedDepartmentObjectives: [],
      },
    };
  }

  if (callbackSelection?.action === "close_suggested_dept_obj_flow") {
    return {
      text: `Closed the department-objective selection flow for ${session?.selectedDepartmentName || "the selected department"}.`,
      clearSourceReplyMarkup: true,
      sessionUpdates: {
        suggestedDepartmentObjectives: [],
      },
    };
  }

  if (callbackSelection?.action === "select_dept_obj_for_task_kr") {
    const [departmentObjectiveId] = callbackSelection.args;
    const selectedDepartmentObjective = await findDepartmentObjective(
      session.token,
      {
        departmentObjectiveId,
        departmentId: session?.selectedDepartmentId || "",
        role: session?.role || "MANAGEMENT",
      }
    );

    if (!selectedDepartmentObjective) {
      return {
        text: "I could not find that department objective anymore. Please try again.",
      };
    }

    const selectedName =
      selectedDepartmentObjective.objective ||
      selectedDepartmentObjective.departmentObjective ||
      "Department objective";
    const suggestionPlan = await generateDepartmentTaskSuggestions(
      session.token,
      selectedName,
      session?.selectedDepartmentName || ""
    );

    return {
      text: suggestionPlan.text,
      replyMarkup: buildInlineSuggestedTaskKeyResultKeyboard(
        suggestionPlan.taskKeyResults
      ),
      clearSourceReplyMarkup: true,
      sessionUpdates: {
        pendingDepartmentObjectiveId:
          selectedDepartmentObjective.id ||
          selectedDepartmentObjective._id ||
          selectedDepartmentObjective.departmentObjectiveId,
        pendingDepartmentObjectiveName: selectedName,
        awaitingTaskKeyResultInput: false,
        suggestedTaskKeyResults: suggestionPlan.taskKeyResults,
      },
    };
  }

  if (callbackSelection?.action === "manual_task_kr_entry") {
    return {
      text: [
        `Selected department objective: ${session?.pendingDepartmentObjectiveName || "the selected department objective"}`,
        "",
        "Now send the task and key result in one message.",
        "Format: task name | key result",
        "Example: Prepare onboarding checklist | Complete onboarding checklist for 100% of new hires",
      ].join("\n"),
      clearSourceReplyMarkup: true,
      sessionUpdates: {
        awaitingTaskKeyResultInput: true,
      },
    };
  }

  if (callbackSelection?.action === "create_suggested_task_kr") {
    const [indexValue] = callbackSelection.args;
    const selectedIndex = Number(indexValue);
    const suggestedTaskKeyResults = Array.isArray(session?.suggestedTaskKeyResults)
      ? session.suggestedTaskKeyResults
      : [];
    const selectedItem = suggestedTaskKeyResults[selectedIndex];

    if (!selectedItem || !session?.pendingDepartmentObjectiveId) {
      return {
        text: "I could not find that suggested task and key result anymore. Please generate them again.",
      };
    }

    const toolResult = await executeAction({
      plan: {
        action: "create_department_task_key_result",
        departmentObjectiveId: session.pendingDepartmentObjectiveId,
        taskName: selectedItem.taskName,
        departmentKeyResult: selectedItem.departmentKeyResult,
      },
      session,
    });

    const remainingSuggestions = suggestedTaskKeyResults.filter(
      (_, index) => index !== selectedIndex
    );

    return {
      text: remainingSuggestions.length
        ? `${toolResult.summary}\n\nYou can still create the remaining suggested task and key-result pairs below, or choose manual entry.`
        : `${toolResult.summary}\n\nAll suggested task and key-result pairs have been handled for this flow.`,
      clearSourceReplyMarkup: true,
      ...(remainingSuggestions.length
        ? {
            replyMarkup: buildInlineSuggestedTaskKeyResultKeyboard(
              remainingSuggestions
            ),
          }
        : {}),
      sessionUpdates: {
        suggestedTaskKeyResults: remainingSuggestions,
        awaitingTaskKeyResultInput: false,
      },
    };
  }

  if (callbackSelection?.action === "create_all_suggested_task_kr") {
    const suggestedTaskKeyResults = Array.isArray(session?.suggestedTaskKeyResults)
      ? session.suggestedTaskKeyResults
      : [];

    if (!suggestedTaskKeyResults.length || !session?.pendingDepartmentObjectiveId) {
      return {
        text: "I could not find the stored task and key-result suggestions. Please generate them again.",
      };
    }

    for (const item of suggestedTaskKeyResults) {
      await executeAction({
        plan: {
          action: "create_department_task_key_result",
          departmentObjectiveId: session.pendingDepartmentObjectiveId,
          taskName: item.taskName,
          departmentKeyResult: item.departmentKeyResult,
        },
        session,
      });
    }

    return {
      text: `Created ${suggestedTaskKeyResults.length} task and key-result pairs for ${session.pendingDepartmentObjectiveName || "the selected department objective"}.`,
      clearSourceReplyMarkup: true,
      sessionUpdates: {
        suggestedTaskKeyResults: [],
        awaitingTaskKeyResultInput: false,
      },
    };
  }

  if (callbackSelection?.action === "close_task_kr_flow") {
    return {
      text: "Closed the task and key-result selection flow.",
      clearSourceReplyMarkup: true,
      sessionUpdates: {
        pendingDepartmentObjectiveId: "",
        pendingDepartmentObjectiveName: "",
        awaitingTaskKeyResultInput: false,
        suggestedTaskKeyResults: [],
      },
    };
  }

  if (session?.awaitingTaskKeyResultInput && session?.pendingDepartmentObjectiveId) {
    const parsedTaskInput = extractTaskAndKeyResultInput(message);

    if (!parsedTaskInput) {
      return {
        text: [
          `You're creating a task and key result under: ${session.pendingDepartmentObjectiveName || "the selected department objective"}`,
          "",
          "Please send it in this format:",
          "task name | key result",
          "Example: Prepare onboarding checklist | Complete onboarding checklist for 100% of new hires",
        ].join("\n"),
      };
    }

    const toolResult = await executeAction({
      plan: {
        action: "create_department_task_key_result",
        departmentObjectiveId: session.pendingDepartmentObjectiveId,
        taskName: parsedTaskInput.taskName,
        departmentKeyResult: parsedTaskInput.departmentKeyResult,
      },
      session,
    });

    return {
      text: toolResult.summary || "Done.",
      sessionUpdates: {
        pendingDepartmentObjectiveId: "",
        pendingDepartmentObjectiveName: "",
        awaitingTaskKeyResultInput: false,
        suggestedTaskKeyResults: [],
      },
    };
  }

  if (callbackSelection?.action === "select_dept_for_weightage") {
    if (String(session?.role || "").toUpperCase() !== "MANAGEMENT") {
      return {
        text: "Task weightage management is currently available only for management login.",
        clearSourceReplyMarkup: true,
        sessionUpdates: clearWeightageFlowState,
      };
    }

    const [departmentIndexValue] = callbackSelection.args;
    const departmentIndex = Number(departmentIndexValue);
    const selectedDepartmentOption = Array.isArray(session?.pendingDepartmentOptions)
      ? session.pendingDepartmentOptions[departmentIndex]
      : null;
    const selectedDepartment = selectedDepartmentOption?.id
      ? await getDepartmentById(session.token, selectedDepartmentOption.id)
      : null;

    if (!selectedDepartment) {
      return {
        text: "I could not find that department anymore. Please try again.",
      };
    }

    const selectedDepartmentId =
      selectedDepartment.id ||
      selectedDepartment._id ||
      selectedDepartment.departmentId;
    const selectedDepartmentName = getDepartmentDisplayName(selectedDepartment);
    const departmentObjectivesResponse =
      await getDepartmentObjectivesForDepartment(
        session.token,
        selectedDepartmentId,
        session.role
      );
    const departmentObjectives =
      departmentObjectivesResponse.data.data.departmentObjectives ||
      departmentObjectivesResponse.data.data.departments ||
      departmentObjectivesResponse.data.data ||
      [];

    if (!Array.isArray(departmentObjectives) || !departmentObjectives.length) {
      return {
        text: `No department objectives found for ${selectedDepartmentName}. Create a department objective first, then come back to weightage management.`,
        clearSourceReplyMarkup: true,
        sessionUpdates: {
          ...clearWeightageFlowState,
          pendingWeightageDepartmentId: selectedDepartmentId || "",
          pendingWeightageDepartmentName: selectedDepartmentName,
        },
      };
    }

    return {
      text: `Selected department: ${selectedDepartmentName}\n\nNow choose the department objective whose task weightage you want to manage.`,
      replyMarkup: buildInlineDepartmentObjectiveWeightageKeyboard(
        departmentObjectives
      ),
      clearSourceReplyMarkup: true,
      sessionUpdates: {
        ...clearWeightageFlowState,
        pendingWeightageDepartmentId: selectedDepartmentId || "",
        pendingWeightageDepartmentName: selectedDepartmentName,
      },
    };
  }

  if (callbackSelection?.action === "select_dept_obj_for_weightage") {
    const [departmentObjectiveId] = callbackSelection.args;
    const selectedDepartmentObjective = await findDepartmentObjective(
      session.token,
      {
        departmentObjectiveId,
        departmentId: session?.pendingWeightageDepartmentId || "",
        role: session?.role || "MANAGEMENT",
      }
    );

    if (!selectedDepartmentObjective) {
      return {
        text: "I could not find that department objective anymore. Please try again.",
      };
    }

    const selectedDepartmentObjectiveId =
      selectedDepartmentObjective.id ||
      selectedDepartmentObjective._id ||
      selectedDepartmentObjective.departmentObjectiveId;
    const selectedDepartmentObjectiveName =
      getDepartmentObjectiveDisplayName(selectedDepartmentObjective);
    const keyResultsResponse = await getDepartmentObjectiveKeyResults(
      session.token,
      selectedDepartmentObjectiveId,
      session.role
    );
    const keyResultItems = extractDepartmentObjectiveKeyResultItems(
      keyResultsResponse.data.data
    );

    if (!Array.isArray(keyResultItems) || !keyResultItems.length) {
      return {
        text: `No tasks or key results were found under "${selectedDepartmentObjectiveName}". Create a task and key result first, then come back to weightage management.`,
        clearSourceReplyMarkup: true,
        sessionUpdates: {
          ...clearWeightageFlowState,
          pendingWeightageDepartmentId: session?.pendingWeightageDepartmentId || "",
          pendingWeightageDepartmentName: session?.pendingWeightageDepartmentName || "",
          pendingWeightageDepartmentObjectiveId: selectedDepartmentObjectiveId || "",
          pendingWeightageDepartmentObjectiveName: selectedDepartmentObjectiveName,
        },
      };
    }

    return {
      text: [
        `Selected department: ${session?.pendingWeightageDepartmentName || "Department"}`,
        `Selected department objective: ${selectedDepartmentObjectiveName}`,
        "",
        formatKeyResultWeightageItems(keyResultItems),
        "",
        "Choose how you want to allocate weightage.",
      ].join("\n"),
      replyMarkup: buildInlineWeightageModeKeyboard(),
      clearSourceReplyMarkup: true,
      sessionUpdates: {
        ...clearWeightageFlowState,
        pendingWeightageDepartmentId: session?.pendingWeightageDepartmentId || "",
        pendingWeightageDepartmentName: session?.pendingWeightageDepartmentName || "",
        pendingWeightageDepartmentObjectiveId: selectedDepartmentObjectiveId || "",
        pendingWeightageDepartmentObjectiveName: selectedDepartmentObjectiveName,
        pendingWeightageItems: keyResultItems,
      },
    };
  }

  if (callbackSelection?.action === "weightage_mode_manual") {
    if (!session?.pendingWeightageDepartmentObjectiveId) {
      return {
        text: "Please choose the department objective first.",
      };
    }

    const keyResultItems = Array.isArray(session?.pendingWeightageItems) &&
      session.pendingWeightageItems.length
      ? session.pendingWeightageItems
      : (
          await getDepartmentObjectiveKeyResults(
            session.token,
            session.pendingWeightageDepartmentObjectiveId,
            session.role
          )
        ).data.data || [];
    const normalizedItems = extractDepartmentObjectiveKeyResultItems(keyResultItems);

    return {
      text: [
        formatKeyResultWeightageItems(
          Array.isArray(normalizedItems) ? normalizedItems : []
        ),
        "",
        "Choose the task below to set or update its weightage.",
      ].join("\n"),
      replyMarkup: buildInlineKeyResultWeightageKeyboard(
        Array.isArray(normalizedItems) ? normalizedItems : []
      ),
      clearSourceReplyMarkup: true,
      sessionUpdates: {
        pendingWeightageItems: Array.isArray(normalizedItems)
          ? normalizedItems
          : [],
        pendingWeightageKeyResultId: "",
        pendingWeightageTaskName: "",
        awaitingWeightageInput: false,
        suggestedWeightageAllocations: [],
        weightageFlowMode: "manual",
      },
    };
  }

  if (callbackSelection?.action === "weightage_mode_ai") {
    if (!session?.pendingWeightageDepartmentObjectiveId) {
      return {
        text: "Please choose the department objective first.",
      };
    }

    const keyResultItems = Array.isArray(session?.pendingWeightageItems) &&
      session.pendingWeightageItems.length
      ? session.pendingWeightageItems
      : (
          await getDepartmentObjectiveKeyResults(
            session.token,
            session.pendingWeightageDepartmentObjectiveId,
            session.role
          )
        ).data.data || [];
    const normalizedItems = extractDepartmentObjectiveKeyResultItems(keyResultItems);
    const allocations = normalizeSuggestedWeightageAllocations(
      Array.isArray(normalizedItems) ? normalizedItems : [],
      await generateWeightageSuggestions(
        session.token,
        session.pendingWeightageDepartmentObjectiveName || "Department objective",
        Array.isArray(normalizedItems) ? normalizedItems : []
      )
    );

    if (!allocations.length) {
      return {
        text: [
          "I could not prepare reliable AI weightage suggestions for those tasks right now.",
          "You can switch to manual mode and set the task weightage yourself.",
        ].join("\n"),
        clearSourceReplyMarkup: true,
        replyMarkup: buildInlineWeightageModeKeyboard(),
        sessionUpdates: {
          pendingWeightageItems: Array.isArray(normalizedItems)
            ? normalizedItems
            : [],
          suggestedWeightageAllocations: [],
          awaitingWeightageInput: false,
          weightageFlowMode: "ai",
        },
      };
    }

    return {
      text: [
        `Selected department objective: ${session.pendingWeightageDepartmentObjectiveName || "Department objective"}`,
        "",
        formatSuggestedWeightageAllocations(allocations),
        "",
        "Use the buttons below to apply one suggestion, apply all, or switch to manual mode.",
      ].join("\n"),
      replyMarkup: buildInlineSuggestedWeightageKeyboard(allocations),
      clearSourceReplyMarkup: true,
      sessionUpdates: {
        pendingWeightageItems: Array.isArray(normalizedItems)
          ? normalizedItems
          : [],
        suggestedWeightageAllocations: allocations,
        awaitingWeightageInput: false,
        weightageFlowMode: "ai",
      },
    };
  }

  if (callbackSelection?.action === "select_key_result_for_weightage") {
    const [keyResultId] = callbackSelection.args;
    const selectedItem = Array.isArray(session?.pendingWeightageItems)
      ? session.pendingWeightageItems.find(
          (item) => getKeyResultIdentifier(item) === String(keyResultId)
        )
      : null;

    if (!selectedItem) {
      return {
        text: "I could not find that task anymore. Please choose it again.",
      };
    }

    return {
      text: buildManualWeightagePrompt({
        departmentObjectiveName:
          session?.pendingWeightageDepartmentObjectiveName || "",
        selectedItem,
        items: session?.pendingWeightageItems || [],
      }),
      clearSourceReplyMarkup: true,
      sessionUpdates: {
        pendingWeightageKeyResultId: keyResultId,
        pendingWeightageTaskName: getTaskDisplayName(selectedItem),
        awaitingWeightageInput: true,
        suggestedWeightageAllocations: [],
      },
    };
  }

  if (callbackSelection?.action === "apply_suggested_weightage") {
    const [indexValue] = callbackSelection.args;
    const selectedIndex = Number(indexValue);
    const suggestedAllocations = Array.isArray(session?.suggestedWeightageAllocations)
      ? session.suggestedWeightageAllocations
      : [];
    const selectedAllocation = suggestedAllocations[selectedIndex];

    if (
      !selectedAllocation ||
      !session?.pendingWeightageDepartmentObjectiveId
    ) {
      return {
        text: "I could not find that weightage suggestion anymore. Please generate it again.",
      };
    }

    try {
      await addWeightageToKeyResult(session.token, selectedAllocation.keyResultId, {
        weightage: selectedAllocation.weightage,
        departmentObjectiveId: session.pendingWeightageDepartmentObjectiveId,
      });
    } catch (error) {
      return {
        text: [
          `I could not apply ${selectedAllocation.weightage}% to "${selectedAllocation.taskName}".`,
          error?.response?.data?.message ||
            error?.response?.data?.error ||
            error.message,
        ].join("\n"),
      };
    }

    const refreshedResponse = await getDepartmentObjectiveKeyResults(
      session.token,
      session.pendingWeightageDepartmentObjectiveId,
      session.role
    );
    const refreshedItems = extractDepartmentObjectiveKeyResultItems(
      refreshedResponse.data.data
    );
    const remainingAllocations = suggestedAllocations.filter(
      (_, index) => index !== selectedIndex
    );

    return {
      text: [
        `Applied ${selectedAllocation.weightage}% to task "${selectedAllocation.taskName}".`,
        "",
        formatKeyResultWeightageItems(
          Array.isArray(refreshedItems) ? refreshedItems : []
        ),
        "",
        remainingAllocations.length
          ? "You can still apply the remaining AI suggestions below or switch to manual mode."
          : "All remaining weightage suggestions for this flow have been handled.",
      ].join("\n"),
      clearSourceReplyMarkup: true,
      ...(remainingAllocations.length
        ? {
            replyMarkup: buildInlineSuggestedWeightageKeyboard(
              remainingAllocations
            ),
          }
        : {
            replyMarkup: buildInlineWeightageModeKeyboard(),
          }),
      sessionUpdates: {
        pendingWeightageItems: Array.isArray(refreshedItems)
          ? refreshedItems
          : [],
        suggestedWeightageAllocations: remainingAllocations,
      },
    };
  }

  if (callbackSelection?.action === "apply_all_suggested_weightage") {
    const suggestedAllocations = Array.isArray(session?.suggestedWeightageAllocations)
      ? session.suggestedWeightageAllocations
      : [];
    const existingItems = Array.isArray(session?.pendingWeightageItems)
      ? session.pendingWeightageItems
      : [];

    if (
      !suggestedAllocations.length ||
      !existingItems.length ||
      !session?.pendingWeightageDepartmentObjectiveId
    ) {
      return {
        text: "I could not find the stored AI weightage suggestions. Please generate them again.",
      };
    }

    for (const item of existingItems) {
      await addWeightageToKeyResult(session.token, getKeyResultIdentifier(item), {
        weightage: 0,
        departmentObjectiveId: session.pendingWeightageDepartmentObjectiveId,
      });
    }

    for (const allocation of suggestedAllocations) {
      if (!allocation.weightage) {
        continue;
      }

      await addWeightageToKeyResult(session.token, allocation.keyResultId, {
        weightage: allocation.weightage,
        departmentObjectiveId: session.pendingWeightageDepartmentObjectiveId,
      });
    }

    const refreshedResponse = await getDepartmentObjectiveKeyResults(
      session.token,
      session.pendingWeightageDepartmentObjectiveId,
      session.role
    );
    const refreshedItems = extractDepartmentObjectiveKeyResultItems(
      refreshedResponse.data.data
    );

    return {
      text: [
        `Applied the AI weightage plan for ${session.pendingWeightageDepartmentObjectiveName || "the selected department objective"}.`,
        "",
        formatKeyResultWeightageItems(
          Array.isArray(refreshedItems) ? refreshedItems : []
        ),
        "",
        "If you want to fine-tune anything, switch to manual mode below.",
      ].join("\n"),
      clearSourceReplyMarkup: true,
      replyMarkup: buildInlineWeightageModeKeyboard(),
      sessionUpdates: {
        pendingWeightageItems: Array.isArray(refreshedItems)
          ? refreshedItems
          : [],
        suggestedWeightageAllocations: [],
        awaitingWeightageInput: false,
      },
    };
  }

  if (callbackSelection?.action === "close_weightage_flow") {
    return {
      text: "Closed the task-weightage flow.",
      clearSourceReplyMarkup: true,
      sessionUpdates: clearWeightageFlowState,
    };
  }

  if (session?.awaitingWeightageInput && session?.pendingWeightageKeyResultId) {
    const weightage = extractWeightageInput(message);

    if (weightage === null) {
      const selectedItem = Array.isArray(session?.pendingWeightageItems)
        ? session.pendingWeightageItems.find(
            (item) =>
              getKeyResultIdentifier(item) ===
              String(session.pendingWeightageKeyResultId)
          )
        : null;

      return {
        text: selectedItem
          ? buildManualWeightagePrompt({
              departmentObjectiveName:
                session?.pendingWeightageDepartmentObjectiveName || "",
              selectedItem,
              items: session?.pendingWeightageItems || [],
            })
          : "Please send a valid weightage like 25 or 25%.",
      };
    }

    try {
      await addWeightageToKeyResult(session.token, session.pendingWeightageKeyResultId, {
        weightage,
        departmentObjectiveId: session.pendingWeightageDepartmentObjectiveId,
      });
    } catch (error) {
      const selectedItem = Array.isArray(session?.pendingWeightageItems)
        ? session.pendingWeightageItems.find(
            (item) =>
              getKeyResultIdentifier(item) ===
              String(session.pendingWeightageKeyResultId)
          )
        : null;

      return {
        text: [
          `I could not save that weightage for "${session.pendingWeightageTaskName || "the selected task"}".`,
          error?.response?.data?.message ||
            error?.response?.data?.error ||
            error.message,
          "",
          selectedItem
            ? buildManualWeightagePrompt({
                departmentObjectiveName:
                  session?.pendingWeightageDepartmentObjectiveName || "",
                selectedItem,
                items: session?.pendingWeightageItems || [],
              })
            : "Please send a valid weightage like 25 or 25%.",
        ].join("\n"),
      };
    }

    const refreshedResponse = await getDepartmentObjectiveKeyResults(
      session.token,
      session.pendingWeightageDepartmentObjectiveId,
      session.role
    );
    const refreshedItems = extractDepartmentObjectiveKeyResultItems(
      refreshedResponse.data.data
    );

    return {
      text: [
        `Updated "${session.pendingWeightageTaskName || "the selected task"}" to ${weightage}%.`,
        "",
        formatKeyResultWeightageItems(
          Array.isArray(refreshedItems) ? refreshedItems : []
        ),
        "",
        "Choose another task below if you want to continue adjusting weightage.",
      ].join("\n"),
      replyMarkup: buildInlineKeyResultWeightageKeyboard(
        Array.isArray(refreshedItems) ? refreshedItems : []
      ),
      sessionUpdates: {
        pendingWeightageItems: Array.isArray(refreshedItems)
          ? refreshedItems
          : [],
        pendingWeightageKeyResultId: "",
        pendingWeightageTaskName: "",
        awaitingWeightageInput: false,
        suggestedWeightageAllocations: [],
      },
    };
  }

  if (callbackSelection?.action === "select_dept_obj_for_current_score") {
    if (String(session?.role || "").toUpperCase() !== "DEPARTMENT") {
      return {
        text: "Current score updates are available only for department login.",
        clearSourceReplyMarkup: true,
        sessionUpdates: clearCurrentScoreFlowState,
      };
    }

    const scoreEditStatusResponse = await getScoreEditStatus(session.token);
    const scoreEditDetails =
      scoreEditStatusResponse.data.data.scoreEditDetails ||
      scoreEditStatusResponse.data.data ||
      {};

    if (!scoreEditDetails.allowEdit) {
      return {
        text: [
          "The score window is currently closed, so I cannot update current score right now.",
          "",
          formatScoreEditStatus(scoreEditDetails),
        ].join("\n"),
        clearSourceReplyMarkup: true,
        sessionUpdates: clearCurrentScoreFlowState,
      };
    }

    const [departmentObjectiveId] = callbackSelection.args;
    const selectedDepartmentObjective = await findDepartmentObjective(
      session.token,
      {
        departmentObjectiveId,
        role: session?.role || "DEPARTMENT",
      }
    );

    if (!selectedDepartmentObjective) {
      return {
        text: "I could not find that department objective anymore. Please try again.",
      };
    }

    const selectedDepartmentObjectiveId =
      selectedDepartmentObjective.id ||
      selectedDepartmentObjective._id ||
      selectedDepartmentObjective.departmentObjectiveId;
    const selectedDepartmentObjectiveName =
      getDepartmentObjectiveDisplayName(selectedDepartmentObjective);
    const keyResultsResponse = await getDepartmentObjectiveKeyResults(
      session.token,
      selectedDepartmentObjectiveId,
      session.role
    );
    const keyResultItems = extractDepartmentObjectiveKeyResultItems(
      keyResultsResponse.data.data
    );

    if (!Array.isArray(keyResultItems) || !keyResultItems.length) {
      return {
        text: `No tasks or key results were found under "${selectedDepartmentObjectiveName}".`,
        clearSourceReplyMarkup: true,
        sessionUpdates: {
          ...clearCurrentScoreFlowState,
          pendingCurrentScoreDepartmentObjectiveId:
            selectedDepartmentObjectiveId || "",
          pendingCurrentScoreDepartmentObjectiveName:
            selectedDepartmentObjectiveName,
        },
      };
    }

    return {
      text: [
        `Selected department objective: ${selectedDepartmentObjectiveName}`,
        "",
        formatKeyResultCurrentScoreItems(keyResultItems),
        "",
        "Choose the task below to update its current score.",
      ].join("\n"),
      replyMarkup: buildInlineKeyResultCurrentScoreKeyboard(keyResultItems),
      clearSourceReplyMarkup: true,
      sessionUpdates: {
        ...clearCurrentScoreFlowState,
        pendingCurrentScoreDepartmentObjectiveId:
          selectedDepartmentObjectiveId || "",
        pendingCurrentScoreDepartmentObjectiveName:
          selectedDepartmentObjectiveName,
        pendingCurrentScoreItems: keyResultItems,
      },
    };
  }

  if (callbackSelection?.action === "select_key_result_for_current_score") {
    const [keyResultId] = callbackSelection.args;
    const selectedItem = Array.isArray(session?.pendingCurrentScoreItems)
      ? session.pendingCurrentScoreItems.find(
          (item) => getKeyResultIdentifier(item) === String(keyResultId)
        )
      : null;

    if (!selectedItem) {
      return {
        text: "I could not find that task anymore. Please choose it again.",
      };
    }

    return {
      text: buildCurrentScorePrompt({
        departmentObjectiveName:
          session?.pendingCurrentScoreDepartmentObjectiveName || "",
        selectedItem,
      }),
      clearSourceReplyMarkup: true,
      sessionUpdates: {
        pendingCurrentScoreKeyResultId: keyResultId,
        pendingCurrentScoreTaskName: getTaskDisplayName(selectedItem),
        awaitingCurrentScoreInput: true,
      },
    };
  }

  if (callbackSelection?.action === "close_current_score_flow") {
    return {
      text: "Closed the current-score flow.",
      clearSourceReplyMarkup: true,
      sessionUpdates: clearCurrentScoreFlowState,
    };
  }

  if (session?.awaitingCurrentScoreInput && session?.pendingCurrentScoreKeyResultId) {
    if (String(session?.role || "").toUpperCase() !== "DEPARTMENT") {
      return {
        text: "Current score updates are available only for department login.",
        sessionUpdates: clearCurrentScoreFlowState,
      };
    }

    const scoreEditStatusResponse = await getScoreEditStatus(session.token);
    const scoreEditDetails =
      scoreEditStatusResponse.data.data.scoreEditDetails ||
      scoreEditStatusResponse.data.data ||
      {};

    if (!scoreEditDetails.allowEdit) {
      return {
        text: [
          "The score window is now closed, so I could not save the score.",
          "",
          formatScoreEditStatus(scoreEditDetails),
        ].join("\n"),
        sessionUpdates: clearCurrentScoreFlowState,
      };
    }

    const currentScore = extractCurrentScoreInput(message);

    if (currentScore === null) {
      const selectedItem = Array.isArray(session?.pendingCurrentScoreItems)
        ? session.pendingCurrentScoreItems.find(
            (item) =>
              getKeyResultIdentifier(item) ===
              String(session.pendingCurrentScoreKeyResultId)
          )
        : null;

      return {
        text: selectedItem
          ? buildCurrentScorePrompt({
              departmentObjectiveName:
                session?.pendingCurrentScoreDepartmentObjectiveName || "",
              selectedItem,
            })
          : "Please send a valid current score like 65.",
      };
    }

    try {
      await updateCurrentScoreForKeyResult(
        session.token,
        session.pendingCurrentScoreKeyResultId,
        {
          currentScore,
          departmentObjectiveId:
            session.pendingCurrentScoreDepartmentObjectiveId,
        }
      );
    } catch (error) {
      return {
        text: [
          `I could not update current score for "${session.pendingCurrentScoreTaskName || "the selected task"}".`,
          error?.response?.data?.message ||
            error?.response?.data?.error ||
            error.message,
        ].join("\n"),
      };
    }

    const refreshedResponse = await getDepartmentObjectiveKeyResults(
      session.token,
      session.pendingCurrentScoreDepartmentObjectiveId,
      session.role
    );
    const refreshedItems = extractDepartmentObjectiveKeyResultItems(
      refreshedResponse.data.data
    );

    return {
      text: [
        `Updated current score for "${session.pendingCurrentScoreTaskName || "the selected task"}" to ${currentScore}.`,
        "",
        formatKeyResultCurrentScoreItems(
          Array.isArray(refreshedItems) ? refreshedItems : []
        ),
        "",
        "Choose another task below if you want to continue updating scores.",
      ].join("\n"),
      replyMarkup: buildInlineKeyResultCurrentScoreKeyboard(
        Array.isArray(refreshedItems) ? refreshedItems : []
      ),
      sessionUpdates: {
        pendingCurrentScoreItems: Array.isArray(refreshedItems)
          ? refreshedItems
          : [],
        pendingCurrentScoreKeyResultId: "",
        pendingCurrentScoreTaskName: "",
        awaitingCurrentScoreInput: false,
      },
    };
  }

  const currentObjectivesResponse = await getObjectives(session.token);
  const currentObjectives =
    currentObjectivesResponse.data.data.objectives || [];
  const normalizedMessage = String(message || "").trim().toLowerCase();

  if (isWeightageIntentMessage(message)) {
    if (String(session?.role || "").toUpperCase() !== "MANAGEMENT") {
      return {
        text: "Task weightage management is currently available only for management login.",
      };
    }

    const departmentsResponse = await getDepartments(session.token);
    const departments =
      departmentsResponse.data.data.departments ||
      departmentsResponse.data.data.departmentUsers ||
      [];

    if (!Array.isArray(departments) || !departments.length) {
      return {
        text: "I could not find any active departments to manage weightage for.",
      };
    }

    return {
      text: "Let's manage task weightage. First select the department.",
      replyMarkup: buildInlineDepartmentSelectionKeyboard(
        departments,
        "select_dept_for_weightage"
      ),
      sessionUpdates: {
        ...clearWeightageFlowState,
        pendingDepartmentOptions: buildDepartmentSessionOptions(departments),
      },
    };
  }

  if (isCurrentScoreIntentMessage(message)) {
    if (String(session?.role || "").toUpperCase() !== "DEPARTMENT") {
      return {
        text: "Current score updates are available only for department login.",
      };
    }

    const scoreEditStatusResponse = await getScoreEditStatus(session.token);
    const scoreEditDetails =
      scoreEditStatusResponse.data.data.scoreEditDetails ||
      scoreEditStatusResponse.data.data ||
      {};

    if (!scoreEditDetails.allowEdit) {
      return {
        text: [
          "The score window is currently closed, so I cannot update current score right now.",
          "",
          formatScoreEditStatus(scoreEditDetails),
        ].join("\n"),
      };
    }

    const departmentObjectivesResponse = await getDepartmentObjectives(
      session.token,
      ""
    );
    const departmentObjectives =
      departmentObjectivesResponse.data.data.departmentObjectives ||
      departmentObjectivesResponse.data.data.departments ||
      departmentObjectivesResponse.data.data ||
      [];

    if (!Array.isArray(departmentObjectives) || !departmentObjectives.length) {
      return {
        text: "I could not find any department objectives for your department yet.",
      };
    }

    return {
      text: "The score window is open. Select the department objective first to update current score.",
      replyMarkup: buildInlineDepartmentObjectiveCurrentScoreKeyboard(
        departmentObjectives
      ),
      sessionUpdates: clearCurrentScoreFlowState,
    };
  }

  if (
    normalizedMessage.includes("schedule") &&
    (normalizedMessage.includes("set") ||
      normalizedMessage.includes("setup") ||
      normalizedMessage.includes("set up") ||
      normalizedMessage.includes("update") ||
      normalizedMessage.includes("meeting time"))
  ) {
    const scheduleResponse = await getScheduleDetails(session.token);
    const scheduleDetails =
      scheduleResponse.data.data.scheuleDetails || scheduleResponse.data.data || {};
    const hasExistingSchedule = Boolean(Object.keys(scheduleDetails).length);

    return {
      text: hasExistingSchedule
        ? "You already have a score-management schedule. Use the buttons below to view or update it."
        : "No score-management schedule is set yet. Use the buttons below to set it up.",
      replyMarkup: buildInlineScheduleActionKeyboard(hasExistingSchedule),
      sessionUpdates: {
        awaitingScheduleSetupConfirmation: !hasExistingSchedule,
      },
    };
  }

  const departmentObjectiveSelection = extractDepartmentObjectiveSelection(
    message,
    currentObjectives
  );

  if (departmentObjectiveSelection) {
    const objective = departmentObjectiveSelection;

    if (!objective) {
      return {
        text: "I could not find that organization objective. Please try again.",
      };
    }

    const objectiveName = objective.objectiveName || objective.objective || "";
    const text = await generateDepartmentAlignment(
      session.token,
      `Suggest department-wise objectives for ${objectiveName}`,
      objectiveName
    );

    return {
      text,
      replyMarkup: buildObjectiveListKeyboard([objective]),
    };
  }

  const keyResultObjectiveSelection = extractKeyResultObjectiveSelection(
    message,
    currentObjectives
  );

  if (keyResultObjectiveSelection) {
    const objective = keyResultObjectiveSelection;

    if (!objective) {
      return {
        text: "I could not find that organization objective. Please try again.",
      };
    }

    return {
      text: `Tell me the key result you want to add for objective: ${objective.objectiveName}`,
    };
  }

  const requestsTaskAndKeyResult =
    normalizedMessage.includes("task") &&
    (normalizedMessage.includes("key result") || normalizedMessage.includes("kr"));

  if (
    requestsTaskAndKeyResult &&
    !String(normalizedMessage).includes("department objective:")
  ) {
    const departmentsResponse = await getDepartments(session.token);
    const departments =
      departmentsResponse.data.data.departments ||
      departmentsResponse.data.data.departmentUsers ||
      [];

    if (Array.isArray(departments) && departments.length) {
      const departmentOptions = buildDepartmentSessionOptions(departments);

      return {
        text: "Select the department first for task and key-result creation.",
        replyMarkup: buildInlineDepartmentSelectionKeyboard(
          departments,
          "select_dept_for_task_kr"
        ),
        sessionUpdates: {
          pendingDepartmentOptions: departmentOptions,
          selectedDepartmentId: "",
          selectedDepartmentName: "",
          pendingDepartmentObjectiveId: "",
          pendingDepartmentObjectiveName: "",
          suggestedTaskKeyResults: [],
          awaitingTaskKeyResultInput: false,
        },
      };
    }
  }

  const createObjectiveSelection = extractCreateObjectiveSelection(
    message,
    session?.suggestedOrganizationObjectives || currentObjectives
  );

  if (createObjectiveSelection) {
    const toolResult = await executeAction({
      plan: {
        action: "create_bulk_objectives",
        organizationObjectives: [
          {
            objectiveName: createObjectiveSelection.objectiveName,
            description: createObjectiveSelection.description || "",
          },
        ],
      },
      session,
    });

    return {
      text: toolResult.summary || "Done.",
      suggestedOrganizationObjectives: session?.suggestedOrganizationObjectives || [],
      replyMarkup: buildSuggestedObjectiveKeyboard(
        session?.suggestedOrganizationObjectives || []
      ),
    };
  }

  const suggestedObjectiveSelection = extractSuggestedObjectiveSelection({
    message,
    suggestedObjectives: session?.suggestedOrganizationObjectives || [],
    allowAffirmativeSelection: Boolean(
      session?.awaitingSuggestedObjectiveSelection
    ),
  });

  if (suggestedObjectiveSelection) {
    const toolResult = await executeAction({
      plan: {
        action: "create_bulk_objectives",
        organizationObjectives: suggestedObjectiveSelection.selectedObjectives,
      },
      session,
    });

    return {
      text: toolResult.summary || "Done.",
      suggestedOrganizationObjectives: session.suggestedOrganizationObjectives,
      replyMarkup: buildSuggestedObjectiveKeyboard(
        session?.suggestedOrganizationObjectives || []
      ),
    };
  }

  const plannerResponse = await chatWithModel({
    messages: buildPlannerMessages({ message, session, history }),
    format: "json",
  });

  const plan = normalizePlan(parseJson(plannerResponse.message?.content || "{}"));

  if (plan.action === "send_help") {
    return { text: HELP_TEXT };
  }

  if (plan.action === "ask_clarification") {
    if (isDepartmentObjectiveIntentMessage(message) && currentObjectives.length) {
      return {
        text: "Select the organization objective below for department-wise planning or department objective creation.",
        replyMarkup: buildInlineObjectiveSelectionKeyboard(
          currentObjectives,
          "select_org_for_dept"
        ),
      };
    }

    return {
      text:
        plan.reply ||
        "Please tell me the objective title and, if you want, a short description.",
    };
  }

  if (plan.action === "general_reply") {
    if (isDepartmentObjectiveIntentMessage(message) && currentObjectives.length) {
      return {
        text: "Select the organization objective below for department-wise planning or department objective creation.",
        replyMarkup: buildInlineObjectiveSelectionKeyboard(
          currentObjectives,
          "select_org_for_dept"
        ),
      };
    }

    return {
      text:
        plan.reply ||
        "I can help with objectives, profile details, and department progress.",
    };
  }

  if (plan.action === "strategy_advice" || plan.action === "department_alignment") {
    if (plan.action === "strategy_advice") {
      const strategyAdvice = await generateStrategyAdvice(session.token, message);

      return {
        text: strategyAdvice.text,
        suggestedOrganizationObjectives: strategyAdvice.organizationObjectives,
        replyMarkup: buildSuggestedObjectiveKeyboard(
          strategyAdvice.organizationObjectives
        ),
      };
    }

    const text = await generateDepartmentAlignment(
          session.token,
          message,
          plan.organizationObjective || plan.reply
        );

    return {
      text,
      suggestedOrganizationObjectives: [],
    };
  }

  const toolResult = await executeAction({ plan, session });

  if (toolResult.action === "get_schedule_details" && !toolResult.hasSchedule) {
    return {
      text: toolResult.summary,
      replyMarkup: buildInlineScheduleActionKeyboard(false),
      sessionUpdates: {
        awaitingScheduleSetupConfirmation: true,
        promptedForScheduleSetup: true,
      },
    };
  }

  if (toolResult.action === "get_schedule_details" && toolResult.hasSchedule) {
    return {
      text: toolResult.summary,
      replyMarkup: buildInlineScheduleActionKeyboard(true),
      sessionUpdates: {
        awaitingScheduleSetupConfirmation: false,
        promptedForScheduleSetup: false,
      },
    };
  }

  const finalResponse = await chatWithModel({
    messages: buildFinalMessages({ message, plan, toolResult }),
  });

  const replyMarkup = toolResult.action === "get_objectives"
    ? buildInlineObjectiveSelectionKeyboard(
        toolResult.objectives || [],
        "select_org_for_dept"
      )
    : undefined;

  return {
    text:
      finalResponse.message?.content?.trim() ||
      toolResult.summary ||
      "Done.",
    ...(replyMarkup ? { replyMarkup } : {}),
  };
};

module.exports = {
  runAgent,
  HELP_TEXT,
  generateStrategyAdvice,
  generateDepartmentAlignment,
};
