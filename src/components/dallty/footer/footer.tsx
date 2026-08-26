import { Clock, Heart, ShieldCheck, Star } from "lucide-react";

import { Logo } from "@/components/dallty/logo";
import { LanguageSwitcher } from "@/components/dallty/language-switcher";
import { AppDownloadBadges } from "@/components/dallty/app-download-badges";
import { Accordion } from "@/components/ui/accordion";
import type { Lang } from "@/lib/i18n";
import { FooterColumn, type FooterLinkItem } from "./footer-column";
import { FooterAccordion } from "./footer-accordion";
import { NewsletterForm } from "./newsletter-form";
import { TrustFeature } from "./trust-feature";
import { SocialLinks } from "./social-links";

export type FooterColumnData = {
  id: string;
  title: string;
  items: FooterLinkItem[];
};

/**
 * Final homepage section. Predominantly white/cream (per brand direction — the footer must
 * not read as a dark section), closing with a strong Deep Green legal bar. Desktop columns
 * and the mobile accordion both render from the same `columns` data so there's one source
 * of truth for footer links, not two hand-maintained markups.
 */
export function Footer({
  lang,
  brandStatement,
  columns,
  newsletterTitle,
  newsletterSub,
  newsletterPlaceholder,
  newsletterCta,
  newsletterSuccess,
  newsletterError,
  newsletterInvalid,
  trustItems,
  appTitle,
  appSub,
  appStoreLabel,
  appStoreName,
  playStoreLabel,
  playStoreName,
  copyright,
  madeWithLove,
}: {
  lang: Lang;
  brandStatement: string;
  columns: FooterColumnData[];
  newsletterTitle: string;
  newsletterSub: string;
  newsletterPlaceholder: string;
  newsletterCta: string;
  newsletterSuccess: string;
  newsletterError: string;
  newsletterInvalid: string;
  trustItems: { title: string; desc: string }[];
  appTitle: string;
  appSub: string;
  appStoreLabel: string;
  appStoreName: string;
  playStoreLabel: string;
  playStoreName: string;
  copyright: string;
  madeWithLove: string;
}) {
  const trustIcons = [ShieldCheck, Clock, Star];

  return (
    <footer className="mt-12 sm:mt-16">
      <div className="rounded-4xl border border-border/60 bg-white px-4 pb-8 pt-10 sm:px-8 sm:pb-10 sm:pt-14 lg:px-12">
        <div className="grid gap-10 lg:grid-cols-[1.2fr_1fr_1fr_1fr_1fr_1.3fr] lg:gap-6">
          <div className="lg:pr-4">
            <Logo markClassName="size-9" />
            <p className="mt-4 max-w-xs text-sm text-muted-foreground">{brandStatement}</p>
            <SocialLinks className="mt-5" />
          </div>

          {columns.map((c) => (
            <div key={c.id} className="hidden lg:block">
              <FooterColumn title={c.title} items={c.items} />
            </div>
          ))}

          <div className="hidden lg:block">
            <h3 className="text-sm font-bold text-foreground">{newsletterTitle}</h3>
            <p className="mt-2 text-sm text-muted-foreground">{newsletterSub}</p>
            <div className="mt-4">
              <NewsletterForm
                lang={lang}
                placeholder={newsletterPlaceholder}
                ctaLabel={newsletterCta}
                successMessage={newsletterSuccess}
                errorMessage={newsletterError}
                invalidMessage={newsletterInvalid}
              />
            </div>
          </div>
        </div>

        <div className="mt-8 lg:hidden">
          <Accordion type="multiple">
            {columns.map((c) => (
              <FooterAccordion key={c.id} value={c.id} title={c.title} items={c.items} />
            ))}
          </Accordion>

          <div className="mt-6 rounded-3xl bg-cream p-5">
            <h3 className="text-base font-bold text-foreground">{newsletterTitle}</h3>
            <p className="mt-1.5 text-sm text-muted-foreground">{newsletterSub}</p>
            <div className="mt-4">
              <NewsletterForm
                lang={lang}
                placeholder={newsletterPlaceholder}
                ctaLabel={newsletterCta}
                successMessage={newsletterSuccess}
                errorMessage={newsletterError}
                invalidMessage={newsletterInvalid}
              />
            </div>
          </div>
        </div>

        <div className="mt-10 grid gap-6 border-t border-border/60 pt-8 sm:mt-12 sm:grid-cols-3 sm:pt-10">
          {trustItems.map((item, i) => (
            <TrustFeature
              key={item.title}
              icon={trustIcons[i % trustIcons.length]}
              title={item.title}
              desc={item.desc}
            />
          ))}
        </div>

        <div className="mt-10 flex flex-col items-start justify-between gap-5 rounded-3xl bg-cream p-6 sm:mt-12 sm:flex-row sm:items-center sm:p-8">
          <div>
            <h3 className="text-lg font-extrabold text-primary sm:text-xl">{appTitle}</h3>
            <p className="mt-1 text-sm text-muted-foreground">{appSub}</p>
          </div>
          <AppDownloadBadges
            appStoreLabel={appStoreLabel}
            appStoreName={appStoreName}
            playStoreLabel={playStoreLabel}
            playStoreName={playStoreName}
            size="sm"
          />
        </div>
      </div>

      <div className="mt-4 rounded-4xl bg-primary px-4 py-5 text-primary-foreground sm:px-8 sm:py-6 lg:px-12">
        <div className="flex flex-col items-center gap-3 text-center sm:flex-row sm:justify-between sm:text-left">
          <p className="text-xs sm:text-sm">{copyright}</p>
          <p className="flex items-center gap-1.5 text-xs font-medium sm:text-sm">
            <Heart className="size-3.5 fill-lime text-lime" />
            {madeWithLove}
          </p>
          <LanguageSwitcher variant="footer" />
        </div>
      </div>
    </footer>
  );
}
