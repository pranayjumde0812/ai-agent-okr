const {
  sendOtp,
  verifyOtp,
  signOut,
} = require("../services/auth.service");
const {
  answerCallbackQuery,
  clearInlineKeyboard,
  sendMessage,
} = require("../services/telegram.service");
const { runAgent, HELP_TEXT } = require("../services/agent.service");
const sessionStore = require("../utils/session.store");
const { isAuthExpiredError } = require("../utils/auth-error");

const isEmailInput = (text) => text.includes("@");
const isOtpInput = (text) => !Number.isNaN(Number(text));
const isHelpInput = (text) => ["/start", "start", "help", "/help"].includes(text.toLowerCase());
const isLogoutInput = (text) => ["logout", "/logout", "sign out", "signout", "log out"].includes(text.toLowerCase());

const getFriendlyErrorMessage = (error) => {
  const backendMessage = error?.response?.data?.message;

  if (typeof backendMessage === "string") {
    if (backendMessage.includes("already exists")) {
      return `That department objective already exists.`;
    }

    if (backendMessage.includes("Department not found")) {
      return "I could not find the selected department. Please choose the department again.";
    }

    return backendMessage;
  }

  if (error.code === "ECONNREFUSED") {
    return "⚠️ Ollama is not reachable. Start Ollama and confirm OLLAMA_BASE_URL is correct.";
  }

  return "⚠️ Something went wrong. Please try again.";
};

const handleAI = async (req, res) => {
  try {
    const callbackData = req.body.callback_query?.data?.trim();
    const callbackQueryId = req.body.callback_query?.id;
    const callbackMessageId = req.body.callback_query?.message?.message_id;
    const text = req.body.message?.text?.trim() || callbackData;
    const telegramUserId = req.body.message?.from?.id || req.body.callback_query?.from?.id;
    const telegramChatId = req.body.message?.chat?.id || req.body.callback_query?.message?.chat?.id || telegramUserId;

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

    if (callbackQueryId) {
      await answerCallbackQuery(callbackQueryId);
    }

    if (callbackQueryId && callbackMessageId && agentResult.clearSourceReplyMarkup) {
      await clearInlineKeyboard(telegramChatId, callbackMessageId);
    }

    if (agentResult.sessionUpdates) {
      sessionStore.setSession(telegramUserId, agentResult.sessionUpdates);
    }

    await sendMessage(telegramChatId, agentResult.text, {
      ...(agentResult.replyMarkup
        ? { reply_markup: agentResult.replyMarkup }
        : {}),
    });
    sessionStore.appendHistory(telegramUserId, "assistant", agentResult.text);
    return res.sendStatus(200);
  } catch (error) {
    console.error("AI CONTROLLER ERROR:", error?.response?.data || error.message);
    const callbackQueryId = req.body.callback_query?.id;
    const telegramUserId = req.body.message?.from?.id || req.body.callback_query?.from?.id;
    const telegramChatId = req.body.message?.chat?.id || req.body.callback_query?.message?.chat?.id || telegramUserId;
    const fallbackMessage = isAuthExpiredError(error)
      ? "Your login session expired. Please send your email address to log in again."
      : getFriendlyErrorMessage(error);

    if (telegramUserId && isAuthExpiredError(error)) {
      sessionStore.clearAuthSession(telegramUserId);
    }

    if (callbackQueryId) {
      await answerCallbackQuery(callbackQueryId, "Something went wrong");
    }

    await sendMessage(telegramChatId, fallbackMessage);

    if (telegramUserId) {
      sessionStore.appendHistory(telegramUserId, "assistant", fallbackMessage);
    }

    return res.sendStatus(200);
  }
};

module.exports = { handleAI };
