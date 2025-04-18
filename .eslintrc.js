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
    "import/resolver": {
      node: {
        moduleDirectory: ["node_modules"],
        extensions: [".js", ".jsx", ".ts", ".tsx", ".json"],
      },
    },
    react: { version: "detect" },
  },

  plugins: [
    "react",
    "react-hooks",
    "jsx-a11y",
    "unused-imports",
    "import",
    "prettier",
  ],

  extends: [
    "eslint:recommended",
    "plugin:react/recommended",
    "plugin:react-hooks/recommended",
    "plugin:jsx-a11y/recommended",

    "plugin:import/errors",
    "plugin:import/warnings",

    "plugin:prettier/recommended",
  ],

  rules: {
    "linebreak-style": ["error", "unix"],
    "no-unused-vars": "off",
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
        vars: "all", // check all variables
        varsIgnorePattern: "^_", // but allow names starting with _
        args: "after-used", // only flag unused function args
        argsIgnorePattern: "^_",
      },
    ],

    // import ordering & grouping
    "import/order": [
      "warn",
      {
        "newlines-between": "always-and-inside-groups",
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
      files: ["src/**/*.{js,jsx,ts,tsx}"],
      settings: {
        "import/resolver": {
          node: {
            moduleDirectory: ["node_modules", "src"],
            extensions: [".js", ".jsx", ".ts", ".tsx", ".json"],
          },
        },
      },
    },
    {
      files: ["server/**/*.{js,ts}"],
      env: { node: true, browser: false },
    },
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
