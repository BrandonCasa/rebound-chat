import passport from "passport";
import { Strategy as LocalStrategy } from "passport-local";
import { Strategy as GoogleStrategy } from "passport-google-oauth20";
import crypto from "crypto";
import UserModel from "../models/User.js";

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
                        );
                passport.use(
                        new GoogleStrategy(
                                {
                                        clientID: process.env.GOOGLE_CLIENT_ID,
                                        clientSecret: process.env.GOOGLE_CLIENT_SECRET,
                                        callbackURL: "/api/users/google/callback",
                                },
                                async function (accessToken, refreshToken, profile, cb) {
                                        try {
                                                let user = await UserModel.findOne({ googleId: profile.id });
                                                if (!user) {
                                                        const email = profile.emails?.[0]?.value;
                                                        if (email) {
                                                                user = await UserModel.findOne({ email });
                                                        }
                                                        if (!user) {
                                                                let base = profile.displayName
                                                                        ? profile.displayName.replace(/[^a-zA-Z0-9]/g, "").toLowerCase()
                                                                        : "user";
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
                                                                });
                                                                const randPass = crypto.randomBytes(16).toString("hex");
                                                                user.setPassword(randPass);
                                                                await user.save();
                                                        } else if (!user.googleId) {
                                                                user.googleId = profile.id;
                                                                await user.save();
                                                        }
                                                }
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
