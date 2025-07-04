const crypto = require("crypto");

function generateFingerprint(req) {
  const ip =
    req.headers["x-forwarded-for"]?.split(",").shift() ||
    req.socket?.remoteAddress ||
    "unknown";

  const userAgent = req.headers["user-agent"] || "unknown";
  const platform = req.headers["sec-ch-ua-platform"] || "unknown";

  const raw = `${ip}|${userAgent}|${platform}`;
  const hash = crypto.createHash("sha256").update(raw).digest("hex");

  return hash;
}

module.exports = generateFingerprint;
