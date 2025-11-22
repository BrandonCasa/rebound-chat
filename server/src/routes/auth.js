import { expressjwt as jwt } from "express-jwt";
import "dotenv/config";

const parseCookieHeader = (header = "") => {
        if (!header || typeof header !== "string") return {};
        return Object.fromEntries(
                header.split(";").map((entry) => {
                        const [key, ...rest] = entry.trim().split("=");
                        return [key, rest.join("=")];
                })
        );
};

const getBearerToken = (value) => {
        if (!value || typeof value !== "string") return null;
        const [scheme, token] = value.split(" ");
        if (scheme === "Token" || scheme === "Bearer") return token;
        return null;
};

function getAccessToken(req) {
        if (req?.cookies?.token) return req.cookies.token;

        const cookieHeaderToken = parseCookieHeader(req?.headers?.cookie)?.token;
        if (cookieHeaderToken) return cookieHeaderToken;

        const headerToken = getBearerToken(req?.headers?.authorization);
        if (headerToken) return headerToken;

        return getBearerToken(req?.body?.headers?.authorization);
}

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
