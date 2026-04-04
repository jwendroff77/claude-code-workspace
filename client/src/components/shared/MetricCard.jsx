import clsx from 'clsx';

export default function MetricCard({ label, value, sub, accent, className }) {
  return (
    <div
      className={clsx(
        'rounded-xl border border-border bg-bg-secondary p-5',
        className
      )}
    >
      <p className="text-xs font-medium uppercase tracking-wider text-txt-tertiary">{label}</p>
      <p
        className={clsx(
          'mt-1 font-display text-3xl font-bold',
          accent ? 'text-accent' : 'text-txt-primary'
        )}
      >
        {value}
      </p>
      {sub && <p className="mt-1 text-xs text-txt-secondary">{sub}</p>}
    </div>
  );
}
