import type { Metadata } from "next";
import { Noto_Sans_SC } from "next/font/google";
import localFont from "next/font/local";
import "./globals.css";
import "./pixel.css";
import { cn } from "@/lib/utils";

const noto = Noto_Sans_SC({
  weight: ["400", "600"],
  subsets: ["latin"],
  display: "swap",
  variable: "--font-sans",
  adjustFontFallback: false,
});

const pixel = localFont({
  src: "../fonts/fusion-pixel-12px-proportional-zh_hans.woff2",
  weight: "400",
  display: "swap",
  variable: "--font-pixel",
  adjustFontFallback: false,
  fallback: ["sans-serif"],
});

export const metadata: Metadata = {
  title: "家庭菜单",
  description: "家里的菜单，按分类挑菜。",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="zh-CN"
      className={cn("font-sans", noto.variable, pixel.variable)}
    >
      <body>{children}</body>
    </html>
  );
}
