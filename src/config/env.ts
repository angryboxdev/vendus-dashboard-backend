import dotenv from "dotenv";
dotenv.config();

function must<T>(value: T | undefined | null, name: string): T {
  if (value === undefined || value === null || value === "") {
    throw new Error(`Missing env var: ${name}`);
  }
  return value as T;
}

export const ENV = {
  BASE_URL: must(process.env.VENDUS_BASE_URL, "VENDUS_BASE_URL"),
  API_KEY: must(process.env.VENDUS_API_KEY, "VENDUS_API_KEY"),
  PORT: Number(process.env.PORT || 3333),

  PER_PAGE_DEFAULT: Number(process.env.VENDUS_PER_PAGE || 50),
  CONCURRENCY: Number(process.env.VENDUS_CONCURRENCY || 6),

  SUPABASE_URL: process.env.SUPABASE_URL ?? "",
  SUPABASE_ANON_KEY: process.env.SUPABASE_ANON_KEY ?? "",
};
