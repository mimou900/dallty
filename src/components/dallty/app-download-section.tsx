import { AppDownloadBadges } from "@/components/dallty/app-download-badges";
import phonesMockup from "@/assets/app-phones-mockup.webp";

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

        <img
          src={phonesMockup}
          alt=""
          aria-hidden
          className="w-full max-w-xl justify-self-center object-contain lg:justify-self-end"
        />
      </div>
    </section>
  );
}
