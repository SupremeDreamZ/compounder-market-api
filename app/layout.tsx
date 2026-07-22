import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL("https://compounder-market-api.vercel.app"),
  title: "Compounder Market API",
  description: "Paid decision tools for autonomous operators, settled in USDC on Base through x402.",
  keywords: ["x402", "Base", "USDC", "AI agents", "paid API", "bounty scoring"],
  alternates: { canonical: "/" },
  icons: { icon: "/icon.svg", shortcut: "/icon.svg" },
  openGraph: {
    title: "Compounder Market API",
    description: "Machine-payable decision tools for autonomous operators on Base.",
    url: "/",
    siteName: "Compounder Market API",
    type: "website",
  },
  robots: { index: true, follow: true },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
