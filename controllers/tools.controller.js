const {
  sendOtp,
  verifyOtp,
  getCurrentOrganizationProfile,
  getProfileDetails,
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
  getCurrentDepartment,
  getCurrentDepartmentObjectives,
  getDepartmentObjectiveKeyResults,
} = require("../services/department.service");
const {
  getYearFilters,
  getObjectiveGrowth,
  getDepartmentGrowth,
  getYearlyGrowth,
} = require("../services/stats.service");
const {
  getScheduleDetails,
  updateScheduleDetails,
  getScoreEditStatus,
} = require("../services/setting.service");
const {
  generateStrategyAdvice,
  generateDepartmentAlignment,
} = require("../services/agent.service");
const sessionStore = require("../utils/session.store");
const { isAuthExpiredError } = require("../utils/auth-error");

const getTokenFromRequest = (req) => {
  const authHeader = req.headers.authorization || "";
  const body = req.body || {};
  const query = req.query || {};

  if (authHeader.startsWith("Bearer ")) {
    return authHeader.slice(7).trim();
  }

  const userId =
    body.userId ||
    body.telegramUserId ||
    query.userId ||
    query.telegramUserId;

  if (!userId) {
    return "";
  }

  return sessionStore.getSession(String(userId))?.token || "";
};

const getSessionUserId = (req) => {
  const body = req.body || {};
  const query = req.query || {};

  return String(body.userId || body.telegramUserId || query.userId || query.telegramUserId || "");
};

