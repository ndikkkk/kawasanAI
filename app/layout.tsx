import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Ruang AI",
  description: "Chat AI pribadi dengan dukungan lampiran file.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="id">
      <body>{children}</body>
    </html>
  );
}