import type { AppProps } from "next/app";
import { Noto_Sans_Thai, Inter } from "next/font/google";
import { Toaster } from "@/components/ui/sonner";
import "@/styles/globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
});

const notoSansThai = Noto_Sans_Thai({
  subsets: ["thai"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-thai",
});

export default function App({ Component, pageProps }: AppProps) {
  return (
    <main className={`${inter.variable} ${notoSansThai.variable} font-sans`}>
      <Component {...pageProps} />
      <Toaster richColors position="bottom-center" />
    </main>
  );
}