const getSessionRole = (req) => {
  const userId = getSessionUserId(req);
  const body = req.body || {};
  const query = req.query || {};

  return body.role || query.role || sessionStore.getSession(userId)?.role || "MANAGEMENT";
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
  const { email, loginAs = "auto" } = req.body;
  const userId = getSessionUserId(req);

  if (!email) {
    return res.status(400).json({ error: "email is required" });
  }

  try {
    const authResult = await sendOtp(email, loginAs);

    if (userId) {
      sessionStore.setSession(userId, {
        email,
        loginMode: authResult.loginMode,
      });
    }

    return res.json({
      ok: true,
      message: "OTP sent to your email",
      loginMode: authResult.loginMode,
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
  const resolvedLoginMode = req.body.loginAs || session?.loginMode || "organization";

  if (!resolvedEmail || otp === undefined) {
    return res.status(400).json({
      error: "otp is required and email must be provided directly or via stored session",
    });
  }

  try {
    const authResult = await verifyOtp(
      resolvedEmail,
      Number(otp),
      resolvedLoginMode
    );
    const data = authResult.response.data.data;
    const token = data.tokens.access.token;
    const role = authResult.loginMode === "department" ? "DEPARTMENT" : "MANAGEMENT";

    if (userId) {
      sessionStore.setSession(userId, {
        email: resolvedEmail,
        token,
        organizationId: data.organization?.id,
        role,
        loginMode: authResult.loginMode,
      });
    }

    return res.json({
      ok: true,
      message: "Login successful",
      token,
      loginMode: authResult.loginMode,
      role,
      organization: data.organization || null,
      department: data.department || null,
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

const getProfileDetailsTool = async (req, res) => {
  const token = requireToken(req, res);
  if (!token) return;

  try {
    const response = await getProfileDetails(token, getSessionRole(req));
    return res.json({ ok: true, data: response.data.data });
  } catch (error) {
    return safeError(res, error, "Failed to fetch profile details", getSessionUserId(req));
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

const getCurrentDepartmentTool = async (req, res) => {
  const token = requireToken(req, res);
  if (!token) return;

  try {
    const response = await getCurrentDepartment(token);
    return res.json({ ok: true, data: response.data.data });
  } catch (error) {
    return safeError(res, error, "Failed to fetch current department", getSessionUserId(req));
  }
};

const getCurrentDepartmentObjectivesTool = async (req, res) => {
  const token = requireToken(req, res);
  if (!token) return;

  try {
    const response = await getCurrentDepartmentObjectives(token);
    return res.json({ ok: true, data: response.data.data });
  } catch (error) {
    return safeError(res, error, "Failed to fetch current department objectives", getSessionUserId(req));
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

const getDepartmentObjectiveKeyResultsTool = async (req, res) => {
  const token = requireToken(req, res);
  if (!token) return;

  const { id } = req.params;

  if (!id) {
    return res.status(400).json({ error: "department objective id is required" });
  }

  try {
    const response = await getDepartmentObjectiveKeyResults(
      token,
      id,
      getSessionRole(req)
    );
    return res.json({ ok: true, data: response.data.data });
  } catch (error) {
    return safeError(res, error, "Failed to fetch department objective key results", getSessionUserId(req));
  }
};

const getDashboardYearFiltersTool = async (req, res) => {
  const token = requireToken(req, res);
  if (!token) return;

  try {
    const response = await getYearFilters(token, getSessionRole(req));
    return res.json({ ok: true, data: response.data.data });
  } catch (error) {
    return safeError(res, error, "Failed to fetch dashboard year filters", getSessionUserId(req));
  }
};

const getDashboardObjectiveGrowthTool = async (req, res) => {
  const token = requireToken(req, res);
  if (!token) return;

  const { year, quarter } = req.query;

  if (!year || !quarter) {
    return res.status(400).json({ error: "year and quarter are required" });
  }

  try {
    const response = await getObjectiveGrowth(token, {
      year,
      quarter,
      role: getSessionRole(req),
    });
    return res.json({ ok: true, data: response.data.data });
  } catch (error) {
    return safeError(res, error, "Failed to fetch objective growth", getSessionUserId(req));
  }
};

const getDashboardDepartmentGrowthTool = async (req, res) => {
  const token = requireToken(req, res);
  if (!token) return;

  const { year, quarter } = req.query;

  if (!year || !quarter) {
    return res.status(400).json({ error: "year and quarter are required" });
  }

  try {
    const response = await getDepartmentGrowth(token, { year, quarter });
    return res.json({ ok: true, data: response.data.data });
  } catch (error) {
    return safeError(res, error, "Failed to fetch department growth", getSessionUserId(req));
  }
};

const getDashboardYearlyGrowthTool = async (req, res) => {
  const token = requireToken(req, res);
  if (!token) return;

  const { year } = req.query;

  if (!year) {
    return res.status(400).json({ error: "year is required" });
  }

  try {
    const response = await getYearlyGrowth(token, {
      year,
      role: getSessionRole(req),
    });
    return res.json({ ok: true, data: response.data.data });
  } catch (error) {
    return safeError(res, error, "Failed to fetch yearly growth", getSessionUserId(req));
  }
};

const getScheduleDetailsTool = async (req, res) => {
  const token = requireToken(req, res);
  if (!token) return;

  try {
    const response = await getScheduleDetails(token);
    return res.json({ ok: true, data: response.data.data });
  } catch (error) {
    return safeError(res, error, "Failed to fetch schedule details", getSessionUserId(req));
  }
};

const updateScheduleDetailsTool = async (req, res) => {
  const token = requireToken(req, res);
  if (!token) return;

  const {
    dayName,
    meetingTime,
    timezone,
    timeSlotHoursBeforeMeeting,
  } = req.body;

  if (!dayName || !meetingTime || !timezone || timeSlotHoursBeforeMeeting === undefined) {
    return res.status(400).json({
      error: "dayName, meetingTime, timezone, and timeSlotHoursBeforeMeeting are required",
    });
  }

  try {
    const response = await updateScheduleDetails(token, {
      dayName,
      meetingTime,
      timezone,
      timeSlotHoursBeforeMeeting,
    });
    return res.json({ ok: true, data: response.data.data, message: "Schedule updated successfully" });
  } catch (error) {
    return safeError(res, error, "Failed to update schedule details", getSessionUserId(req));
  }
};

const getScoreEditStatusTool = async (req, res) => {
  const token = requireToken(req, res);
  if (!token) return;

  try {
    const response = await getScoreEditStatus(token);
    return res.json({ ok: true, data: response.data.data });
  } catch (error) {
    return safeError(res, error, "Failed to fetch score edit status", getSessionUserId(req));
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
    const result = await generateStrategyAdvice(token, prompt);
    return res.json({ ok: true, ...result });
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
      { name: "get_profile_details", method: "GET", path: "/tools/profile/details" },
      { name: "get_objectives", method: "GET", path: "/tools/objectives" },
      { name: "create_objective", method: "POST", path: "/tools/objectives" },
      { name: "create_key_result", method: "POST", path: "/tools/key-results" },
      {
        name: "update_objective_progress",
        method: "PATCH",
        path: "/tools/objectives/progress",
      },
      { name: "get_departments", method: "GET", path: "/tools/departments" },
      { name: "get_current_department", method: "GET", path: "/tools/departments/current" },
      {
        name: "get_current_department_objectives",
        method: "GET",
        path: "/tools/departments/current/objectives",
      },
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
      {
        name: "get_department_objective_key_results",
        method: "GET",
        path: "/tools/department-objectives/:id/key-results",
      },
      {
        name: "get_dashboard_year_filters",
        method: "GET",
        path: "/tools/dashboard/year-filters",
      },
      {
        name: "get_dashboard_objective_growth",
        method: "GET",
        path: "/tools/dashboard/objective-growth?year=YYYY-YY&quarter=Q",
      },
      {
        name: "get_dashboard_department_growth",
        method: "GET",
        path: "/tools/dashboard/department-growth?year=YYYY-YY&quarter=Q",
      },
      {
        name: "get_dashboard_yearly_growth",
        method: "GET",
        path: "/tools/dashboard/yearly-growth?year=YYYY-YY",
      },
      {
        name: "get_schedule_details",
        method: "GET",
        path: "/tools/settings/schedule",
      },
      {
        name: "update_schedule_details",
        method: "PUT",
        path: "/tools/settings/schedule",
      },
      {
        name: "get_score_edit_status",
        method: "GET",
        path: "/tools/settings/score-edit-status",
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
  getProfileDetailsTool,
  getObjectivesTool,
  createObjectiveTool,
  createKeyResultTool,
  updateObjectiveProgressTool,
  getDepartmentsTool,
  getCurrentDepartmentTool,
  getCurrentDepartmentObjectivesTool,
  createDepartmentObjectiveTool,
  getDepartmentObjectivesTool,
  createDepartmentTaskKeyResultTool,
  getDepartmentObjectiveKeyResultsTool,
  getDashboardYearFiltersTool,
  getDashboardObjectiveGrowthTool,
  getDashboardDepartmentGrowthTool,
  getDashboardYearlyGrowthTool,
  getScheduleDetailsTool,
  updateScheduleDetailsTool,
  getScoreEditStatusTool,
  strategyAdviceTool,
  departmentAlignmentTool,
  logoutTool,
  capabilitiesTool,
};
