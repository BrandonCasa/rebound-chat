import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";

export default defineConfig(({ mode }) => ({
	base: "./",
	resolve: {
		alias: {
			slices: path.resolve(__dirname, "./src/slices"),
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
		...(mode === "development" && {
			proxy: {
				"/api": {
					target: "http://localhost:6001",
					changeOrigin: true,
				},
			},
		}),
	},
}));
