import { useState } from "react";

/** "About" section (brief §21) — the business's own description, line-clamped with a
 *  "Read more" toggle once it runs long, exactly like the reference's "À propos" +
 *  "Lire la suite" pattern. Split out as its own component/anchor because the reference
 *  treats it as its own nav-scrollable section, positioned right after the hero summary and
 *  before Services — not folded into the hero card itself. Renders nothing when the business
 *  hasn't written a description (brief §44: never fabricate one). */
export function BusinessDescription({ description }: { description: string | null }) {
  const [expanded, setExpanded] = useState(false);
  if (!description) return null;

  const isLong = description.length > 220;

  return (
    <section id="about" className="scroll-mt-32">
      <h2 className="text-xl font-extrabold">About</h2>
      <p className={`mt-2 text-sm leading-relaxed text-muted-foreground ${expanded ? "" : "line-clamp-3"}`}>
        {description}
      </p>
      {isLong && (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="press mt-1 text-sm font-bold text-primary"
        >
          {expanded ? "Show less" : "Read more"}
        </button>
      )}
    </section>
  );
}
