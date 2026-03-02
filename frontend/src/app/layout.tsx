import type { Metadata } from "next";
import { Space_Grotesk, Fraunces } from "next/font/google";
import { AuthProvider } from "@/components/auth-provider";
import "./globals.css";

const sans = Space_Grotesk({
  subsets: ["latin"],
  variable: "--font-sans"
});

const serif = Fraunces({
  subsets: ["latin"],
  variable: "--font-serif"
});

export const metadata: Metadata = {
  title: "Navix",
  description: "Stateful trip planning with conversational AI and deterministic itinerary management."
};

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={`${sans.variable} ${serif.variable}`}>
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  );
}
