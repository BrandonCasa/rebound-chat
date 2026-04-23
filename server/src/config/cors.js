const DEFAULT_ALLOWED_ORIGINS = ["http://localhost:3000", "http://localhost:3001", "https://localhost:3000", "http://localhost:3000", "http://127.0.0.1:3001", "https://127.0.0.1:3000", "https://127.0.0.1:3001", "https://rebound.nexus", "app://-"];

const parseEnvOrigins = () =>
	process.env.ALLOWED_ORIGINS?.split(",")
		.map((origin) => origin.trim())
		.filter(Boolean) ?? [];

const resolveAllowedOrigins = () => {
	const envOrigins = parseEnvOrigins();
	return envOrigins.length ? envOrigins : DEFAULT_ALLOWED_ORIGINS;
};

const getRequestPath = (req) => req?.originalUrl || req?.path || "";
const isLivePath = (req) => {
  const path = getRequestPath(req);
  return path.startsWith("/live") || path.startsWith("/live/") || path.startsWith("/api/live") || path.startsWith("/api/live/");
};

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
