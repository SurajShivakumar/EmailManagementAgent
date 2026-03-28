import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "AI Email Agent",
  description: "InsForge-powered inbox with AI priority and drafts",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="font-sans">{children}</body>
    </html>
  );
}
