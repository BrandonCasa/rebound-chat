import { expressjwt as jwt } from "express-jwt";
import "dotenv/config";

import { getAccessToken, parseCookieHeader } from "../utils/auth.js";

const auth = {
        required: jwt({
                secret: process.env.ACCESS_TOKEN_SECRET,
                algorithms: ["HS256"],
                userProperty: "payload",
                getToken: getAccessToken,
        }),
        optional: jwt({
                secret: process.env.ACCESS_TOKEN_SECRET,
                algorithms: ["HS256"],
                userProperty: "payload",
                credentialsRequired: false,
                getToken: getAccessToken,
        }),
};

export { auth, getAccessToken, parseCookieHeader };
