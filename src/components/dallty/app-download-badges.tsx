import appStoreBadge from "@/assets/app-store-badge.webp";
import googlePlayBadge from "@/assets/google-play-badge.webp";

/**
 * Official App Store / Google Play badge artwork. Shared by the app-download
 * section and the footer so both stay visually identical.
 */
export function AppDownloadBadges({
  appStoreLabel,
  appStoreName,
  playStoreLabel,
  playStoreName,
  size = "md",
}: {
  appStoreLabel: string;
  appStoreName: string;
  playStoreLabel: string;
  playStoreName: string;
  size?: "sm" | "md";
}) {
  const heightClass = size === "sm" ? "h-11" : "h-14";
  return (
    <div className="flex flex-wrap items-center gap-3">
      <img
        src={appStoreBadge}
        alt={`${appStoreLabel} ${appStoreName}`}
        className={`${heightClass} w-auto object-contain`}
      />
      <img
        src={googlePlayBadge}
        alt={`${playStoreLabel} ${playStoreName}`}
        className={`${heightClass} w-auto object-contain`}
      />
    </div>
  );
}
