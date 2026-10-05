import type { Metadata } from "next";
import "./globals.css";
import Navbar from "@/components/Navbar";
import Providers from "@/components/Providers";

export const metadata: Metadata = {
  title: "Aegis — AI Agent Permission Layer",
  description:
    "User-controlled trust and permission layer for AI agents on Monad. Grant narrow, revocable permissions for data access and actions.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <head>
        <link
          href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="bg-grid">
        <div className="bg-glow" />
        <div className="bg-glow-2" />
        <Providers>
          <Navbar />
          <main>{children}</main>
        </Providers>
      </body>
    </html>
  );
}
