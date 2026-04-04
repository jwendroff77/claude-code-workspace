export default function EmptyState({ icon: Icon, title, description }) {
  return (
    <div className="flex flex-col items-center justify-center py-20 text-center">
      {Icon && (
        <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-bg-tertiary">
          <Icon className="h-8 w-8 text-txt-tertiary" />
        </div>
      )}
      <h3 className="font-display text-lg font-semibold text-txt-primary">{title}</h3>
      {description && (
        <p className="mt-2 max-w-sm text-sm text-txt-secondary">{description}</p>
      )}
    </div>
  );
}
