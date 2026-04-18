const DEFAULT_ALLOWED_ORIGINS = ["http://localhost:3000", "https://rebound.nexus", "app://-"];

const parseEnvOrigins = () =>
	process.env.ALLOWED_ORIGINS?.split(",")
		.map((origin) => origin.trim())
		.filter(Boolean) ?? [];

const resolveAllowedOrigins = () => {
	const envOrigins = parseEnvOrigins();
	return envOrigins.length ? envOrigins : DEFAULT_ALLOWED_ORIGINS;
};

const isLivePath = (path = "") => path === "/live" || path.startsWith("/live/");

const isOriginAllowed = (origin, req) => {
	if (!origin) return true;
	if (isLivePath(req?.path)) return true;
	return resolveAllowedOrigins().includes(origin);
};

const originDelegate = (origin, callback, req) => {
	if (isOriginAllowed(origin, req)) {
		return callback(null, true);
	}

	return callback(new Error("Not allowed by CORS"));
};

const buildCorsOptions = (req, callback) => {
	originDelegate(
		req.get("origin"),
		(err, allowedOrigin) => {
			if (err) return callback(err);

			return callback(null, {
				origin: allowedOrigin,
				credentials: !isLivePath(req.path),
				optionsSuccessStatus: 200,
				allowedHeaders: ["Content-Type", "Authorization", "X-Csrf-Token", "X-Live-Ingest-Secret"],
			});
		},
		req
	);
};

export { buildCorsOptions, originDelegate, resolveAllowedOrigins };
