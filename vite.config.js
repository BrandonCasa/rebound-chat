import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";

export default defineConfig(({ mode }) => ({
	base: "./",
	resolve: {
		alias: {
			slices: path.resolve(__dirname, "./src/slices"),
                        ...(process.env.VITEST
                                ? {
                                                "@mui/icons-material": path.resolve(__dirname, "./src/muiIconsStub.js"),
                                                "@mui/icons-material/*": path.resolve(__dirname, "./src/muiIconsStub.js"),
                                        }
                                : {}),
		},
	},
	plugins: [react()],
	define: {
		"process.env.NODE_ENV": JSON.stringify(mode),
	},
	publicDir: "public",
	build: {
		outDir: "build",
	},
	server: {
		port: 3000,
	},
	test: {
		include: ["**/*.test.{js,jsx,ts,tsx}"],
		environment: "jsdom",
		setupFiles: "./src/setupTests.js",
	},
}));
