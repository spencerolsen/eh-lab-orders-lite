// Shown while data loads. role="status" lets a screen reader announce it.
export function Loading({ label = 'Loading…' }: { label?: string }) {
  return (
    <p role="status" className="loading">
      {label}
    </p>
  );
}
