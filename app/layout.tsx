import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Compounder Market API",
  description: "Paid decision tools for autonomous operators, settled in USDC on Base through x402.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
