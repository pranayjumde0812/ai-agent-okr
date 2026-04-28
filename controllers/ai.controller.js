const {
  sendOtp,
  verifyOtp,
  signOut,
} = require("../services/auth.service");
const {
  sendMessage,
} = require("../services/telegram.service");
const { runAgent, HELP_TEXT } = require("../services/agent.service");
const sessionStore = require("../utils/session.store");
const { isAuthExpiredError } = require("../utils/auth-error");

const isEmailInput = (text) => text.includes("@");
const isOtpInput = (text) => !Number.isNaN(Number(text));
const isHelpInput = (text) => ["/start", "start", "help", "/help"].includes(text.toLowerCase());
const isLogoutInput = (text) => ["logout", "/logout", "sign out", "signout", "log out"].includes(text.toLowerCase());

const handleAI = async (req, res) => {
  try {
    const text = req.body.message?.text?.trim();
    const telegramUserId = req.body.message?.from?.id;

    if (!text || !telegramUserId) {
      return res.sendStatus(200);
    }

    console.log("Incoming:", text);

    const session = sessionStore.getSession(telegramUserId);
    const history = sessionStore.getHistory(telegramUserId);
    sessionStore.appendHistory(telegramUserId, "user", text);

    if (isHelpInput(text)) {
      const helpMessage = session?.token
        ? HELP_TEXT
        : [
            "Send your email first to log in.",
            "",
            HELP_TEXT,
          ].join("\n");

      await sendMessage(telegramUserId, helpMessage);
      sessionStore.appendHistory(telegramUserId, "assistant", helpMessage);
      return res.sendStatus(200);
    }

    if (isLogoutInput(text)) {
      if (!session?.token) {
        const loggedOutMessage = "You are not logged in right now.";
        await sendMessage(telegramUserId, loggedOutMessage);
        sessionStore.appendHistory(telegramUserId, "assistant", loggedOutMessage);
        return res.sendStatus(200);
      }

      try {
        await signOut(session.token);
      } catch (error) {
        if (!isAuthExpiredError(error)) {
          throw error;
        }
      }

      sessionStore.clearSession(telegramUserId);

      const logoutMessage = "You have been logged out successfully. Send your email address whenever you want to log in again.";
      await sendMessage(telegramUserId, logoutMessage);
      sessionStore.appendHistory(telegramUserId, "assistant", logoutMessage);
      return res.sendStatus(200);
    }

    if (session?.token && isEmailInput(text)) {
      await sendMessage(telegramUserId, "You are already logged in ✅");
      sessionStore.appendHistory(
        telegramUserId,
        "assistant",
        "You are already logged in."
      );
      return res.sendStatus(200);
    }

    if (!session?.token && isEmailInput(text)) {
      try {
        await sendOtp(text);
        sessionStore.setSession(telegramUserId, { email: text });

        await sendMessage(telegramUserId, "📩 OTP sent to your email");
        sessionStore.appendHistory(
          telegramUserId,
          "assistant",
          "OTP sent to your email."
        );
      } catch (error) {
        await sendMessage(
          telegramUserId,
          "❌ Invalid email. Please enter a valid registered email."
        );
        sessionStore.appendHistory(
          telegramUserId,
          "assistant",
          "Invalid email. Please enter a valid registered email."
        );
      }

      return res.sendStatus(200);
    }

    if (!session?.token && isOtpInput(text)) {
      if (!session?.email) {
        await sendMessage(telegramUserId, "⚠️ Please enter your email first");
        sessionStore.appendHistory(
          telegramUserId,
          "assistant",
          "Please enter your email first."
        );
        return res.sendStatus(200);
      }

      try {
        const response = await verifyOtp(session.email, Number(text));
        const token = response.data.data.tokens.access.token;

        sessionStore.setSession(telegramUserId, { token });

        await sendMessage(telegramUserId, "✅ Login successful");
        sessionStore.appendHistory(
          telegramUserId,
          "assistant",
          "Login successful."
        );
      } catch (error) {
        await sendMessage(telegramUserId, "❌ Invalid OTP. Please try again");
        sessionStore.appendHistory(
          telegramUserId,
          "assistant",
          "Invalid OTP. Please try again."
        );
      }

      return res.sendStatus(200);
    }

    if (!session?.token) {
      const loginMessage = [
        "🔒 Please login first by sending your email address.",
        "",
        HELP_TEXT,
      ].join("\n");

      await sendMessage(telegramUserId, loginMessage);
      sessionStore.appendHistory(telegramUserId, "assistant", loginMessage);
      return res.sendStatus(200);
    }

    const agentResult = await runAgent({
      message: text,
      session,
      history,
    });

    if (Array.isArray(agentResult.suggestedOrganizationObjectives)) {
      sessionStore.setSession(telegramUserId, {
        suggestedOrganizationObjectives: agentResult.suggestedOrganizationObjectives,
        awaitingSuggestedObjectiveSelection:
          agentResult.suggestedOrganizationObjectives.length > 0,
      });
    }

    if (session?.token && !Array.isArray(agentResult.suggestedOrganizationObjectives)) {
      sessionStore.setSession(telegramUserId, {
        awaitingSuggestedObjectiveSelection: false,
      });
    }

    await sendMessage(telegramUserId, agentResult.text);
    sessionStore.appendHistory(telegramUserId, "assistant", agentResult.text);
    return res.sendStatus(200);
  } catch (error) {
    console.error("AI CONTROLLER ERROR:", error?.response?.data || error.message);
    const telegramUserId = req.body.message?.from?.id;
    const fallbackMessage = isAuthExpiredError(error)
      ? "Your login session expired. Please send your email address to log in again."
      : error.code === "ECONNREFUSED"
        ? "⚠️ Ollama is not reachable. Start Ollama and confirm OLLAMA_BASE_URL is correct."
        : "⚠️ Something went wrong. Please try again.";

    if (telegramUserId && isAuthExpiredError(error)) {
      sessionStore.clearAuthSession(telegramUserId);
    }

    await sendMessage(telegramUserId, fallbackMessage);

    if (telegramUserId) {
      sessionStore.appendHistory(telegramUserId, "assistant", fallbackMessage);
    }

    return res.sendStatus(200);
  }
};

module.exports = { handleAI };
