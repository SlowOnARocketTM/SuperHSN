import Link from 'next/link';

export default function NotFound() {
  return (
    <main className="not-found-page">
      <div className="not-found-card">
        <div className="not-found-code">404</div>
        <h1 className="not-found-title">Page not found</h1>
        <p className="not-found-desc">
          This isn&apos;t a live match — it&apos;s a dead link.
        </p>
        <Link href="/" className="not-found-link">
          Back to the feed
        </Link>
      </div>
    </main>
  );
}
