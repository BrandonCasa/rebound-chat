const DEFAULT_ALLOWED_ORIGINS = ["http://localhost:3000", "https://rebound.nexus", "app://-"];

const parseEnvOrigins = () =>
	process.env.ALLOWED_ORIGINS?.split(",")
		.map((origin) => origin.trim())
		.filter(Boolean) ?? [];

const resolveAllowedOrigins = () => {
	const envOrigins = parseEnvOrigins();
	return envOrigins.length ? envOrigins : DEFAULT_ALLOWED_ORIGINS;
};

const isOriginAllowed = (origin) => !origin || resolveAllowedOrigins().includes(origin);

const originDelegate = (origin, callback) => {
	if (isOriginAllowed(origin)) {
		return callback(null, true);
	}

	return callback(new Error("Not allowed by CORS"));
};

const corsOptions = {
	origin: originDelegate,
	credentials: true,
	optionsSuccessStatus: 200,
	allowedHeaders: ["Content-Type", "Authorization", "X-Csrf-Token"],
};

export { corsOptions, originDelegate, resolveAllowedOrigins };
