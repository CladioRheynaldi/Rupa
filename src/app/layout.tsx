import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = {
  title: "Rupa — Pakaian pilihanmu. Sentuhan khasmu.",
  description:
    "Studio kustomisasi pakaian untuk pelanggan, UMKM, dan penjahit. Prototipe Jabodetabek.",
};
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="id">
      <body>{children}</body>
    </html>
  );
}
