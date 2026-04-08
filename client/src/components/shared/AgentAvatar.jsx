import clsx from 'clsx';

export default function AgentAvatar({ name, status, size = 'md' }) {
  const initials = (name || '?')
    .split(' ')
    .map((n) => n[0])
    .join('')
    .toUpperCase();

  const sizes = {
    sm: 'h-8 w-8 text-xs',
    md: 'h-10 w-10 text-sm',
    lg: 'h-14 w-14 text-lg',
  };

  return (
    <div className="relative inline-flex">
      <div
        className={clsx(
          'flex items-center justify-center rounded-full bg-accent/10 font-display font-bold text-accent',
          sizes[size]
        )}
      >
        {initials}
      </div>
      {status && (
        <span
          className={clsx(
            'absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-bg-secondary',
            status === 'active' && 'bg-success',
            status === 'paused' && 'bg-warning',
            status === 'attention' && 'bg-danger'
          )}
        />
      )}
    </div>
  );
}
