const { sendOtp, verifyOtp } = require("../services/auth.service");
const { setSession, getSession } = require("../utils/session.store");

// STEP 1
exports.sendOtpController = async (req, res) => {
  const { telegramUserId, email } = req.body;

  try {
    await sendOtp(email);

    setSession(telegramUserId, { email });

    res.json({ message: "OTP sent to your email" });
  } catch (err) {
    res.status(500).json({ error: "Failed to send OTP" });
  }
};

// STEP 2
exports.verifyOtpController = async (req, res) => {
  const { telegramUserId, otp } = req.body;

  const session = getSession(telegramUserId);

  if (!session) {
    return res.status(400).json({ error: "No login session found" });
  }

  try {
    const response = await verifyOtp(session.email, Number(otp));

    const data = response.data.data;

    setSession(telegramUserId, {
      token: data.tokens.access.token,
      organizationId: data.organization.id,
      role: "MANAGEMENT",
    });

    res.json({
      message: "Login successful",
      organization: data.organization,
    });
  } catch (err) {
    res.status(500).json({ error: "Invalid OTP" });
  }
};