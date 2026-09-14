import tseslint from "typescript-eslint";

export default tseslint.config(
  { ignores: ["dist", "prisma"] },
  ...tseslint.configs.recommended,
);
