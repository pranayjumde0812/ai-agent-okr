const express = require("express");
const {
  sendOtpTool,
  verifyOtpTool,
  getProfileTool,
  getObjectivesTool,
  createObjectiveTool,
  createKeyResultTool,
  updateObjectiveProgressTool,
  getDepartmentsTool,
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
router.get("/objectives", getObjectivesTool);
router.post("/objectives", createObjectiveTool);
router.patch("/objectives/progress", updateObjectiveProgressTool);
router.post("/key-results", createKeyResultTool);
router.get("/departments", getDepartmentsTool);

router.post("/strategy/advice", strategyAdviceTool);
router.post("/strategy/department-alignment", departmentAlignmentTool);

module.exports = router;
