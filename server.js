const express = require("express");
const axios = require("axios");

const authRoutes = require("./routes/auth.routes");

const app = express();
app.use(express.json());

app.use("/login", authRoutes);

// ✅ In-memory session store
const sessions = {};

app.post("/ai", async (req, res) => {
  try {
    const body = req.body;

    const text = body.message?.text?.trim();
    const telegramUserId = body.message?.from?.id;

    if (!text) return res.sendStatus(200);

    console.log("Incoming:", text);

    const session = sessions[telegramUserId];

    // =========================
    // ✅ ALREADY LOGGED IN CHECK
    // =========================
    if (session?.token && text.includes("@")) {
      await sendTelegramMessage(
        telegramUserId,
        "You are already logged in ✅"
      );
      return res.sendStatus(200);
    }

    // =========================
    // STEP 1: EMAIL
    // =========================
    if (!session?.token && text.includes("@")) {
      try {
        await axios.post(
          "http://127.0.0.1:3000/v1/auth/sign-in/organization",
          { email: text }
        );

        sessions[telegramUserId] = {
          ...session,
          email: text,
        };

        await sendTelegramMessage(
          telegramUserId,
          "📩 OTP sent to your email"
        );
      } catch (err) {
        await sendTelegramMessage(
          telegramUserId,
          "❌ Invalid email. Please enter a valid registered email."
        );
      }

      return res.sendStatus(200);
    }

    // =========================
    // STEP 2: OTP
    // =========================
    if (!session?.token && !isNaN(text)) {
      if (!session?.email) {
        await sendTelegramMessage(
          telegramUserId,
          "⚠️ Please enter your email first"
        );
        return res.sendStatus(200);
      }

      try {
        const response = await axios.post(
          "http://127.0.0.1:3000/v1/auth/verify-otp/organization",
          {
            email: session.email,
            otp: Number(text),
          }
        );

        sessions[telegramUserId] = {
          ...session,
          token: response.data.data.tokens.access.token,
        };

        await sendTelegramMessage(
          telegramUserId,
          "✅ Login successful"
        );
      } catch (err) {
        await sendTelegramMessage(
          telegramUserId,
          "❌ Invalid OTP. Please try again"
        );
      }

      return res.sendStatus(200);
    }

    // =========================
    // STEP 3: CREATE OBJECTIVE
    // =========================
    if (text.toLowerCase().includes("create objective")) {
      if (!session?.token) {
        await sendTelegramMessage(
          telegramUserId,
          "🔒 Please login first"
        );
        return res.sendStatus(200);
      }

      try {
        const raw = text.replace("create objective:", "").trim();
        const [objectiveName, description] = raw.split("|");

        if (!objectiveName) {
          await sendTelegramMessage(
            telegramUserId,
            "⚠️ Format:\ncreate objective: Name | Description"
          );
          return res.sendStatus(200);
        }

        const payload = [
          {
            objectiveName: objectiveName.trim(),
            description: description?.trim() || "",
          },
        ];

        await axios.post(
          "http://127.0.0.1:3000/v1/objective",
          payload,
          {
            headers: {
              Authorization: `Bearer ${session.token}`,
            },
          }
        );

        await sendTelegramMessage(
          telegramUserId,
          "🎯 Objective created successfully"
        );
      } catch (err) {
        await sendTelegramMessage(
          telegramUserId,
          "❌ Failed to create objective"
        );
      }

      return res.sendStatus(200);
    }

    // =========================
    // STEP 4: GET OBJECTIVES
    // =========================
    if (text.toLowerCase().includes("get objectives")) {
      if (!session?.token) {
        await sendTelegramMessage(
          telegramUserId,
          "🔒 Please login first"
        );
        return res.sendStatus(200);
      }

      try {
        const response = await axios.get(
          "http://127.0.0.1:3000/v1/objective",
          {
            headers: {
              Authorization: `Bearer ${session.token}`,
            },
          }
        );

        const objectives = response.data.data.objectives;

        if (!objectives || objectives.length === 0) {
          await sendTelegramMessage(
            telegramUserId,
            "📭 No objectives found"
          );
          return res.sendStatus(200);
        }

        let message = "📋 Your Objectives:\n\n";

        objectives.forEach((obj, index) => {
          message += `🎯 ${index + 1}. ${obj.objectiveName}\n`;
          message += `📝 ${obj.description || "No description"}\n\n`;
        });

        await sendTelegramMessage(telegramUserId, message);
      } catch (err) {
        await sendTelegramMessage(
          telegramUserId,
          "❌ Failed to fetch objectives"
        );
      }

      return res.sendStatus(200);
    }

    // =========================
// STEP 5: GET ORGANIZATION PROFILE
// =========================
if (text.toLowerCase().includes("get profile")) {
  const session = sessions[telegramUserId];

  if (!session || !session.token) {
    await sendTelegramMessage(
      telegramUserId,
      "❌ Please login first"
    );
    return res.sendStatus(200);
  }

  try {
    const response = await axios.get(
      "http://127.0.0.1:3000/v1/organization/current-organization",
      {
        headers: {
          Authorization: `Bearer ${session.token}`,
        },
      }
    );

    const org = response.data.data;

    let message = `🏢 *Organization Profile*\n\n`;

    message += `👤 Name: ${org.fullName}\n`;
    message += `🏢 Company: ${org.companyName}\n\n`;

    message += `📌 About: ${org.aboutCompany || "-"}\n`;
    message += `🎯 Mission: ${org.companyMission || "-"}\n`;
    message += `👁 Vision: ${org.companyVision || "-"}\n\n`;

    message += `🚀 Purpose: ${org.purpose || "-"}\n`;
    message += `💡 Solution: ${org.solution || "-"}`;

    await sendTelegramMessage(telegramUserId, message);

  } catch (err) {
    console.error(err?.response?.data || err.message);

    await sendTelegramMessage(
      telegramUserId,
      "❌ Failed to fetch profile"
    );
  }

  return res.sendStatus(200);
}

// =========================
// STEP 6: GET DEPARTMENTS
// =========================
if (text.toLowerCase().includes("get departments")) {

  // 🔐 Get user session (contains token after login)
  const session = sessions[telegramUserId];

  // ❌ If user is not logged in, block access
  if (!session || !session.token) {
    await sendTelegramMessage(
      telegramUserId,
      "❌ Please login first"
    );
    return res.sendStatus(200);
  }

  try {
    // 📡 Call backend API to fetch departments
    const response = await axios.get(
      "http://127.0.0.1:3000/v1/dashboard/departments",
      {
        headers: {
          Authorization: `Bearer ${session.token}`, // 🔑 Auth token
        },
      }
    );

    // ⚠️ Handle different response formats safely
    // (some APIs return 'departments', others 'departmentUsers')
    const departments =
      response.data.data.departments ||
      response.data.data.departmentUsers;

    // ❌ If no departments found
    if (!departments || departments.length === 0) {
      await sendTelegramMessage(
        telegramUserId,
        "No departments found ❌"
      );
      return res.sendStatus(200);
    }

    // 🧾 Build formatted message for Telegram
    let message = "🏢 Departments & Details:\n\n";

    departments.forEach((dept, index) => {

      // 📌 Department name
      message += `${index + 1}. ${dept.departmentName}\n`;

      // 👤 Full name (fallback if missing)
      message += `👤 Name: ${dept.fullName || "-"}\n`;

      // 📧 Email
      message += `📧 Email: ${dept.email}\n`;

      // 📊 Progress (fallback to 0 if undefined)
      message += `📊 Progress: ${dept.progressPercentage ?? 0}%\n\n`;
    });

    // 📤 Send final message to Telegram
    await sendTelegramMessage(telegramUserId, message);

  } catch (err) {
    // 🐞 Log detailed backend error for debugging
    console.error("GET DEPARTMENTS ERROR:", err?.response?.data || err.message);

    // ❌ User-friendly error message
    await sendTelegramMessage(
      telegramUserId,
      "❌ Failed to fetch departments. Please try again."
    );
  }

  // ✅ Always return 200 to avoid Telegram webhook failure
  return res.sendStatus(200);
}

    // =========================
    // DEFAULT
    // =========================
    await sendTelegramMessage(
      telegramUserId,
      "💡 Commands:\n\n1. Send email to login\n2. Enter OTP\n3. create objective: Name | Description\n4. get objectives\n5. get profile"
    );

    return res.sendStatus(200);
  } catch (err) {
    console.error("ERROR:", err?.response?.data || err.message);

    await sendTelegramMessage(
      telegramUserId,
      "⚠️ Something went wrong. Please try again."
    );

    return res.sendStatus(200);
  }
});

