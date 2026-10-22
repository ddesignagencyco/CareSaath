import clsx from "clsx";

export function Table({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className="overflow-x-auto">
      <table className={clsx("w-full text-start text-sm", className)}>{children}</table>
    </div>
  );
}

export function Th({ children, className }: { children?: React.ReactNode; className?: string }) {
  return (
    <th
      scope="col"
      className={clsx(
        "border-b border-ink-100 bg-ink-25 px-5 py-3 text-start text-xs font-bold tracking-wide whitespace-nowrap text-ink-500 uppercase",
        className,
      )}
    >
      {children}
    </th>
  );
}

export function Td({ children, className }: { children?: React.ReactNode; className?: string }) {
  return <td className={clsx("border-b border-ink-100 px-5 py-3.5 align-middle", className)}>{children}</td>;
}

export function Tr({
  children,
  onClick,
  className,
}: {
  children: React.ReactNode;
  onClick?: () => void;
  className?: string;
}) {
  return (
    <tr
      onClick={onClick}
      onKeyDown={onClick ? (e) => (e.key === "Enter" || e.key === " ") && (e.preventDefault(), onClick()) : undefined}
      tabIndex={onClick ? 0 : undefined}
      className={clsx(onClick && "cursor-pointer transition-colors hover:bg-brand-50/40 focus-visible:bg-brand-50/60", className)}
    >
      {children}
    </tr>
  );
}
