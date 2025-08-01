require("dotenv").config();
const morgan = require("morgan");
const express = require("express");
const connectDB = require("./config/db");
const activeProjectRoutes = require("./routes/active-project");
const app = express();

app.use(express.json());
app.use(morgan("dev"));
connectDB();

app.use("/api/projects", activeProjectRoutes);
app.get("/", (req, res) => {
  res.send("Active Projects Service is running");
});

app.listen(process.env.PORT || 3000, () => {
  console.log(
    `Active Projects Service is running on port ${process.env.PORT || 3000}`
  );
});
