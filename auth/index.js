require("dotenv").config();
const express = require("express");
const session = require("express-session");
const passport = require("passport");
const connectDB = require("./config/db");
const authRoutes = require("./routes/auth");
require("./config/passport"); // ⬅️ load Google strategy

const app = express();

connectDB();
app.use(express.json());

app.use(
  session({
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
  })
);

app.use(passport.initialize());
app.use(passport.session());

app.get("/", (req, res) => {
  res.send({ message: "Hello, World!" });
});
app.use("/auth", authRoutes);

app.listen(3000, () => {
  console.log("Server is running on http://localhost:3000");
});
