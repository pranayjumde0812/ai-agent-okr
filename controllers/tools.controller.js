const {
  sendOtp,
  verifyOtp,
  getCurrentOrganizationProfile,
  signOut,
} = require("../services/auth.service");
const {
  createObjective,
  getObjectives,
  createKeyResult,
  updateObjectiveProgress,
} = require("../services/objective.service");
const {
  getDepartments,
  createDepartmentObjective,
  getDepartmentObjectives,
  createDepartmentTaskKeyResult,
} = require("../services/department.service");
const {
  generateStrategyAdvice,
  generateDepartmentAlignment,
} = require("../services/agent.service");
const sessionStore = require("../utils/session.store");
const { isAuthExpiredError } = require("../utils/auth-error");

const getTokenFromRequest = (req) => {
  const authHeader = req.headers.authorization || "";

  if (authHeader.startsWith("Bearer ")) {
    return authHeader.slice(7).trim();
  }

  const userId =
    req.body.userId ||
    req.body.telegramUserId ||
    req.query.userId ||
    req.query.telegramUserId;

  if (!userId) {
    return "";
  }

  return sessionStore.getSession(String(userId))?.token || "";
};

const getSessionUserId = (req) => {
  return String(req.body.userId || req.body.telegramUserId || req.query.userId || req.query.telegramUserId || "");
};

const requireToken = (req, res) => {
  const token = getTokenFromRequest(req);

  if (!token) {
    res.status(401).json({
      error:
        "Missing token. Provide Authorization: Bearer <token> or a userId/telegramUserId with a stored session.",
    });
    return null;
  }

  return token;
};

const safeError = (res, error, fallbackMessage, userId = "") => {
  if (userId && isAuthExpiredError(error)) {
    sessionStore.clearAuthSession(userId);
  }

  res.status(error?.response?.status || 500).json({
    error: isAuthExpiredError(error)
      ? "Stored login session expired. Log in again to continue."
      : fallbackMessage,
    details: error?.response?.data || error.message,
  });
};

const sendOtpTool = async (req, res) => {
  const { email } = req.body;
  const userId = getSessionUserId(req);

  if (!email) {
    return res.status(400).json({ error: "email is required" });
  }

  try {
    await sendOtp(email);

    if (userId) {
      sessionStore.setSession(userId, { email });
    }

    return res.json({
      ok: true,
      message: "OTP sent to your email",
      sessionStored: Boolean(userId),
    });
  } catch (error) {
    return safeError(res, error, "Failed to send OTP");
  }
};

const verifyOtpTool = async (req, res) => {
  const { email, otp } = req.body;
  const userId = getSessionUserId(req);
  const session = userId ? sessionStore.getSession(userId) : undefined;
  const resolvedEmail = email || session?.email;

  if (!resolvedEmail || otp === undefined) {
    return res.status(400).json({
      error: "otp is required and email must be provided directly or via stored session",
    });
  }

  try {
    const response = await verifyOtp(resolvedEmail, Number(otp));
    const data = response.data.data;
    const token = data.tokens.access.token;

    if (userId) {
      sessionStore.setSession(userId, {
        email: resolvedEmail,
        token,
        organizationId: data.organization?.id,
        role: "MANAGEMENT",
      });
    }

    return res.json({
      ok: true,
      message: "Login successful",
      token,
      organization: data.organization,
      sessionStored: Boolean(userId),
    });
  } catch (error) {
    return safeError(res, error, "Invalid OTP");
  }
};

const getProfileTool = async (req, res) => {
  const token = requireToken(req, res);
  if (!token) return;

  try {
    const response = await getCurrentOrganizationProfile(token);
    return res.json({ ok: true, data: response.data.data });
  } catch (error) {
    return safeError(res, error, "Failed to fetch profile", getSessionUserId(req));
  }
};

