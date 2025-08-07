require("dotenv").config();
const express = require("express");
const morgan = require("morgan");
const dailyroute = require("./routes/daily-jornal");
const app = express();

app.use(express.json());
app.use(morgan("dev"));

app.get("/", (req, res) => {
  res.send("Welcome to the Daily Journal API");
});
app.use("/api", dailyroute);

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log("Daily Journal API is running on port", PORT);
});