// =========================
// TELEGRAM SEND FUNCTION
// =========================
const sendTelegramMessage = async (chatId, text) => {
  try {
    await axios.post(
      `https://api.telegram.org/bot8679641024:AAG3D2LqDrGFSUk013uPZfJVy3Frye8h0Dc/sendMessage`,
      {
        chat_id: chatId,
        text,
      }
    );
  } catch (err) {
    console.error("Telegram Error:", err.message);
  }
};

app.listen(6000, () => {
  console.log("Tool server running on port 6000");
});


// const express = require("express");
// const axios = require("axios");

// const authRoutes = require("./routes/auth.routes");

// const app = express();
// app.use(express.json());

// app.use("/login", authRoutes);

// // =========================
// // ✅ In-memory session store
// // =========================
// const sessions = {};

// // =========================
// // 🚀 MAIN TELEGRAM HANDLER
// // =========================
// app.post("/ai", async (req, res) => {
//   try {
//     const text = req.body.message?.text?.trim();
//     const telegramUserId = req.body.message?.from?.id;

//     if (!text) return res.sendStatus(200);

//     console.log("Incoming:", text);

//     const session = sessions[telegramUserId];

//     // =========================
//     // 🟢 COMMAND: MENU / START
//     // =========================
//     if (["/start", "menu", "help"].includes(text.toLowerCase())) {
//       await sendMenu(telegramUserId);
//       return res.sendStatus(200);
//     }

