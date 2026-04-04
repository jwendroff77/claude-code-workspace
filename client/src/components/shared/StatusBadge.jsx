import clsx from 'clsx';

const styles = {
  active: 'bg-success/10 text-success',
  paused: 'bg-warning/10 text-warning',
  attention: 'bg-danger/10 text-danger',
  draft: 'bg-bg-tertiary text-txt-tertiary',
};

export default function StatusBadge({ status }) {
  return (
    <span
      className={clsx(
        'inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium',
        styles[status] || styles.draft
      )}
    >
      <span
        className={clsx(
          'h-1.5 w-1.5 rounded-full',
          status === 'active' && 'bg-success animate-pulse',
          status === 'paused' && 'bg-warning',
          status === 'attention' && 'bg-danger animate-pulse',
          (!status || status === 'draft') && 'bg-txt-tertiary'
        )}
      />
      {status ? status.charAt(0).toUpperCase() + status.slice(1) : 'Draft'}
    </span>
  );
}
