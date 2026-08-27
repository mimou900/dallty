import { AppDownloadBadges } from "@/components/dallty/app-download-badges";
import phonesMockup from "@/assets/app-phones-mockup.webp";
import phonesMockupAvif480 from "@/assets/app-phones-mockup-480.avif";
import phonesMockupAvif768 from "@/assets/app-phones-mockup-768.avif";
import phonesMockupAvif1152 from "@/assets/app-phones-mockup-1152.avif";
import phonesMockupWebp480 from "@/assets/app-phones-mockup-480.webp";
import phonesMockupWebp768 from "@/assets/app-phones-mockup-768.webp";
import phonesMockupWebp1152 from "@/assets/app-phones-mockup-1152.webp";

// Below-fold, decorative (aria-hidden) — matches its own w-full max-w-xl
// sizing exactly: never wider than 576px, otherwise fills its column.
const MOCKUP_SIZES = "(min-width: 576px) 576px, 100vw";

export function AppDownloadSection({
  title,
  subtitle,
  appStoreLabel,
  appStoreName,
  playStoreLabel,
  playStoreName,
}: {
  title: string;
  subtitle: string;
  appStoreLabel: string;
  appStoreName: string;
  playStoreLabel: string;
  playStoreName: string;
}) {
  return (
    <section className="mt-12 overflow-hidden rounded-4xl bg-cream sm:mt-16">
      <div className="grid items-center gap-10 p-6 sm:p-12 lg:grid-cols-2 lg:gap-16 lg:p-16">
        <div>
          <h2 className="text-2xl font-extrabold text-primary sm:text-4xl">{title}</h2>
          <p className="mt-4 max-w-md text-sm text-muted-foreground sm:text-base">{subtitle}</p>

          <div className="mt-7">
            <AppDownloadBadges
              appStoreLabel={appStoreLabel}
              appStoreName={appStoreName}
              playStoreLabel={playStoreLabel}
              playStoreName={playStoreName}
            />
          </div>
        </div>

        <picture>
          <source
            type="image/avif"
            sizes={MOCKUP_SIZES}
            srcSet={`${phonesMockupAvif480} 480w, ${phonesMockupAvif768} 768w, ${phonesMockupAvif1152} 1152w`}
          />
          <source
            type="image/webp"
            sizes={MOCKUP_SIZES}
            srcSet={`${phonesMockupWebp480} 480w, ${phonesMockupWebp768} 768w, ${phonesMockupWebp1152} 1152w`}
          />
          <img
            src={phonesMockup}
            alt=""
            aria-hidden
            loading="lazy"
            width={1152}
            height={768}
            className="w-full max-w-xl justify-self-center object-contain lg:justify-self-end"
          />
        </picture>
      </div>
    </section>
  );
}
