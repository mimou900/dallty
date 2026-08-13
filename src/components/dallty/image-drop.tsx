import { useEffect, useRef, useState } from "react";
import { ImagePlus, Loader2, Trash2 } from "lucide-react";

type Props = {
  label: string;
  hint?: string;
  file: File | null;
  onChange: (file: File | null) => void;
  aspect?: "square" | "wide";
  busy?: boolean;
};

const MAX_MB = 5;

/**
 * Lightweight photo picker: keeps the File in memory (shown as a local
 * preview) so it can be uploaded once the account exists.
 */
export function ImageDrop({ label, hint, file, onChange, aspect = "square", busy }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string | null>(null);

  useEffect(() => {
    if (!file) {
      setPreview(null);
      return;
    }
    const url = URL.createObjectURL(file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  function pick(next: File | null) {
    if (next && !next.type.startsWith("image/")) return;
    if (next && next.size > MAX_MB * 1024 * 1024) return;
    onChange(next);
  }

  return (
    <div className="block">
      <span className="mb-1.5 block text-sm font-semibold">{label}</span>
      <div
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          pick(e.dataTransfer.files?.[0] ?? null);
        }}
        className={`relative overflow-hidden rounded-2xl border border-dashed border-border/70 bg-muted/30 ${
          aspect === "wide" ? "aspect-[16/7]" : "aspect-square max-w-40"
        }`}
      >
        {preview ? (
          <img src={preview} alt={label} className="size-full object-cover" />
        ) : (
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            className="press flex size-full flex-col items-center justify-center gap-1.5 text-muted-foreground"
          >
            {busy ? <Loader2 className="size-5 animate-spin" /> : <ImagePlus className="size-5" />}
            <span className="text-xs font-semibold">Tap to upload</span>
            <span className="text-[11px]">PNG or JPG · max {MAX_MB}MB</span>
          </button>
        )}

        {preview && (
          <div className="absolute inset-x-2 bottom-2 flex gap-2">
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              className="press flex-1 rounded-xl bg-background/90 px-3 py-2 text-xs font-bold"
            >
              Replace
            </button>
            <button
              type="button"
              onClick={() => onChange(null)}
              aria-label="Remove photo"
              className="press rounded-xl bg-background/90 px-3 py-2 text-xs font-bold text-destructive"
            >
              <Trash2 className="size-4" />
            </button>
          </div>
        )}
      </div>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => pick(e.target.files?.[0] ?? null)}
      />
      {hint && <span className="mt-1 block text-xs text-muted-foreground">{hint}</span>}
    </div>
  );
}
