// .eslintrc.js
module.exports = {
	root: true,

	parser: "@babel/eslint-parser",
	parserOptions: {
		requireConfigFile: false,
		babelOptions: {
			presets: ["@babel/preset-react", "@babel/preset-env"],
		},
		ecmaVersion: 2020,
		sourceType: "module",
		ecmaFeatures: {
			jsx: true,
		},
	},

	env: {
		browser: true,
		node: true,
		es6: true,
	},

	settings: {
		react: {
			version: "detect",
		},
	},

	plugins: ["react", "react-hooks", "jsx-a11y", "unused-imports", "import", "prettier"],

	extends: [
		"eslint:recommended", // core rules
		"plugin:react/recommended", // React best practices
		"plugin:react-hooks/recommended", // Hooks rules
		"plugin:jsx-a11y/recommended", // accessibility
		"plugin:import/errors", // import validation
		"plugin:import/warnings",
		"plugin:import/order", // import sorting
		"plugin:prettier/recommended", // Prettier integration
	],

	rules: {
		// treat Prettier issues as errors
		"prettier/prettier": "error",

		// React-specific tweaks
		"react/react-in-jsx-scope": "off", // not needed with new JSX transform
		"react/prop-types": "off", // if you prefer TS or no propTypes

		// Hooks
		"react-hooks/rules-of-hooks": "error",
		"react-hooks/exhaustive-deps": "warn",

		// unused imports/vars
		"unused-imports/no-unused-imports": "error",
		"unused-imports/no-unused-vars": [
			"warn",
			{
				vars: "all",
				varsIgnorePattern: "^_",
				args: "after-used",
				argsIgnorePattern: "^_",
			},
		],

		// import ordering & grouping
		"import/order": [
			"warn",
			{
				groups: ["builtin", "external", "internal", ["sibling", "parent"], "index"],
				"newlines-between": "always",
				alphabetize: { order: "asc", caseInsensitive: true },
			},
		],

		// a11y tweak: only warn about bad anchors
		"jsx-a11y/anchor-is-valid": [
			"warn",
			{
				aspects: ["noHref", "invalidHref", "preferButton"],
			},
		],
	},

	overrides: [
		{
			// for Jest test files
			files: ["**/*.test.js", "**/*.spec.js", "**/*.test.jsx", "**/*.spec.jsx"],
			env: { jest: true },
			plugins: ["jest"],
			extends: ["plugin:jest/recommended"],
			rules: {
				"jest/no-done-callback": "warn",
				"jest/expect-expect": "warn",
			},
		},
		{
			// node scripts / config
			files: ["*.config.js", "*.config.cjs", "scripts/**/*.js"],
			env: { node: true, browser: false },
		},
	],
};
