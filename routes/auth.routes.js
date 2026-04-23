const express = require("express");
const router = express.Router();

const {
  sendOtpController,
  verifyOtpController,
} = require("../controllers/auth.controller");

router.post("/send-otp", sendOtpController);
router.post("/verify-otp", verifyOtpController);

module.exports = router;
