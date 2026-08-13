## Goal

One consistent navigation across the public site, on mobile and desktop, that puts customer actions first and tucks business/pro links into a secondary "For business" menu.

## What changes

**1. Shared site header (new component)**
Today each public page (`/`, `/search`, `/salon/:id`) hand-rolls its own header, and the home header crams five links plus language and sign-in into one row. Replace all three with one shared header component used by every public page.

Structure (desktop):
```text
[ logo Dallty ]   Explore  Bookings  Favorites      [For business ▾] [lang] [Sign in / Account ▾]
```
- Primary links (customer): Explore, Bookings, Favorites — always visible from `md:` up.
- "For business" becomes a dropdown holding: List your business, Business sign in, Business dashboard (shown only for owners/staff), Join as staff.
- Signed-in users get an avatar/name menu: Bookings, Favorites, Account, Notifications, Sign out. Signed-out users see a single "Sign in" button.
- Language toggle stays, icon-only below `sm`.

Structure (mobile):
- Header keeps logo + language icon + a menu (hamburger) button, everything else moves into a slide-in sheet.
- Sheet order = priority order: Sign in / Account block at top, then Explore, Search, My bookings, Favorites, Notifications, then a visually separated lower "For business" section (List your business, Business sign in, Staff sign in, Business dashboard when applicable), then language and sign out.

**2. Bottom tab bar**
Keep the 5 customer tabs (Home, Search, Bookings, Favorites, Profile) and render it on every public page (currently only home and search). No business entries in the tab bar — business access lives in the header menu only.

**3. Footer**
Split into two clear groups: "For customers" (Explore, Search, Bookings, Favorites, Account) and "For business" (List your business, Business sign in, Staff sign in, Business dashboard), so the pro links have a consistent secondary home.

**4. Role awareness**
Links resolve through the existing `landingForRoles` helper so owners/staff land on `/admin`, customers on `/bookings`. Business-only entries are hidden for plain customers except the single "List your business" invite.

## Technical notes

- New `src/components/dallty/site-header.tsx` (uses existing shadcn `sheet` + `dropdown-menu`, glass styling, `dir`-aware with `start/end` utilities and Arabic labels from `dallty-content.ts`).
- Add the missing business/customer labels to both `en` and `ar` dictionaries in `src/lib/dallty-content.ts` instead of hardcoding English.
- Remove the inline headers in `src/routes/index.tsx`, `src/routes/search.tsx`, `src/routes/salon.$salonId.tsx` and mount `<SiteHeader />` + `<BottomNav />` there.
- No changes to `/admin` shell navigation, routing guards, data fetching, or backend.
- Verify with Playwright at 390px and 1280px that the sheet opens, all links resolve, and nothing overlaps the hero.
