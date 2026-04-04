import clsx from 'clsx';

const variants = {
  primary: 'bg-accent text-bg-primary hover:bg-accent/90 font-semibold',
  secondary: 'border border-border bg-bg-tertiary text-txt-primary hover:bg-border',
  ghost: 'text-txt-secondary hover:text-txt-primary hover:bg-bg-tertiary',
  danger: 'bg-danger/10 text-danger hover:bg-danger/20',
};

export default function Button({ children, variant = 'primary', className, ...props }) {
  return (
    <button
      className={clsx(
        'inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2 text-sm transition-colors disabled:opacity-50',
        variants[variant],
        className
      )}
      {...props}
    >
      {children}
    </button>
  );
}
