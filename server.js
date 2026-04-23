const express = require("express");
const config = require("./config/env");

const aiRoutes = require("./routes/ai.routes");
const authRoutes = require("./routes/auth.routes");
const healthRoutes = require("./routes/health.routes");
const { getSystemHealth } = require("./services/health.service");

const app = express();

app.use(express.json());

app.use("/ai", aiRoutes);
app.use("/login", authRoutes);
app.use("/health", healthRoutes);

app.listen(config.port, () => {
  console.log(`Tool server running on port ${config.port}`);
  getSystemHealth()
    .then((health) => {
      console.log(
        `Startup health: backend=${health.backend.ok ? "ok" : "down"}, ollama=${health.ollama.ok ? "ok" : "down"}, model=${health.ollama.configuredModelAvailable ? "ready" : "missing"}`
      );
    })
    .catch((error) => {
      console.error("STARTUP HEALTH ERROR:", error.message);
    });
});
