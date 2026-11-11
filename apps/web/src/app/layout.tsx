import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = {
  title: "StepMark · 个人成长实验室",
  description: "基于证据的能力测量、行为训练与习惯自动化研究平台"
};
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="zh-CN"><body>{children}</body></html>;
}
