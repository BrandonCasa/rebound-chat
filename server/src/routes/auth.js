import { expressjwt as jwt } from "express-jwt";
import "dotenv/config";

function getTokenFromHeader(req) {
  if (
    (req.headers.authorization && req.headers.authorization.split(" ")[0] === "Token") ||
    (req.headers.authorization && req.headers.authorization.split(" ")[0] === "Bearer")
  ) {
    return req.headers.authorization.split(" ")[1];
  }

  return null;
}

const auth = {
  required: jwt({
    secret: process.env.SECRET,
    algorithms: ["HS256"],
    userProperty: "payload",
    getToken: getTokenFromHeader,
  }),
  optional: jwt({
    secret: process.env.SECRET,
    algorithms: ["HS256"],
    userProperty: "payload",
    credentialsRequired: false,
    getToken: getTokenFromHeader,
  }),
};

export { auth, getTokenFromHeader };
