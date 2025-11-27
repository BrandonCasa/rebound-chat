import passport from "passport";
import { Strategy as LocalStrategy } from "passport-local";
import { Strategy as GoogleStrategy } from "passport-google-oauth20";
import crypto from "crypto";
import UserModel from "../models/User.js";
import { resolveGoogleCallbackUrl } from "../utils/auth.js";
import logger from "../logger.js";

class CustomPassport {
	setupPassport() {
		passport.use(
			new LocalStrategy(
				{
					usernameField: "user[email]",
					passwordField: "user[password]",
					passReqToCallback: true,
				},
				function (req, email, password, done) {
					UserModel.findOne({ email: email })
						.then(function (user) {
							if (!user || !user.validPassword(password)) {
								return done(null, false, {
									errors: { "email or password": "is invalid." },
								});
							}

							return done(null, user);
						})
						.catch(done);
				}
			)
		);
		const callbackURL = resolveGoogleCallbackUrl();

		const hasGoogleConfig = process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET && process.env.NODE_ENV !== "test";
		if (!hasGoogleConfig) {
			logger.info("Google OAuth strategy disabled: missing credentials or running in test mode.");
			return;
		}

		passport.use(
			new GoogleStrategy(
				{
					clientID: process.env.GOOGLE_CLIENT_ID,
					clientSecret: process.env.GOOGLE_CLIENT_SECRET,
					callbackURL,
				},
				async function (accessToken, refreshToken, profile, cb) {
					try {
						let user = await UserModel.findOne({ googleId: profile.id });
						if (user) return cb(null, user);

						let email = profile.emails.filter((emailEl) => emailEl.verified)[0];
						if (!email) throw new Error("Email not verified, or absent.");
						email = email.value;

						user = await UserModel.findOne({ email });
						if (user) {
							user.googleId = profile.id;
							await user.save();
							return cb(null, user);
						}

						let base = profile.displayName ? profile.displayName.replace(/[^a-zA-Z0-9]/g, "").toLowerCase() : "user";
						if (base === "") base = "user";
						let username = base;
						let count = 0;
						while (await UserModel.findOne({ username })) {
							count++;
							username = `${base}${count}`;
						}

						user = new UserModel({
							username,
							email,
							displayName: profile.displayName || username,
							googleId: profile.id,
							avatarUrl: profile?.photos?.[0]?.value || "",
						});
						const randPass = crypto.randomBytes(16).toString("hex");
						user.setPassword(randPass);
						await user.save();
						return cb(null, user);
					} catch (err) {
						return cb(err);
					}
				}
			)
		);
	}
}

const customPassport = new CustomPassport();

export { customPassport as default };
