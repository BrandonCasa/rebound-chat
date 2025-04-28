import passport from "passport";
import { Strategy as LocalStrategy } from "passport-local";
import { Strategy as GoogleStrategy } from "passport-google-oauth20";
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
			),
			new GoogleStrategy(
				{
					clientID: GOOGLE_CLIENT_ID,
					clientSecret: GOOGLE_CLIENT_SECRET,
					callbackURL: "http://www.example.com/auth/google/callback",
				},
				function (accessToken, refreshToken, profile, cb) {
					User.findOrCreate({ googleId: profile.id }, function (err, user) {
						return cb(err, user);
					});
				}
			)
		);
	}
}

const customPassport = new CustomPassport();

export { customPassport as default };
