import type { Metadata, Viewport } from "next";
import "./globals.css";

// Next.js 15+ moved `themeColor` (and `colorScheme`, `viewport`) out of `metadata`
// into a dedicated `viewport` export. Keeping it in `metadata` still works but
// emits a build-time warning. This split keeps the build clean.
export const viewport: Viewport = {
  themeColor: "#0a0a0a",
  width: "device-width",
  initialScale: 1,
};

export const metadata: Metadata = {
  metadataBase: new URL("https://app.buildy.sg"),
  title: {
    default: "Buildy — Studio OS",
    template: "%s · Buildy",
  },
  description:
    "Buildy is the Studio OS for design, bidding, and project operations — leads, quotations, contracts, billing, and tender intelligence in one place.",
  applicationName: "Buildy",
  openGraph: {
    title: "Buildy — Studio OS",
    description:
      "Studio OS for design, bidding, and project operations — leads, quotations, contracts, billing, and tender intelligence in one place.",
    url: "https://app.buildy.sg",
    siteName: "Buildy",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Buildy — Studio OS",
    description: "Studio OS for design, bidding, and project operations.",
  },
  robots: {
    // App is gated by auth — keep it out of search indexes.
    index: false,
    follow: false,
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
