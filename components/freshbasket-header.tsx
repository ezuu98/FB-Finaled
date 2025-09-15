import Link from "next/link";

export default function FreshBasketHeader() {
  return (
    <header className="sticky top-0 z-20 border-b border-gray-200 bg-white/80 backdrop-blur">
      <div className="mx-auto flex h-14 w-full max-w-6xl items-center justify-between px-4 sm:px-6">
        <Link href="/" className="inline-flex items-center gap-2">
          <span className="inline-flex h-6 w-6 items-center justify-center rounded-sm bg-gray-900 text-white">■</span>
          <span className="text-base font-semibold tracking-tight">FreshBasket</span>
        </Link>
        <div className="flex items-center gap-3">
          <span className="h-2.5 w-2.5 rounded-full bg-gray-300" aria-hidden="true" />
        </div>
      </div>
    </header>
  );
}
