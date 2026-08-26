import { Link } from "@tanstack/react-router";
import { ArrowRight, BarChart3, CalendarClock, ShieldCheck, Users } from "lucide-react";
import type { LucideIcon } from "lucide-react";

import dashboardMockup from "@/assets/professional-dashboard-mockup.webp";

const FEATURE_ICONS: LucideIcon[] = [CalendarClock, ShieldCheck, Users, BarChart3];

/** Business-conversion section ("Dallty for professionals"). */
export function ProfessionalCTA({
  title,
  subtitle,
  ctaLabel,
  features,
}: {
  title: string;
  subtitle: string;
  ctaLabel: string;
  features: [string, string][];
}) {
  return (
    <section className="mt-20 sm:mt-28">
      <div className="grid items-center gap-10 lg:grid-cols-2 lg:gap-16">
        <div>
          <h2 className="text-2xl font-extrabold text-primary sm:text-4xl">{title}</h2>
          <p className="mt-4 max-w-lg text-sm text-muted-foreground sm:text-base">{subtitle}</p>

          <Link
            to="/business/signup"
            className="press mt-7 inline-flex min-h-12 items-center gap-2 rounded-2xl bg-primary px-6 text-sm font-bold text-primary-foreground sm:text-base"
          >
            {ctaLabel}
            <ArrowRight className="size-4 rtl:rotate-180" />
          </Link>

          <div className="mt-8 grid grid-cols-2 gap-3 sm:gap-4">
            {features.map(([featureTitle, featureDesc], i) => {
              const Icon = FEATURE_ICONS[i % FEATURE_ICONS.length];
              return (
                <div key={featureTitle} className="rounded-3xl bg-cream p-4 sm:p-5">
                  <span className="grid size-10 place-items-center rounded-2xl bg-primary/10 text-primary">
                    <Icon className="size-5" />
                  </span>
                  <h3 className="mt-3 text-sm font-bold sm:text-base">{featureTitle}</h3>
                  <p className="mt-1 text-xs text-muted-foreground sm:text-sm">{featureDesc}</p>
                </div>
              );
            })}
          </div>
        </div>

        <img
          src={dashboardMockup}
          alt=""
          aria-hidden
          className="w-full max-w-xl justify-self-center object-contain lg:justify-self-end"
        />
      </div>
    </section>
  );
}
