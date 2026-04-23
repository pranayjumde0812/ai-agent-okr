const { chatWithModel } = require("./ollama.service");
const { createObjective, getObjectives } = require("./objective.service");
const { getCurrentOrganizationProfile } = require("./auth.service");
const { getDepartments } = require("./department.service");
const config = require("../config/env");

const MAX_HISTORY_ITEMS = 8;

const AGENT_INSTRUCTIONS = `
You are OKR AI Agent for a Telegram bot connected to an OKR backend.

Your job is to help the user naturally, not force exact commands.
You can decide which tool to use based on user intent.

Rules:
- Be concise, clear, and action-oriented.
- If the user asks to create an objective, use the create_objective tool.
- If the user asks to list, show, or fetch objectives, use the get_objectives tool.
- If the user asks about profile, organization details, company information, mission, or vision, use the get_profile tool.
- If the user asks about departments, team progress, or department list, use the get_departments tool.
- If the user asks for business growth suggestions, OKR advice, strategic objectives, key results, or how to manage objectives, use strategy_advice.
- If the user asks how department objectives should support an organization objective, use department_alignment.
- If the user asks what you can do, use the send_help tool.
- If the user request is missing key information for creating an objective, ask a follow-up question instead of guessing.
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

const HELP_TEXT = [
  "I can help you with your OKR workspace.",
  "",
  "Examples:",
  '- "Create an objective for improving sales this quarter"',
  '- "Show my objectives"',
  '- "Get my company profile"',
  '- "List departments and progress"',
  '- "Suggest company objectives to grow my business"',
  '- "Break this organization objective into department objectives"',
].join("\n");

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
        "Pick one action from: create_objective, get_objectives, get_profile, get_departments, strategy_advice, department_alignment, send_help, ask_clarification, general_reply.",
        "Schema:",
        '{',
        '  "action": "string",',
        '  "objectiveName": "string",',
        '  "description": "string",',
        '  "organizationObjective": "string",',
        '  "reply": "string"',
        '}',
        'Use empty strings when a field is not needed.',
        'If the user is asking for help or greeting, use send_help or general_reply.',
        'If objective creation is requested but the title is unclear, use ask_clarification.',
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

const executeAction = async ({ plan, session }) => {
  switch (plan.action) {
    case "create_objective": {
      await createObjective(
        session.token,
        plan.objectiveName,
        plan.description || ""
      );

      return {
        success: true,
        action: "create_objective",
        summary: `Objective "${plan.objectiveName}" created successfully.`,
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
    objectiveName: plan.objectiveName || "",
    description: plan.description || "",
    organizationObjective: plan.organizationObjective || "",
    reply: plan.reply || "",
  };
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
        "Prefer 1-3 organization objectives and 3-5 measurable key results per objective.",
        "Key results must be outcome-focused, not task-focused.",
        "If department alignment is requested, map likely department contributions from the organization objective.",
        "Avoid markdown symbols like ** because Telegram plain text may show them literally.",
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

const runAgent = async ({ message, session, history }) => {
  const plannerResponse = await chatWithModel({
    messages: buildPlannerMessages({ message, session, history }),
    format: "json",
  });

  const plan = normalizePlan(parseJson(plannerResponse.message?.content || "{}"));

  if (plan.action === "send_help") {
    return { text: HELP_TEXT };
  }

  if (plan.action === "ask_clarification") {
    return {
      text:
        plan.reply ||
        "Please tell me the objective title and, if you want, a short description.",
    };
  }

  if (plan.action === "general_reply") {
    return {
      text:
        plan.reply ||
        "I can help with objectives, profile details, and department progress.",
    };
  }

  if (plan.action === "strategy_advice" || plan.action === "department_alignment") {
    const profileResponse = await getCurrentOrganizationProfile(session.token);
    const departmentResponse = await getDepartments(session.token);
    const departments =
      departmentResponse.data.data.departments ||
      departmentResponse.data.data.departmentUsers ||
      [];

    const strategyResponse = await chatWithModel({
      messages: buildStrategyMessages({
        message,
        profile: profileResponse.data.data,
        departments,
        mode: plan.action,
        organizationObjective: plan.organizationObjective || plan.reply,
      }),
    });

    return {
      text:
        strategyResponse.message?.content?.trim() ||
        "I can help design organization and department OKRs from your business goals.",
    };
  }

  const toolResult = await executeAction({ plan, session });
  const finalResponse = await chatWithModel({
    messages: buildFinalMessages({ message, plan, toolResult }),
  });

  return {
    text:
      finalResponse.message?.content?.trim() ||
      toolResult.summary ||
      "Done.",
  };
};

module.exports = {
  runAgent,
  HELP_TEXT,
};
