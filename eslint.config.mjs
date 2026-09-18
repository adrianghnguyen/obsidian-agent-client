import tsparser from "@typescript-eslint/parser";
import globals from "globals";
import { defineConfig } from "eslint/config";
import obsidianmd from "eslint-plugin-obsidianmd";
import tseslint from "typescript-eslint";

export default defineConfig([
	{
		ignores: ["node_modules/", "main.js", "docs/"],
	},
	...obsidianmd.configs.recommended,
	...tseslint.configs.recommended,
	{
		files: ["**/*.ts", "**/*.tsx"],
		languageOptions: {
			parser: tsparser,
			parserOptions: { project: "./tsconfig.eslint.json" },
		},
		rules: {
			// Preserve existing rules
			"@typescript-eslint/no-unused-vars": ["error", { args: "none" }],
			"@typescript-eslint/ban-ts-comment": "off",
			"@typescript-eslint/no-empty-function": "off",
			// Brand/agent names routinely trip this and the PR template already
			// treats those hits as acceptable — keep them visible, don't fail.
			"obsidianmd/ui/sentence-case": "warn",
		},
	},
	{
		files: ["test/**/*.ts", "test/**/*.tsx"],
		rules: {
			// Vitest mocks/spies pass methods to expect() — unbound-method is noise here.
			"@typescript-eslint/unbound-method": "off",
		},
	},
	{
		files: [
			"src/voice-input/**/*.ts",
			"test/voice-input/**/*.ts",
		],
		rules: {
			// ScriptProcessorNode path until AudioWorklet migration; tests mirror production API.
			"@typescript-eslint/no-deprecated": "off",
		},
	},
	{
		files: ["scripts/**/*.mjs"],
		languageOptions: {
			globals: globals.node,
		},
	},
]);
