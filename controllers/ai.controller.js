const {
  sendOtp,
  verifyOtp,
  getCurrentOrganizationProfile,
} = require("../services/auth.service");
const {
  createObjective,
  getObjectives,
} = require("../services/objective.service");
const { getDepartments } = require("../services/department.service");
const {
  sendMessage,
  sendHelpMessage,
} = require("../services/telegram.service");
const sessionStore = require("../utils/session.store");

const isEmailInput = (text) => text.includes("@");
const isOtpInput = (text) => !Number.isNaN(Number(text));

const formatObjectivesMessage = (objectives) => {
  if (!objectives || objectives.length === 0) {
    return "📭 No objectives found";
  }

  return objectives.reduce((message, objective, index) => {
    return (
      message +
      `🎯 ${index + 1}. ${objective.objectiveName}\n` +
      `📝 ${objective.description || "No description"}\n\n`
    );
  }, "📋 Your Objectives:\n\n");
};

const formatProfileMessage = (organization) => {
  return [
    "🏢 Organization Profile",
    "",
    `👤 Name: ${organization.fullName || "-"}`,
    `🏢 Company: ${organization.companyName || "-"}`,
    "",
    `📌 About: ${organization.aboutCompany || "-"}`,
    `🎯 Mission: ${organization.companyMission || "-"}`,
    `👁 Vision: ${organization.companyVision || "-"}`,
    "",
    `🚀 Purpose: ${organization.purpose || "-"}`,
    `💡 Solution: ${organization.solution || "-"}`,
  ].join("\n");
};

const formatDepartmentsMessage = (departments) => {
  if (!departments || departments.length === 0) {
    return "No departments found ❌";
  }

  return departments.reduce((message, department, index) => {
    return (
      message +
      `${index + 1}. ${department.departmentName || "-"}\n` +
      `👤 Name: ${department.fullName || "-"}\n` +
      `📧 Email: ${department.email || "-"}\n` +
      `📊 Progress: ${department.progressPercentage ?? 0}%\n\n`
    );
  }, "🏢 Departments & Details:\n\n");
};

const handleAI = async (req, res) => {
  try {
    const text = req.body.message?.text?.trim();
    const telegramUserId = req.body.message?.from?.id;

    if (!text || !telegramUserId) {
      return res.sendStatus(200);
    }

    console.log("Incoming:", text);

    const session = sessionStore.getSession(telegramUserId);
    const normalizedText = text.toLowerCase();

    if (session?.token && isEmailInput(text)) {
      await sendMessage(telegramUserId, "You are already logged in ✅");
      return res.sendStatus(200);
    }

    if (!session?.token && isEmailInput(text)) {
      try {
        await sendOtp(text);
        sessionStore.setSession(telegramUserId, { email: text });

        await sendMessage(telegramUserId, "📩 OTP sent to your email");
      } catch (error) {
        await sendMessage(
          telegramUserId,
          "❌ Invalid email. Please enter a valid registered email."
        );
      }

      return res.sendStatus(200);
    }

    if (!session?.token && isOtpInput(text)) {
      if (!session?.email) {
        await sendMessage(telegramUserId, "⚠️ Please enter your email first");
        return res.sendStatus(200);
      }

      try {
        const response = await verifyOtp(session.email, Number(text));
        const token = response.data.data.tokens.access.token;

        sessionStore.setSession(telegramUserId, { token });

        await sendMessage(telegramUserId, "✅ Login successful");
      } catch (error) {
        await sendMessage(telegramUserId, "❌ Invalid OTP. Please try again");
      }

      return res.sendStatus(200);
    }

    if (normalizedText.includes("create objective")) {
      if (!session?.token) {
        await sendMessage(telegramUserId, "🔒 Please login first");
        return res.sendStatus(200);
      }

      try {
        const raw = text.replace(/create objective:/i, "").trim();
        const [objectiveName, description] = raw.split("|");

        if (!objectiveName?.trim()) {
          await sendMessage(
            telegramUserId,
            "⚠️ Format:\ncreate objective: Name | Description"
          );
          return res.sendStatus(200);
        }

        await createObjective(
          session.token,
          objectiveName.trim(),
          description?.trim() || ""
        );

        await sendMessage(
          telegramUserId,
          "🎯 Objective created successfully"
        );
      } catch (error) {
        await sendMessage(telegramUserId, "❌ Failed to create objective");
      }

      return res.sendStatus(200);
    }

    if (normalizedText.includes("get objectives")) {
      if (!session?.token) {
        await sendMessage(telegramUserId, "🔒 Please login first");
        return res.sendStatus(200);
      }

      try {
        const response = await getObjectives(session.token);
        const objectives = response.data.data.objectives;

        await sendMessage(
          telegramUserId,
          formatObjectivesMessage(objectives)
        );
      } catch (error) {
        await sendMessage(telegramUserId, "❌ Failed to fetch objectives");
      }

      return res.sendStatus(200);
    }

    if (normalizedText.includes("get profile")) {
      if (!session?.token) {
        await sendMessage(telegramUserId, "❌ Please login first");
        return res.sendStatus(200);
      }

      try {
        const response = await getCurrentOrganizationProfile(session.token);
        await sendMessage(
          telegramUserId,
          formatProfileMessage(response.data.data)
        );
      } catch (error) {
        console.error("GET PROFILE ERROR:", error?.response?.data || error.message);
        await sendMessage(telegramUserId, "❌ Failed to fetch profile");
      }

      return res.sendStatus(200);
    }

    if (normalizedText.includes("get departments")) {
      if (!session?.token) {
        await sendMessage(telegramUserId, "❌ Please login first");
        return res.sendStatus(200);
      }

      try {
        const response = await getDepartments(session.token);
        const departmentData =
          response.data.data.departments || response.data.data.departmentUsers;

        await sendMessage(
          telegramUserId,
          formatDepartmentsMessage(departmentData)
        );
      } catch (error) {
        console.error(
          "GET DEPARTMENTS ERROR:",
          error?.response?.data || error.message
        );
        await sendMessage(
          telegramUserId,
          "❌ Failed to fetch departments. Please try again."
        );
      }

      return res.sendStatus(200);
    }

    await sendHelpMessage(telegramUserId);
    return res.sendStatus(200);
  } catch (error) {
    console.error("AI CONTROLLER ERROR:", error?.response?.data || error.message);
    await sendMessage(
      req.body.message?.from?.id,
      "⚠️ Something went wrong. Please try again."
    );
    return res.sendStatus(200);
  }
};

module.exports = { handleAI };
