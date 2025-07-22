const log = {
  info: (...args) => console.log("ℹ️", ...args),
  warn: (...args) => console.warn("⚠️", ...args),
  error: (...args) => console.error("❌", ...args),
  success: (...args) => console.log("✅", ...args),
};

module.exports = log;
