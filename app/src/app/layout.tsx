import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";

export const metadata: Metadata = {
  title: "견적서 검토 | 한빛산업 구매팀",
  description: "협력사 견적서 PDF에서 추출한 데이터를 검토·확정하고 ERP 입력용으로 내보내는 화면",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="ko" className="h-full antialiased">
      <body className="min-h-full flex flex-col">
        <header className="bg-white border-b border-gray-200">
          <div className="max-w-screen-2xl mx-auto px-5 h-12 flex items-center gap-6">
            <Link href="/" className="font-semibold text-gray-900">견적서 검토</Link>
            <nav className="flex gap-4 text-sm text-gray-600">
              <Link href="/" className="hover:text-gray-900">목록</Link>
              <Link href="/stats" className="hover:text-gray-900">검토 통계</Link>
            </nav>
            <span className="ml-auto text-xs text-gray-400">한빛산업 구매팀 · 프로토타입</span>
          </div>
        </header>
        <main className="flex-1">{children}</main>
      </body>
    </html>
  );
}