const getObjectivesTool = async (req, res) => {
  const token = requireToken(req, res);
  if (!token) return;

  try {
    const response = await getObjectives(token);
    return res.json({ ok: true, data: response.data.data });
  } catch (error) {
    return safeError(res, error, "Failed to fetch objectives", getSessionUserId(req));
  }
};

const createObjectiveTool = async (req, res) => {
  const token = requireToken(req, res);
  if (!token) return;

  const { objectiveName, description } = req.body;

  if (!objectiveName) {
    return res.status(400).json({ error: "objectiveName is required" });
  }

  try {
    const response = await createObjective(token, objectiveName, description);
    return res.json({
      ok: true,
      message: `Objective "${objectiveName}" created successfully`,
      data: response.data,
    });
  } catch (error) {
    return safeError(res, error, "Failed to create objective", getSessionUserId(req));
  }
};

const createKeyResultTool = async (req, res) => {
  const token = requireToken(req, res);
  if (!token) return;

  const payload = req.body;

  if (!payload.objectiveId || !payload.keyResultName) {
    return res.status(400).json({
      error: "objectiveId and keyResultName are required",
    });
  }

  try {
    const response = await createKeyResult(token, payload);
    return res.json({
      ok: true,
      message: `Key result "${payload.keyResultName}" created successfully`,
      data: response.data,
    });
  } catch (error) {
    return safeError(res, error, "Failed to create key result", getSessionUserId(req));
  }
};

const updateObjectiveProgressTool = async (req, res) => {
  const token = requireToken(req, res);
  if (!token) return;

  const { objectiveId, progress } = req.body;

  if (!objectiveId || progress === undefined) {
    return res.status(400).json({
      error: "objectiveId and progress are required",
    });
  }

  try {
    const response = await updateObjectiveProgress(token, {
      objectiveId,
      progress,
    });

    return res.json({
      ok: true,
      message: `Objective progress updated to ${progress}%`,
      data: response.data,
    });
  } catch (error) {
    return safeError(res, error, "Failed to update objective progress", getSessionUserId(req));
  }
};

const getDepartmentsTool = async (req, res) => {
  const token = requireToken(req, res);
  if (!token) return;

  try {
    const response = await getDepartments(token);
    return res.json({ ok: true, data: response.data.data });
  } catch (error) {
    return safeError(res, error, "Failed to fetch departments", getSessionUserId(req));
  }
};

const createDepartmentObjectiveTool = async (req, res) => {
  const token = requireToken(req, res);
  if (!token) return;

  const { organizationObjectiveId, departmentId, departmentObjective, description } = req.body;

  if (!organizationObjectiveId || !departmentObjective) {
    return res.status(400).json({
      error: "organizationObjectiveId and departmentObjective are required",
    });
  }

  try {
    const response = await createDepartmentObjective(token, {
      organizationObjectiveId,
      departmentId,
      departmentObjective,
      description,
    });
    return res.json({
      ok: true,
      message: `Department objective "${departmentObjective}" created successfully`,
      data: response.data,
    });
  } catch (error) {
    return safeError(res, error, "Failed to create department objective", getSessionUserId(req));
  }
};

const getDepartmentObjectivesTool = async (req, res) => {
  const token = requireToken(req, res);
  if (!token) return;

  const departmentId = req.query.departmentId || "";

  try {
    const response = await getDepartmentObjectives(token, departmentId);
    return res.json({ ok: true, data: response.data.data });
  } catch (error) {
    return safeError(res, error, "Failed to fetch department objectives", getSessionUserId(req));
  }
};

const createDepartmentTaskKeyResultTool = async (req, res) => {
  const token = requireToken(req, res);
  if (!token) return;

  const { departmentObjectiveId, task, keyResult } = req.body;

  if (!departmentObjectiveId || !task || !keyResult) {
    return res.status(400).json({
      error: "departmentObjectiveId, task, and keyResult are required",
    });
  }

  try {
    const response = await createDepartmentTaskKeyResult(token, {
      departmentObjectiveId,
      task,
      keyResult,
    });
    return res.json({
      ok: true,
      message: `Task "${task}" with key result "${keyResult}" created successfully`,
      data: response.data,
    });
  } catch (error) {
    return safeError(res, error, "Failed to create department task and key result", getSessionUserId(req));
  }
};

