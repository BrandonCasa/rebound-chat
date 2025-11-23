import jwt from "jsonwebtoken";
import net from "node:net";
import UAParser from "ua-parser-js";

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

const hasPasswordChangedAfterTokenIssue = (user, decoded) => {
        const passwordChangedAt =
                user?.passwordChangedAt instanceof Date ? user.passwordChangedAt.getTime() : null;
        const issuedAtMs = decoded?.iat ? decoded.iat * 1000 : null;

        if (!passwordChangedAt || !issuedAtMs) return false;

        // Allow a small grace window to avoid race conditions during initial account creation/login
        return issuedAtMs + 1000 < passwordChangedAt;
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

        if (hasPasswordChangedAfterTokenIssue(user, decoded)) {
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

const sanitizeIpAddress = (value) => {
        const trimmed = typeof value === "string" ? value.trim() : "";
        if (!trimmed) return null;

        const isLoopback = trimmed === "::1";
        const isValid = net.isIP(trimmed) !== 0;

        return !isLoopback && isValid ? trimmed : null;
};

const parseUserAgentDetails = (userAgentRaw) => {
        const parser = new UAParser(userAgentRaw);

        const browser = parser.getBrowser();
        const os = parser.getOS();
        const device = parser.getDevice();

        const browserName = browser?.name || "Unknown browser";
        const browserVersion = browser?.version ? browser.version.split(".")[0] : null;
        const osName = os?.name || "Unknown OS";
        const osVersion = os?.version ? ` ${os.version}` : "";

        const userAgentParsed = `${browserName}${browserVersion ? ` ${browserVersion}` : ""} on ${osName}${osVersion}`.trim();

        const deviceType = device?.type;
        const userAgentDeviceType = deviceType === "mobile" || deviceType === "tablet" ? "mobile" : "desktop";

        const deviceName =
                device?.model || device?.vendor
                        ? [device?.vendor, device?.model].filter(Boolean).join(" ")
                        : osName;

        return { userAgentParsed, userAgentDeviceType, deviceName };
};

const buildRequestTokenDescriptor = (req) => {
        const connectionAddress = req?.socket?.remoteAddress || req?.connection?.remoteAddress;
        const forwardedIps = Array.isArray(req?.ips) && req.ips.length ? req.ips : [];
        const rawIp = forwardedIps[0] || connectionAddress || req?.ip;
        const ipAddress = sanitizeIpAddress(rawIp);

        const userAgentRaw = req?.get?.("user-agent") || "Unknown";
        const { userAgentParsed, userAgentDeviceType, deviceName } = parseUserAgentDetails(userAgentRaw);

        return {
                userAgent: userAgentRaw,
                userAgentParsed,
                userAgentDeviceType,
                deviceName,
                ipAddress: ipAddress || "Unknown",
                location: ipAddress || "Unknown",
        };
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
        buildRequestTokenDescriptor,
        hasPasswordChangedAfterTokenIssue,
        sanitizeIpAddress,
        parseUserAgentDetails,
};
