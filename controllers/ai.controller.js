const { sendMessage, sendMenu } = require("../services/telegram.service");
const { sendOtp, verifyOtp, getProfile } = require("../services/auth.service");
const { createObjective } = require("../services/objective.service");
const sessionStore = require("../utils/session.store");

const handleAI = async (req, res) => {
  try {
    const text = req.body.message?.text;
    const userId = req.body.message?.from?.id;

    if (!text) return res.sendStatus(200);

    console.log("Incoming:", text);

    const session = sessionStore.getSession(userId);

    // ================= LOGIN EMAIL =================
    if (text.includes("@")) {
      await sendOtp(text);
      sessionStore.setSession(userId, { email: text });

      await sendMessage(userId, "OTP sent ✅");
      return res.sendStatus(200);
    }

    // ================= OTP =================
    if (!isNaN(text)) {
      if (!session?.email) {
        await sendMessage(userId, "Enter email first");
        return res.sendStatus(200);
      }

      const resOtp = await verifyOtp(session.email, Number(text));

      sessionStore.setSession(userId, {
        token: resOtp.data.data.tokens.access.token,
      });

      await sendMessage(userId, "Login successful ✅");
      await sendMenu(userId);

      return res.sendStatus(200);
    }

    // ================= MENU =================
    if (text === "👤 View Profile") {
      const profile = await getProfile(session.token);

      const org = profile.data.data;

      await sendMessage(
        userId,
        `Name: ${org.fullName}\nCompany: ${org.companyName}`
      );

      return res.sendStatus(200);
    }

    if (text === "🎯 Create Objective") {
      sessionStore.setSession(userId, { step: "create_objective" });

      await sendMessage(userId, "Send: Name | Description");

      return res.sendStatus(200);
    }

    // ================= STEP FLOW =================
    if (session?.step === "create_objective") {
      const [name, description] = text.split("|");

      await createObjective(session.token, name.trim(), description?.trim());

      sessionStore.clearStep(userId);

      await sendMessage(userId, "Objective created ✅");
      await sendMenu(userId);

      return res.sendStatus(200);
    }

    await sendMessage(userId, "Invalid input");
    return res.sendStatus(200);

  } catch (err) {
    console.error(err.message);
    return res.sendStatus(200);
  }
};

module.exports = { handleAI };