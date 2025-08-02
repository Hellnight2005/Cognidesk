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

// ======================
// 🔹 Google Strategy
// ======================
passport.use(
  new GoogleStrategy(
    {
      clientID: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      callbackURL: process.env.GOOGLE_CALLBACK_URL,
      passReqToCallback: true,
    },
    async (req, accessToken, refreshToken, profile, done) => {
      try {
        const email = profile.emails[0].value;
        const googleId = profile.id;
        const photo = profile.photos?.[0]?.value || null;
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
          profile_link: `https://profiles.google.com/${googleId}`,
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
        return done(null, user);
      } catch (err) {
        return done(err, null);
      }
    }
  )
);

// ======================
// 🔹 GitHub Strategy
// ======================
passport.use(
  new GitHubStrategy(
    {
      clientID: process.env.GITHUB_CLIENT_ID,
      clientSecret: process.env.GITHUB_CLIENT_SECRET,
      callbackURL: process.env.GITHUB_CALLBACK_URL,
      passReqToCallback: true,
      scope: ["user:email", "repo", "delete_repo"],
    },
    async (req, accessToken, refreshToken, profile, done) => {
      try {
        const githubId = profile.id;
        const email =
          profile.emails?.[0]?.value ||
          `${profile.username}@users.noreply.github.com`;
        const username = profile.username;
        const avatar = profile.photos?.[0]?.value || null;
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
        return done(null, user);
      } catch (err) {
        return done(err, null);
      }
    }
  )
);

// ============================
// 🔐 Passport Session Logic
// ============================

// Custom session payload (for cookie use)
passport.serializeUser((user, done) => {
  done(null, {
    id: user._id,
    username: user.profile.username,
    display_name: user.profile.display_name,
    profile_photo_url: user.profile.profile_photo_url,
    provider: user.auth.providers,
  });
});

passport.deserializeUser(async (sessionData, done) => {
  try {
    const user = await User.findById(sessionData.id);
    done(null, user);
  } catch (err) {
    done(err, null);
  }
});

module.exports = passport;
