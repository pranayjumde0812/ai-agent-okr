const express = require("express");
const {
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
  updateDepartmentObjectiveKeyResultWeightageTool,
  updateDepartmentObjectiveKeyResultCurrentScoreTool,
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
} = require("../controllers/tools.controller");

const router = express.Router();

router.get("/", capabilitiesTool);
router.get("/capabilities", capabilitiesTool);

router.post("/auth/send-otp", sendOtpTool);
router.post("/auth/verify-otp", verifyOtpTool);
router.post("/auth/logout", logoutTool);

router.get("/profile", getProfileTool);
router.get("/profile/details", getProfileDetailsTool);
router.get("/objectives", getObjectivesTool);
router.post("/objectives", createObjectiveTool);
router.patch("/objectives/progress", updateObjectiveProgressTool);
router.post("/key-results", createKeyResultTool);
router.get("/departments", getDepartmentsTool);
router.get("/departments/current", getCurrentDepartmentTool);
router.get("/departments/current/objectives", getCurrentDepartmentObjectivesTool);
router.post("/department-objectives", createDepartmentObjectiveTool);
router.get("/department-objectives", getDepartmentObjectivesTool);
router.post("/department-objectives/task-key-result", createDepartmentTaskKeyResultTool);
router.get("/department-objectives/:id/key-results", getDepartmentObjectiveKeyResultsTool);
router.put(
  "/department-objectives/key-results/:id/weightage",
  updateDepartmentObjectiveKeyResultWeightageTool
);
router.put(
  "/department-objectives/key-results/:id/current-score",
  updateDepartmentObjectiveKeyResultCurrentScoreTool
);

router.get("/dashboard/year-filters", getDashboardYearFiltersTool);
router.get("/dashboard/objective-growth", getDashboardObjectiveGrowthTool);
router.get("/dashboard/department-growth", getDashboardDepartmentGrowthTool);
router.get("/dashboard/yearly-growth", getDashboardYearlyGrowthTool);
router.get("/settings/schedule", getScheduleDetailsTool);
router.put("/settings/schedule", updateScheduleDetailsTool);
router.get("/settings/score-edit-status", getScoreEditStatusTool);

router.post("/strategy/advice", strategyAdviceTool);
router.post("/strategy/department-alignment", departmentAlignmentTool);

module.exports = router;
