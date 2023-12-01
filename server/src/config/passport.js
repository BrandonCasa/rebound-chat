import UserModel from "../models/User.js";
import passport from "passport";
import { Strategy as LocalStrategy } from "passport-local";
import { Strategy as AnonymousStrategy } from "passport-anonymous";

class CustomPassport {
  setupPassport() {
    passport.use(
      new LocalStrategy(
        {
          usernameField: "user[email]",
          passwordField: "user[password]",
        },
        function (email, password, done) {
          UserModel.findOne({ email: email })
            .then(function (user) {
              if (!user || !user.validPassword(password)) {
                return done(null, false, { errors: { "email or password": "is invalid." } });
              }

              return done(null, user);
            })
            .catch(done);
        }
      )
    );
    passport.use(
      new AnonymousStrategy(function authenticate() {
        console.log("lol");
      })
    );
  }
}

const customPassport = new CustomPassport();

export { customPassport as default };
