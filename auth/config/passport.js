const passport = require("passport");
const GoogleStrategy = require("passport-google-oauth20").Strategy;
const GitHubStrategy = require("passport-github2").Strategy;
const User = require("../models/User");

// 🔧 Default provider templates
function defaultGoogleProvider() {
  return {
    google_id: null,
    email_verified: null,
    picture: null,
    profile_link: null,
    access_token: null,
    refresh_token: null,
    token_expires_at: null,
  };
}

function defaultGitHubProvider() {
  return {
    github_id: null,
    username: null,
    profile_link: null,
    avatar_url: null,
    access_token: null,
    token_expires_at: null,
  };
}

// 🔧 Common device handler
async function attachDeviceInfo(req, user) {
  const fingerprint = req.query.fingerprint;
  if (!fingerprint) return;

  const userAgent = req.headers["user-agent"] || "unknown";
  const platform = req.headers["sec-ch-ua-platform"] || "unknown";

  const deviceExists = user.devices?.some((d) => d.fingerprint === fingerprint);

  if (!deviceExists) {
    user.devices = user.devices || [];
    user.devices.push({
      fingerprint,
      user_agent: userAgent,
      platform,
      last_used_at: new Date(),
    });
  } else {
    user.devices = user.devices.map((d) =>
      d.fingerprint === fingerprint ? { ...d, last_used_at: new Date() } : d
    );
  }

  await user.save();
}

// ==================
// 🔹 Google Strategy
// ==================
passport.use(
  new GoogleStrategy(
    {
      clientID: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      callbackURL: process.env.GOOGLE_CALLBACK_URL,
      passReqToCallback: true, // needed to access req.query
    },
    async (req, accessToken, refreshToken, profile, done) => {
      try {
        const email = profile.emails[0].value;
        const googleId = profile.id;
        const photo = profile.photos?.[0]?.value;
        const tokenExpiresAt = new Date(Date.now() + 3600 * 1000);

        let user =
          (await User.findOne({ "profile.email": email })) ||
          (req.query.fingerprint &&
            (await User.findOne({
              "devices.fingerprint": req.query.fingerprint,
            })));

        const googleData = {
          google_id: googleId,
          email_verified: profile.emails[0].verified || false,
          picture: photo,
          profile_link:
            profile._json?.profile || `https://profiles.google.com/${googleId}`,
          access_token: accessToken,
          refresh_token: refreshToken,
          token_expires_at: tokenExpiresAt,
        };

        if (!user) {
          user = new User({
            profile: {
              display_name: profile.displayName,
              username: email.split("@")[0],
              email,
              profile_photo_url: photo,
            },
            auth: {
              email,
              login_methods: ["google"],
              providers: {
                google: googleData,
                github: defaultGitHubProvider(),
              },
            },
            devices: [],
          });
        } else {
          user.auth.providers.google = googleData;

          if (!user.auth.login_methods.includes("google")) {
            user.auth.login_methods.push("google");
          }

          if (!user.profile.profile_photo_url && photo) {
            user.profile.profile_photo_url = photo;
          }
        }

        await user.save();
        await attachDeviceInfo(req, user);
        done(null, user);
      } catch (err) {
        done(err, null);
      }
    }
  )
);

// ==================
// 🔹 GitHub Strategy
// ==================
passport.use(
  new GitHubStrategy(
    {
      clientID: process.env.GITHUB_CLIENT_ID,
      clientSecret: process.env.GITHUB_CLIENT_SECRET,
      callbackURL: process.env.GITHUB_CALLBACK_URL,
      passReqToCallback: true,
      scope: ["user:email", "repo"],
    },
    async (req, accessToken, refreshToken, profile, done) => {
      try {
        const githubId = profile.id;
        const email =
          profile.emails?.[0]?.value ||
          `${profile.username}@users.noreply.github.com`;
        const username = profile.username;
        const avatar = profile.photos?.[0]?.value;
        const tokenExpiresAt = new Date(Date.now() + 3600 * 1000);

        let user =
          (await User.findOne({ "profile.email": email })) ||
          (req.query.fingerprint &&
            (await User.findOne({
              "devices.fingerprint": req.query.fingerprint,
            })));

        const githubData = {
          github_id: githubId,
          username,
          profile_link: profile.profileUrl,
          avatar_url: avatar,
          access_token: accessToken,
          token_expires_at: tokenExpiresAt,
        };

        if (!user) {
          user = new User({
            profile: {
              display_name: username,
              username: email.split("@")[0],
              email,
              profile_photo_url: avatar,
            },
            auth: {
              email,
              login_methods: ["github"],
              providers: {
                github: githubData,
                google: defaultGoogleProvider(),
              },
            },
            devices: [],
          });
        } else {
          user.auth.providers.github = githubData;

          if (!user.auth.login_methods.includes("github")) {
            user.auth.login_methods.push("github");
          }

          if (!user.profile.profile_photo_url && avatar) {
            user.profile.profile_photo_url = avatar;
          }
        }

        await user.save();
        await attachDeviceInfo(req, user);
        done(null, user);
      } catch (err) {
        done(err, null);
      }
    }
  )
);

// ========================
// 🔹 Passport Session Logic
// ========================
passport.serializeUser((user, done) => {
  done(null, user._id);
});

passport.deserializeUser(async (id, done) => {
  try {
    const user = await User.findById(id);
    done(null, user);
  } catch (err) {
    done(err, null);
  }
});

module.exports = passport;
