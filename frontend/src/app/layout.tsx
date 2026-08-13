import type { Metadata } from "next";
import type { ReactNode } from "react";
import Providers from "@/components/providers";
import "./globals.css";

export const metadata: Metadata = {
  title: "globe",
  description:
    "Prepare, validate and correct GloBE Information Returns against the OECD Pillar Two schema and the errata that supersedes it.",
};

const RootLayout = ({ children }: { children: ReactNode }) => (
  <html lang="en">
    <body className="min-h-dvh antialiased">
      <Providers>{children}</Providers>
    </body>
  </html>
);

export default RootLayout;