const strategyAdviceTool = async (req, res) => {
  const token = requireToken(req, res);
  if (!token) return;

  const { prompt } = req.body;

  if (!prompt) {
    return res.status(400).json({ error: "prompt is required" });
  }

  try {
    const text = await generateStrategyAdvice(token, prompt);
    return res.json({ ok: true, text });
  } catch (error) {
    return safeError(res, error, "Failed to generate strategy advice", getSessionUserId(req));
  }
};

const departmentAlignmentTool = async (req, res) => {
  const token = requireToken(req, res);
  if (!token) return;

  const { prompt, organizationObjective } = req.body;

  if (!prompt && !organizationObjective) {
    return res.status(400).json({
      error: "prompt or organizationObjective is required",
    });
  }

  try {
    const text = await generateDepartmentAlignment(
      token,
      prompt || organizationObjective,
      organizationObjective || ""
    );
    return res.json({ ok: true, text });
  } catch (error) {
    return safeError(res, error, "Failed to generate department alignment", getSessionUserId(req));
  }
};

const logoutTool = async (req, res) => {
  const userId = getSessionUserId(req);
  const token = getTokenFromRequest(req);

  if (!userId && !token) {
    return res.status(400).json({
      error:
        "Provide Authorization: Bearer <token> or a userId/telegramUserId with a stored session.",
    });
  }

  try {
    if (token) {
      await signOut(token);
    }
  } catch (error) {
    if (!isAuthExpiredError(error)) {
      return safeError(res, error, "Failed to sign out", userId);
    }
  }

  if (userId) {
    sessionStore.clearSession(userId);
  }

  return res.json({
    ok: true,
    message: "Logged out successfully",
    backendSignOutCalled: Boolean(token),
    sessionCleared: Boolean(userId),
  });
};

const capabilitiesTool = async (req, res) => {
  return res.json({
    ok: true,
    mode: "tool-server",
    tools: [
      { name: "send_otp", method: "POST", path: "/tools/auth/send-otp" },
      { name: "verify_otp", method: "POST", path: "/tools/auth/verify-otp" },
      { name: "logout", method: "POST", path: "/tools/auth/logout" },
      { name: "get_profile", method: "GET", path: "/tools/profile" },
      { name: "get_objectives", method: "GET", path: "/tools/objectives" },
      { name: "create_objective", method: "POST", path: "/tools/objectives" },
      { name: "create_key_result", method: "POST", path: "/tools/key-results" },
      {
        name: "update_objective_progress",
        method: "PATCH",
        path: "/tools/objectives/progress",
      },
      { name: "get_departments", method: "GET", path: "/tools/departments" },
      {
        name: "create_department_objective",
        method: "POST",
        path: "/tools/department-objectives",
      },
      {
        name: "get_department_objectives",
        method: "GET",
        path: "/tools/department-objectives",
      },
      {
        name: "create_department_task_key_result",
        method: "POST",
        path: "/tools/department-objectives/task-key-result",
      },
      { name: "strategy_advice", method: "POST", path: "/tools/strategy/advice" },
      {
        name: "department_alignment",
        method: "POST",
        path: "/tools/strategy/department-alignment",
      },
    ],
  });
};

module.exports = {
  sendOtpTool,
  verifyOtpTool,
  getProfileTool,
  getObjectivesTool,
  createObjectiveTool,
  createKeyResultTool,
  updateObjectiveProgressTool,
  getDepartmentsTool,
  createDepartmentObjectiveTool,
  getDepartmentObjectivesTool,
  createDepartmentTaskKeyResultTool,
  strategyAdviceTool,
  departmentAlignmentTool,
  logoutTool,
  capabilitiesTool,
};
