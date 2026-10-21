import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = {
  title: "Oasis · Field Operations",
  description:
    "One workspace for agricultural waste reporting and facilities management.",
  manifest: "/manifest.webmanifest",
};
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
