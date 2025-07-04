require("dotenv").config();
const express = require("express");
const session = require("express-session");
const passport = require("passport");
const cookieParser = require("cookie-parser");

const connectDB = require("./config/db");
require("./config/passport"); // ⬅️ Load Google & GitHub strategies

const authRoutes = require("./routes/auth");

const app = express();

// ===================
// 🔗 Connect to MongoDB
// ===================
connectDB();

// ===================
// 🛠️ Middlewares
// ===================
app.use(express.json());
app.use(cookieParser());

app.use(
  session({
    secret: process.env.SESSION_SECRET || "supersecret",
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      secure: false, // set to true in production with HTTPS
      maxAge: 24 * 60 * 60 * 1000, // 1 day
    },
  })
);

app.use(passport.initialize());
app.use(passport.session());

// ===================
// 🌐 Routes
// ===================
app.get("/", (req, res) => {
  res.send({ message: "Hello, World! Auth service is running ✅" });
});

app.use("/auth", authRoutes);

// ===================
// 🚀 Start Server
// ===================
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`✅ Server is running on http://localhost:${PORT}`);
});
