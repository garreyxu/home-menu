import type { Metadata } from "next";
import { Ma_Shan_Zheng, Noto_Sans_SC } from "next/font/google";
import "./globals.css";
import "./ink.css";
import { cn } from "@/lib/utils";

const noto = Noto_Sans_SC({
  weight: ["400", "500", "700"],
  subsets: ["latin"],
  display: "swap",
  variable: "--font-sans",
  adjustFontFallback: false,
});

const brush = Ma_Shan_Zheng({
  weight: "400",
  subsets: ["latin"],
  display: "swap",
  preload: false,
  variable: "--font-brush",
  adjustFontFallback: false,
  fallback: ["Noto Sans SC", "sans-serif"],
});

export const metadata: Metadata = {
  title: "家庭菜单",
  description: "家里的菜单，按分类挑菜。",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="zh-CN"
      className={cn("font-sans", noto.variable, brush.variable)}
    >
      <body>{children}</body>
    </html>
  );
}
