import { Link } from "@tanstack/react-router";

export type FooterLinkItem = {
  label: string;
  to?: string;
  search?: Record<string, unknown>;
  soonLabel?: string;
};

function FooterLink({ item }: { item: FooterLinkItem }) {
  if (item.to) {
    return (
      <Link
        to={item.to}
        search={item.search}
        className="text-sm text-muted-foreground hover:text-primary"
      >
        {item.label}
      </Link>
    );
  }
  return (
    <span className="flex items-center gap-1.5 text-sm text-muted-foreground/70">
      {item.label}
      {item.soonLabel && (
        <span className="rounded-full bg-muted px-1.5 py-0.5 text-[0.6rem] font-bold uppercase tracking-wide text-muted-foreground">
          {item.soonLabel}
        </span>
      )}
    </span>
  );
}

export function FooterColumn({ title, items }: { title: string; items: FooterLinkItem[] }) {
  return (
    <div>
      <h3 className="text-sm font-bold text-foreground">{title}</h3>
      <ul className="mt-4 space-y-2.5">
        {items.map((item) => (
          <li key={item.label}>
            <FooterLink item={item} />
          </li>
        ))}
      </ul>
    </div>
  );
}

export { FooterLink };
