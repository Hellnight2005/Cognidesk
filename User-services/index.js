require("dotenv").config();
const express = require("express");
const connectDB = require("./config/db");
const morgan = require("morgan"); // For logging requests
const userRoutes = require("./routes/userRoutes");
// const errorHandler = require("./middleware/errorHandler");

const app = express();
connectDB();

app.use(express.json());
app.use(morgan("dev")); // Log HTTP requests
// Routes
app.use("/api/users", userRoutes);

// Error handling
// app.use(errorHandler);

// Health
app.get("/", (req, res) => res.send({ status: "🟢 User Service running" }));

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
  console.log(`🚀 Server on http://localhost:${PORT}`);
});
