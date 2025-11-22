import jwt from "jsonwebtoken";

import UserModel from "../models/User.js";

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

const getAccessToken = (req) => {
        if (req?.cookies?.token) return req.cookies.token;

        const cookieHeaderToken = parseCookieHeader(req?.headers?.cookie)?.token;
        if (cookieHeaderToken) return cookieHeaderToken;

        const headerToken = getBearerToken(req?.headers?.authorization);
        if (headerToken) return headerToken;

        return getBearerToken(req?.body?.headers?.authorization);
};

const buildAuthError = (message, status = 401) => {
        const err = new Error(message);
        err.status = status;
        return err;
};

const validateAccessToken = async (token) => {
        if (!token) throw buildAuthError("Missing access token.");

        let decoded;
        try {
                decoded = jwt.verify(token, process.env.ACCESS_TOKEN_SECRET);
        } catch (err) {
                throw buildAuthError("Invalid access token.");
        }

        const user = await UserModel.findById(decoded.id);
        if (!user || !user.active) {
                throw buildAuthError("Invalid or deactivated account.");
        }

        if (decoded.tokenVersion !== user.tokenVersion) {
                throw buildAuthError("Token no longer valid.");
        }

        if (user.passwordChangedAt && decoded.iat * 1000 < user.passwordChangedAt.getTime()) {
                throw buildAuthError("Token issued before password change.");
        }

        return { user, decoded };
};

const validateAccessTokenFromRequest = async (req) => {
        const token = getAccessToken(req);
        const result = await validateAccessToken(token);
        return { ...result, token };
};

const handleAuthFailure = (err, res, context, logger) => {
        if (logger?.error && context) {
                logger.error(`${context}: ${err.message}`);
        }
        return res.status(err.status || 401).json({ error: err.message });
};

const createAuthContextMiddleware = (context, logger) => {
        return async (req, res, next) => {
                try {
                        req.authContext = await validateAccessTokenFromRequest(req);
                        return next();
                } catch (err) {
                        return handleAuthFailure(err, res, context, logger);
                }
        };
};

export {
        buildAuthError,
        getAccessToken,
        getBearerToken,
        handleAuthFailure,
        createAuthContextMiddleware,
        parseCookieHeader,
        validateAccessToken,
        validateAccessTokenFromRequest,
};
