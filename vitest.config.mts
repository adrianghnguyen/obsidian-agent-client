import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

// `obsidian` has no real module outside Obsidian, so alias it to a lightweight
// stub for unit tests. Only the pieces the tested pure functions need (Platform)
// are provided.
export default defineConfig({
	plugins: [
		{
			name: "md-as-text",
			transform(src, id) {
				if (id.endsWith(".md")) {
					return {
						code: `export default ${JSON.stringify(src)};`,
						map: null,
					};
				}
			},
		},
	],
	test: {
		environment: "node",
		include: ["test/**/*.test.ts"],
	},
	resolve: {
		alias: {
			obsidian: fileURLToPath(
				new URL("./test/stubs/obsidian.ts", import.meta.url),
			),
		},
	},
});
