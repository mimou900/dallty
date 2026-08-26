import { AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { FooterLink, type FooterLinkItem } from "./footer-column";

export function FooterAccordion({
  value,
  title,
  items,
}: {
  value: string;
  title: string;
  items: FooterLinkItem[];
}) {
  return (
    <AccordionItem value={value} className="border-border/60">
      <AccordionTrigger className="text-sm font-bold text-foreground hover:no-underline">
        {title}
      </AccordionTrigger>
      <AccordionContent>
        <ul className="space-y-3">
          {items.map((item) => (
            <li key={item.label}>
              <FooterLink item={item} />
            </li>
          ))}
        </ul>
      </AccordionContent>
    </AccordionItem>
  );
}