//     // =========================
//     // ⚠️ ALREADY LOGGED IN
//     // =========================
//     if (session?.token && text.includes("@")) {
//       await sendTelegramMessage(
//         telegramUserId,
//         "✅ You are already logged in"
//       );
//       return res.sendStatus(200);
//     }

//     // =========================
//     // 📧 STEP 1: EMAIL
//     // =========================
//     if (!session?.token && text.includes("@")) {
//       try {
//         await axios.post(
//           "http://127.0.0.1:3000/v1/auth/sign-in/organization",
//           { email: text }
//         );

//         sessions[telegramUserId] = {
//           ...session,
//           email: text,
//         };

//         await sendTelegramMessage(
//           telegramUserId,
//           "📩 OTP sent to your email"
//         );
//       } catch {
//         await sendTelegramMessage(
//           telegramUserId,
//           "❌ Invalid email. Please try again"
//         );
//       }

//       return res.sendStatus(200);
//     }

//     // =========================
//     // 🔐 STEP 2: OTP
//     // =========================
//     if (!session?.token && !isNaN(text)) {
//       if (!session?.email) {
//         await sendTelegramMessage(
//           telegramUserId,
//           "⚠️ Enter email first"
//         );
//         return res.sendStatus(200);
//       }

//       try {
//         const response = await axios.post(
//           "http://127.0.0.1:3000/v1/auth/verify-otp/organization",
//           {
//             email: session.email,
//             otp: Number(text),
//           }
//         );

//         sessions[telegramUserId] = {
//           ...session,
//           token: response.data.data.tokens.access.token,
//         };

//         await sendTelegramMessage(
//           telegramUserId,
//           "✅ Login successful"
//         );

//         await sendMenu(telegramUserId); // 👈 show menu after login
//       } catch {
//         await sendTelegramMessage(
//           telegramUserId,
//           "❌ Invalid OTP"
//         );
//       }

//       return res.sendStatus(200);
//     }

//     // =========================
//     // 🔒 REQUIRE LOGIN BELOW
//     // =========================
//     if (!session?.token) {
//       await sendTelegramMessage(
//         telegramUserId,
//         "🔒 Please login first"
//       );
//       return res.sendStatus(200);
//     }

//     // =========================
//     // 🎯 CREATE OBJECTIVE
//     // =========================
//     if (text.toLowerCase().includes("create objective")) {
//       try {
//         const raw = text.replace("create objective:", "").trim();
//         const [objectiveName, description] = raw.split("|");

//         if (!objectiveName) {
//           await sendTelegramMessage(
//             telegramUserId,
//             "⚠️ Format:\ncreate objective: Name | Description"
//           );
//           return res.sendStatus(200);
//         }

//         const payload = [
//           {
//             objectiveName: objectiveName.trim(),
//             description: description?.trim() || "",
//           },
//         ];

//         await axios.post(
//           "http://127.0.0.1:3000/v1/objective",
//           payload,
//           {
//             headers: {
//               Authorization: `Bearer ${session.token}`,
//             },
//           }
//         );

//         await sendTelegramMessage(
//           telegramUserId,
//           "🎯 Objective created"
//         );
//       } catch {
//         await sendTelegramMessage(
//           telegramUserId,
//           "❌ Failed to create objective"
//         );
//       }

//       return res.sendStatus(200);
//     }

