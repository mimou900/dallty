import markUrl from "@/assets/dallty-mark.png";
import wordmarkUrl from "@/assets/dallty-wordmark.png";

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
        <img src={wordmarkUrl} alt="Dallty" className="h-6 w-auto object-contain" />
      ) : (
        <span className="sr-only">Dallty</span>
      )}
    </span>
  );
}
