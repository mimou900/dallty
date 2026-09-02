import { useState } from "react";

import { Drawer, DrawerContent, DrawerTitle } from "@/components/ui/drawer";

type StaffRow = {
  id: string;
  full_name: string;
  title: string;
  avatar_url: string | null;
};

const VISIBLE_LIMIT = 6;

// Circular avatar + name + role, no card background — matches the reference's plain
// "Équipe" row exactly (it was a bordered/glass card before feedback that the page was
// "still far from the target").
function StaffCard({ member, onOpen }: { member: StaffRow; onOpen: (id: string) => void }) {
  return (
    <button
      type="button"
      onClick={() => onOpen(member.id)}
      className="press w-20 shrink-0 text-center"
    >
      {member.avatar_url ? (
        <img
          src={member.avatar_url}
          alt={member.full_name}
          loading="lazy"
          className="mx-auto size-16 rounded-full object-cover"
        />
      ) : (
        <div className="mx-auto grid size-16 place-items-center rounded-full bg-primary/10 text-lg font-extrabold text-primary">
          {member.full_name.slice(0, 1)}
        </div>
      )}
      <p className="mt-2 truncate text-xs font-bold">{member.full_name}</p>
      <p className="truncate text-[11px] text-muted-foreground">{member.title}</p>
    </button>
  );
}

/** "Meet the team" (brief §16) — a compact horizontal strip capped at 6 with a "See all"
 *  sheet for the rest, so a business with 20 specialists doesn't turn this into a wall of
 *  cards (brief §49's large-data test case). Tapping any card, in the strip or the sheet,
 *  opens the same existing StaffDetailDrawer the old Overview tab already used — unchanged. */
export function BusinessTeam({
  staff,
  onOpenStaff,
}: {
  staff: StaffRow[];
  onOpenStaff: (staffId: string) => void;
}) {
  const [seeAllOpen, setSeeAllOpen] = useState(false);
  if (staff.length === 0) return null;

  const visible = staff.slice(0, VISIBLE_LIMIT);
  const hasMore = staff.length > VISIBLE_LIMIT;

  return (
    <section id="team" className="scroll-mt-32">
      <div className="flex items-end justify-between gap-3">
        <h2 className="text-xl font-extrabold">Meet the team</h2>
        {hasMore && (
          <button
            type="button"
            onClick={() => setSeeAllOpen(true)}
            className="press text-sm font-bold text-primary"
          >
            See all
          </button>
        )}
      </div>
      <div className="mt-4 flex gap-3 overflow-x-auto pb-1">
        {visible.map((m) => (
          <StaffCard key={m.id} member={m} onOpen={onOpenStaff} />
        ))}
      </div>

      <Drawer open={seeAllOpen} onOpenChange={setSeeAllOpen}>
        <DrawerContent className="max-h-[80vh]">
          <DrawerTitle className="px-5 pt-2 text-lg font-extrabold">
            The team ({staff.length})
          </DrawerTitle>
          <div className="grid grid-cols-4 gap-3 overflow-y-auto p-5 sm:grid-cols-5">
            {staff.map((m) => (
              <StaffCard
                key={m.id}
                member={m}
                onOpen={(id) => {
                  setSeeAllOpen(false);
                  onOpenStaff(id);
                }}
              />
            ))}
          </div>
        </DrawerContent>
      </Drawer>
    </section>
  );
}
