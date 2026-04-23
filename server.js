const express = require("express");
const config = require("./config/env");

const aiRoutes = require("./routes/ai.routes");
const authRoutes = require("./routes/auth.routes");

const app = express();

app.use(express.json());

app.use("/ai", aiRoutes);
app.use("/login", authRoutes);

app.listen(config.port, () => {
  console.log(`Tool server running on port ${config.port}`);
});
