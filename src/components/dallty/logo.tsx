import markUrl from "@/assets/dallty-mark.webp";
import wordmarkUrl from "@/assets/dallty-wordmark.webp";
import wordmarkAvif220 from "@/assets/dallty-wordmark-220.avif";
import wordmarkWebp220 from "@/assets/dallty-wordmark-220.webp";

/** Dallty pin mark — square, safe on any background. */
export function LogoMark({ className = "size-9" }: { className?: string }) {
  return <img src={markUrl} alt="" aria-hidden className={`${className} object-contain`} />;
}

/** Full lockup: pin mark + wordmark. Falls back to text for tiny sizes. */
export function Logo({
  className = "",
  markClassName = "size-9",
  showWordmark = true,
}: {
  className?: string;
  markClassName?: string;
  showWordmark?: boolean;
}) {
  return (
    <span className={`flex items-center gap-2 ${className}`}>
      <LogoMark className={markClassName} />
      {showWordmark ? (
        <picture>
          <source type="image/avif" srcSet={wordmarkAvif220} />
          <source type="image/webp" srcSet={wordmarkWebp220} />
          <img
            src={wordmarkUrl}
            alt="Dallty"
            loading="lazy"
            width={360}
            height={121}
            className="h-6 w-auto object-contain"
          />
        </picture>
      ) : (
        <span className="sr-only">Dallty</span>
      )}
    </span>
  );
}
