let uploadAgent = undefined;

try {
	const { Agent } = await import("undici");
	uploadAgent = new Agent({
		keepAliveTimeout: 30_000,
		keepAliveMaxTimeout: 60_000,
		pipelining: 1,
		connections: 4,
	});
} catch (_err) {
	uploadAgent = undefined;
}

export { uploadAgent };
