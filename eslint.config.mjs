import nextCoreWebVitals from "eslint-config-next/core-web-vitals";
import nextTypescript from "eslint-config-next/typescript";

const eslintConfig = [
	{
		ignores: [
			".next/**",
			".next-node/**",
			".vinext/**",
			".wrangler/**",
			"node_modules/**",
			"drizzle/**",
			"dist/**",
			"data/**",
			"deploy/**/node_modules/**",
			"cloudflare-env.d.ts",
			"next-env.d.ts",
		],
	},
	...nextCoreWebVitals,
	...nextTypescript,
	{
		rules: {
			// Manually managed DNS and the always-on entitlement layer keep the
			// signature of the functions they replace, so some parameters exist only
			// to preserve call sites and are marked with a leading underscore.
			"@typescript-eslint/no-unused-vars": [
				"warn",
				{ argsIgnorePattern: "^_", varsIgnorePattern: "^_", caughtErrorsIgnorePattern: "^_" },
			],
		},
	},
];

export default eslintConfig;
