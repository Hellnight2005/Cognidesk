require("dotenv").config();
const express = require("express");
const morgan = require("morgan");
const connectDB = require("./config/db");
const ideaRoutes = require("./routes/ideaRoutes");
// const errorHandler = require("./middleware/errorHandler");

const app = express();
connectDB();

app.use(express.json());
app.use(morgan("dev"));
app.use("/api/ideas", ideaRoutes);
// Health
app.get("/", (req, res) =>
  res.send({ status: "🟢 Idea valut service running" })
);

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
  console.log(`🚀 Server on http://localhost:${PORT}`);
});