//     // =========================
//     // 📋 GET OBJECTIVES
//     // =========================
//     if (text.toLowerCase().includes("get objectives")) {
//       try {
//         const response = await axios.get(
//           "http://127.0.0.1:3000/v1/objective",
//           {
//             headers: {
//               Authorization: `Bearer ${session.token}`,
//             },
//           }
//         );

//         const objectives = response.data.data.objectives;

//         if (!objectives?.length) {
//           await sendTelegramMessage(
//             telegramUserId,
//             "📭 No objectives found"
//           );
//           return res.sendStatus(200);
//         }

//         let message = "📋 Your Objectives:\n\n";

//         objectives.forEach((obj, i) => {
//           message += `${i + 1}. ${obj.objectiveName}\n`;
//           message += `📝 ${obj.description || "-"}\n\n`;
//         });

//         await sendTelegramMessage(telegramUserId, message);
//       } catch {
//         await sendTelegramMessage(
//           telegramUserId,
//           "❌ Failed to fetch objectives"
//         );
//       }

//       return res.sendStatus(200);
//     }

//     // =========================
//     // 🏢 GET PROFILE
//     // =========================
//     if (text.toLowerCase().includes("get profile")) {
//       try {
//         const resData = await axios.get(
//           "http://127.0.0.1:3000/v1/organization/current-organization",
//           {
//             headers: {
//               Authorization: `Bearer ${session.token}`,
//             },
//           }
//         );

//         const org = resData.data.data;

//         const message = `
// 🏢 Organization Profile

// 👤 ${org.fullName}
// 🏢 ${org.companyName}

// 📌 ${org.aboutCompany || "-"}
// 🎯 ${org.companyMission || "-"}
// 👁 ${org.companyVision || "-"}

// 🚀 ${org.purpose || "-"}
// 💡 ${org.solution || "-"}
// `;

//         await sendTelegramMessage(telegramUserId, message);
//       } catch {
//         await sendTelegramMessage(
//           telegramUserId,
//           "❌ Failed to fetch profile"
//         );
//       }

//       return res.sendStatus(200);
//     }

//     // =========================
//     // 🏢 GET DEPARTMENTS
//     // =========================
//     if (text.toLowerCase().includes("get departments")) {
//       try {
//         const response = await axios.get(
//           "http://127.0.0.1:3000/v1/dashboard/departments",
//           {
//             headers: {
//               Authorization: `Bearer ${session.token}`,
//             },
//           }
//         );

//         const departments =
//           response.data.data.departments ||
//           response.data.data.departmentUsers;

//         if (!departments?.length) {
//           await sendTelegramMessage(
//             telegramUserId,
//             "📭 No departments found"
//           );
//           return res.sendStatus(200);
//         }

//         let message = "🏢 Departments:\n\n";

//         departments.forEach((d, i) => {
//           message += `${i + 1}. ${d.departmentName}\n`;
//           message += `👤 ${d.fullName || "-"}\n`;
//           message += `📧 ${d.email}\n`;
//           message += `📊 ${d.progressPercentage ?? 0}%\n\n`;
//         });

//         await sendTelegramMessage(telegramUserId, message);
//       } catch {
//         await sendTelegramMessage(
//           telegramUserId,
//           "❌ Failed to fetch departments"
//         );
//       }

//       return res.sendStatus(200);
//     }

//     // =========================
//     // ❓ DEFAULT
//     // =========================
//     await sendMenu(telegramUserId);

//     return res.sendStatus(200);

//   } catch (err) {
//     console.error("ERROR:", err?.response?.data || err.message);

//     await sendTelegramMessage(
//       req.body.message?.from?.id,
//       "⚠️ Something went wrong"
//     );

//     return res.sendStatus(200);
//   }
// });

// // =========================
// // 📩 TELEGRAM MESSAGE
// // =========================
// const sendTelegramMessage = async (chatId, text) => {
//   await axios.post(
//     `https://api.telegram.org/bot<YOUR_BOT_TOKEN>/sendMessage`,
//     { chat_id: chatId, text }
//   );
// };

// // =========================
// // 📋 MENU
// // =========================
// const sendMenu = async (chatId) => {
//   await sendTelegramMessage(
//     chatId,
//     `💡 Commands:

// 1. Send email to login
// 2. Enter OTP
// 3. create objective: Name | Description
// 4. get objectives
// 5. get profile
// 6. get departments`
//   );
// };

// app.listen(6000, () => {
//   console.log("🚀 Server running on port 6000");
// });