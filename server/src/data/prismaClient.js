let prismaClient = null;

const assertDatabaseUrl = (env = process.env) => {
	if (!env.DATABASE_URL) {
		throw new Error("DATABASE_URL is required when Prisma-backed repositories are enabled.");
	}
};

const getPrismaClient = async ({ env = process.env, clientOptions = {} } = {}) => {
	assertDatabaseUrl(env);

	if (!prismaClient) {
		const { PrismaClient } = await import("@prisma/client");
		prismaClient = new PrismaClient(clientOptions);
	}

	return prismaClient;
};

const disconnectPrismaClient = async () => {
	if (!prismaClient) return;

	await prismaClient.$disconnect();
	prismaClient = null;
};

export { assertDatabaseUrl, disconnectPrismaClient, getPrismaClient };
