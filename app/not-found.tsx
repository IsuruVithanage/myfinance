import Link from "next/link";

export default function NotFound() {
  return (
    <main className="grid min-h-dvh place-items-center px-6 text-center">
      <div>
        <h1 className="title">Not found</h1>
        <p className="muted mt-2 text-sm">
          That page, account or transaction doesn&apos;t exist.
        </p>
        <Link href="/" className="btn btn-primary mt-6 inline-flex">
          Back to home
        </Link>
      </div>
    </main>
  );
}
