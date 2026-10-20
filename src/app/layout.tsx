import type { Metadata } from "next";
import { Montserrat, Source_Sans_3 } from "next/font/google";
import "./globals.css";

// The same pairing as the RZS livestat site; latin-ext for č, š, ž in team names.
const montserrat = Montserrat({
  variable: "--font-montserrat",
  subsets: ["latin", "latin-ext"],
  weight: ["600", "700", "800"],
});

const sourceSans = Source_Sans_3({
  variable: "--font-source-sans",
  subsets: ["latin", "latin-ext"],
});

export const metadata: Metadata = {
  title: "Rokomet stats",
  description: "Chat about Slovenian handball statistics",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="sl" className={`${montserrat.variable} ${sourceSans.variable} h-full antialiased`}>
      <body className="h-full">{children}</body>
    </html>
  );
}
