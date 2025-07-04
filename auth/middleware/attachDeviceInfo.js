const moment = require("moment");
const geoip = require("geoip-lite");

const attachDeviceInfo = async (req, res, next) => {
  try {
    const now = new Date();

    // 1️⃣ Extract IP and Geo Info
    const ip =
      req.headers["x-forwarded-for"]?.split(",").shift() ||
      req.socket?.remoteAddress ||
      null;

    const geo = ip ? geoip.lookup(ip) : null;

    const fingerprint = req.query.fingerprint || null;
    const userAgent = req.headers["user-agent"] || "unknown";
    const platform = req.headers["sec-ch-ua-platform"] || "unknown";

    // 2️⃣ No user session? Log info and exit
    if (!req.user) {
      console.log("ℹ️ No user session, skipping user update but captured:");
      console.log({ ip, geo, userAgent, platform });
      return next();
    }

    const user = req.user;

    // 3️⃣ Ensure Settings Exists
    if (!user.settings) {
      user.settings = {
        theme: "system",
        timezone: geo?.timezone || null,
        ip_address: ip,
        location: {
          country: geo?.country || null,
          region: geo?.region || null,
          city: geo?.city || null,
          timezone: geo?.timezone || null,
        },
        role: "user",
        status: "active",
      };
    } else {
      // Set timezone if not already
      if (!user.settings.timezone && geo?.timezone) {
        user.settings.timezone = geo.timezone;
      }

      // Always set IP & location on login
      user.settings.ip_address = ip;
      user.settings.location = {
        country: geo?.country || null,
        region: geo?.region || null,
        city: geo?.city || null,
        timezone: geo?.timezone || null,
      };
    }

    // 4️⃣ Ensure Analytics
    if (!user.analytics) {
      user.analytics = {
        login_count: 1,
        daily_active_streak: 1,
        last_login_at: now,
        last_active_date: now,
      };
    } else {
      const lastActive = user.analytics.last_active_date
        ? new Date(user.analytics.last_active_date)
        : null;

      const isSameDay = lastActive
        ? moment(lastActive).isSame(now, "day")
        : false;

      const wasYesterday =
        lastActive && moment(lastActive).add(1, "day").isSame(now, "day");

      user.analytics.login_count += 1;
      user.analytics.last_login_at = now;

      if (isSameDay) {
        // no change
      } else if (wasYesterday) {
        user.analytics.daily_active_streak += 1;
      } else {
        user.analytics.daily_active_streak = 1;
      }

      user.analytics.last_active_date = now;
    }

    // 5️⃣ Device Info
    if (fingerprint) {
      const existingDeviceIndex = user.devices.findIndex(
        (d) => d.fingerprint === fingerprint
      );

      if (existingDeviceIndex === -1) {
        user.devices.push({
          fingerprint,
          user_agent: userAgent,
          platform,
          last_used_at: now,
        });
      } else {
        user.devices[existingDeviceIndex].last_used_at = now;
      }
    }

    await user.save();
    next();
  } catch (err) {
    console.error("❌ Error in attachDeviceInfo middleware:", err);
    next();
  }
};

module.exports = attachDeviceInfo;
