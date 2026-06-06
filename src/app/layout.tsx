import type { Metadata } from "next";
import { Inter, Oxanium } from "next/font/google";

import { Providers } from "@/components/providers";

import "./globals.css";

const inter = Inter({
  variable: "--font-body",
  subsets: ["latin"]
});

const oxanium = Oxanium({
  variable: "--font-display",
  subsets: ["latin"]
});

export const metadata: Metadata = {
  title: "Rift Daily",
  description: "Daily League-inspired item, recipe, Elo, lobby, and trainer challenges."
};

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={`${inter.variable} ${oxanium.variable}`}>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
