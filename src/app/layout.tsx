import type { Metadata } from "next";
import { Geist, Geist_Mono, Amiri, Aref_Ruqaa } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const amiri = Amiri({
  variable: "--font-amiri",
  subsets: ["latin", "arabic"],
  weight: ["400", "700"],
});

const arefRuqaa = Aref_Ruqaa({
  variable: "--font-aref-ruqaa",
  subsets: ["latin", "arabic"],
  weight: ["400", "700"],
});

export const metadata: Metadata = {
  title: "Eid Mubarak",
  description: "Eid Mubarak - A beautiful night scene celebration",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} ${amiri.variable} ${arefRuqaa.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
