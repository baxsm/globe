import type { NextConfig } from "next";

const config: NextConfig = {
  typedRoutes: true,
  reactStrictMode: true,
  // `next dev` otherwise writes AGENTS.md and CLAUDE.md into this folder on every run.
  // They are generated tooling notes, not source, and they reappear after deletion.
  agentRules: false,
};

export default config;
