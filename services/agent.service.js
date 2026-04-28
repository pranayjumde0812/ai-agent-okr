const { chatWithModel } = require("./ollama.service");
const {
  createObjective,
  getObjectives,
  createKeyResult,
  updateObjectiveProgress,
} = require("./objective.service");
const { getCurrentOrganizationProfile } = require("./auth.service");
const {
  getDepartments,
  createDepartmentObjective,
  getDepartmentObjectives,
  createDepartmentTaskKeyResult,
} = require("./department.service");
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
- If the user asks about departments, team progress, or department list, use the get_departments tool.
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

const HELP_TEXT = [
  "I can help you with your OKR workspace.",
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
  '- "Create a key result for my revenue objective"',
  '- "Update my onboarding objective progress to 60%"',
  '- "Show my objectives"',
  '- "Get my company profile"',
  '- "List departments and progress"',
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

const buildInlineDepartmentSelectionKeyboard = (departments = []) => ({
  inline_keyboard: departments.map((department, index) => [
    {
      text: shortenButtonLabel(getDepartmentDisplayName(department), 40),
      callback_data: buildCallbackData("select_dept_for_org", String(index)),
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
        "Pick one action from: create_objective, create_department_objective, create_bulk_objectives, get_department_objectives, create_department_task_key_result, create_key_result, update_objective_progress, get_objectives, get_profile, get_departments, strategy_advice, department_alignment, send_help, ask_clarification, general_reply.",
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
        'Use strategy_advice for broad OKR/business-growth guidance.',
        'Use department_alignment when the user wants department objectives or department-wise breakdown from a company/organization objective.',
      ].join("\n"),
    },
    {
      role: "user",
      content: [
        `Authenticated: ${session?.token ? "yes" : "no"}`,
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
    keyResultName: plan.keyResultName || "",
    targetValue: plan.targetValue || "",
    startValue: plan.startValue || "",
    currentValue: plan.currentValue || "",
    progressValue: plan.progressValue || "",
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

const runAgent = async ({ message, session, history }) => {
  const callbackSelection = parseCallbackData(message);

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

  const currentObjectivesResponse = await getObjectives(session.token);
  const currentObjectives =
    currentObjectivesResponse.data.data.objectives || [];

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
