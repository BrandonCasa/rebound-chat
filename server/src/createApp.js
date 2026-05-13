import cors from "cors";
import crypto from "crypto";
import express from "express";
import cookieParser from "cookie-parser";
import rateLimit from "express-rate-limit";
import methodOverride from "method-override";
import morgan from "morgan";

import customPassport from "./config/passport.js";
import logger from "./logger.js";
import routes from "./routes/index.js";

import { buildCorsOptions } from "./config/cors.js";
import {
	CSRF_COOKIE_NAME,
	CSRF_COOKIE_OPTIONS,
	CSRF_HEADER_NAME,
	CSRF_PROTECTED_METHODS,
	createCsrfToken,
	isValidCsrfToken,
	setCsrfResponseHeaders,
} from "./utils/csrf.js";

const isLiveRequest = (req) => req.path === "/live" || req.path.startsWith("/live/");

const skipLiveRequest = (middleware) => (req, res, next) => {
	if (isLiveRequest(req)) return next();
	return middleware(req, res, next);
};

const csrfTokenMiddleware = (req, res, next) => {
	if (isLiveRequest(req)) return next();

	let csrfToken = req.cookies?.[CSRF_COOKIE_NAME];

	if (!isValidCsrfToken(csrfToken)) {
		csrfToken = createCsrfToken();
		res.cookie(CSRF_COOKIE_NAME, csrfToken, CSRF_COOKIE_OPTIONS);
	}

	req.csrfToken = csrfToken;
	setCsrfResponseHeaders(res, csrfToken);

	next();
};

const csrfProtectionMiddleware = (req, res, next) => {
	if (isLiveRequest(req)) return next();
	if (!CSRF_PROTECTED_METHODS.has(req.method)) return next();

	const csrfTokenCookie = req.cookies?.[CSRF_COOKIE_NAME];
	const csrfTokenHeader = req.get(CSRF_HEADER_NAME);

	if (!csrfTokenCookie || !csrfTokenHeader) {
		return res.status(403).json({ error: "Missing CSRF token" });
	}

	if (!isValidCsrfToken(csrfTokenCookie) || !isValidCsrfToken(csrfTokenHeader) || csrfTokenCookie.length !== csrfTokenHeader.length) {
		return res.status(403).json({ error: "Invalid CSRF token" });
	}

	const cookieBuffer = Buffer.from(csrfTokenCookie, "hex");
	const headerBuffer = Buffer.from(csrfTokenHeader, "hex");

	if (!crypto.timingSafeEqual(cookieBuffer, headerBuffer)) {
		return res.status(403).json({ error: "Invalid CSRF token" });
	}

	req.csrfToken = csrfTokenCookie;

	next();
};

const csrfTokenEndpoint = (req, res) => {
	res.set("Cache-Control", "no-store");
	return res.json({ csrfToken: req.csrfToken });
};

const createHealthEndpoint =
	({ role, ecsSmokeMode = false }) =>
	(_req, res) =>
		res.json({
			status: "ok",
			role,
			mode: ecsSmokeMode ? "ecs-smoke" : "runtime",
			pid: process.pid,
			uptimeSeconds: Math.round(process.uptime()),
		});

const applyMiddleware = (app) => {
	app.set("trust proxy", 1);

	app.use(cors(buildCorsOptions));
	app.options(/.*/, cors(buildCorsOptions));

	const globalLimiter = rateLimit({
		windowMs: 5 * 60 * 1000,
		max: 5000,
		standardHeaders: true,
		legacyHeaders: false,
		message: { error: "Too many requests, please try again later." },
		skip: (req) => req.path.startsWith("/live/"),
	});

	app.use(globalLimiter);

	if (logger.stream) {
		app.use(morgan("combined", { stream: logger.stream }));
	}

	// CSRF protection is provided by csrfProtectionMiddleware below (double-submit cookie + timingSafeEqual).
	// codeql[js/missing-token-validation] no-unused-vars
	app.use(cookieParser());
	app.use(skipLiveRequest(express.urlencoded({ extended: false })));
	app.use(skipLiveRequest(express.json()));

	// Apply method override before CSRF checks so overridden methods are protected correctly.
	app.use(methodOverride());

	app.use(csrfTokenMiddleware);
	app.use(csrfProtectionMiddleware);
};

const createApp = ({ role = "combined", routeHandler = routes, ecsSmokeMode = false } = {}) => {
	const app = express();

	customPassport.setupPassport();
	applyMiddleware(app);

	app.get("/healthz", createHealthEndpoint({ role, ecsSmokeMode }));
	app.get("/api/csrf", csrfTokenEndpoint);
	app.use(routeHandler);

	return app;
};

export { createApp };
export default createApp;
