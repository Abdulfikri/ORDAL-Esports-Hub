---
name: ORDAL Esports Hub
colors:
  surface: '#111318'
  surface-dim: '#111318'
  surface-bright: '#37393e'
  surface-container-lowest: '#0c0e12'
  surface-container-low: '#1a1c20'
  surface-container: '#1e2024'
  surface-container-high: '#282a2e'
  surface-container-highest: '#333539'
  on-surface: '#e2e2e8'
  on-surface-variant: '#b9cacb'
  inverse-surface: '#e2e2e8'
  inverse-on-surface: '#2f3035'
  outline: '#849495'
  outline-variant: '#3b494b'
  surface-tint: '#00dbe9'
  primary: '#dbfcff'
  on-primary: '#00363a'
  primary-container: '#00f0ff'
  on-primary-container: '#006970'
  inverse-primary: '#006970'
  secondary: '#ffb2b7'
  on-secondary: '#67001c'
  secondary-container: '#da0044'
  on-secondary-container: '#ffecec'
  tertiary: '#e9ffa8'
  on-tertiary: '#283500'
  tertiary-container: '#bbea00'
  on-tertiary-container: '#506600'
  error: '#ffb4ab'
  on-error: '#690005'
  error-container: '#93000a'
  on-error-container: '#ffdad6'
  primary-fixed: '#7df4ff'
  primary-fixed-dim: '#00dbe9'
  on-primary-fixed: '#002022'
  on-primary-fixed-variant: '#004f54'
  secondary-fixed: '#ffdadb'
  secondary-fixed-dim: '#ffb2b7'
  on-secondary-fixed: '#40000e'
  on-secondary-fixed-variant: '#91002b'
  tertiary-fixed: '#c3f400'
  tertiary-fixed-dim: '#abd600'
  on-tertiary-fixed: '#161e00'
  on-tertiary-fixed-variant: '#3c4d00'
  background: '#111318'
  on-background: '#e2e2e8'
  surface-variant: '#333539'
  surface-base: '#0A0C10'
  surface-raised: '#12161F'
  surface-overlay: '#1A202C'
  surface-glass: rgba(18, 22, 31, 0.75)
  border-subtle: rgba(255, 255, 255, 0.08)
  border-active: rgba(0, 240, 255, 0.4)
  text-primary: '#F8FAFC'
  text-muted: '#94A3B8'
typography:
  headline-xl:
    fontFamily: Oswald
    fontSize: 56px
    fontWeight: '700'
    lineHeight: 64px
    letterSpacing: 0.02em
  headline-xl-mobile:
    fontFamily: Oswald
    fontSize: 36px
    fontWeight: '700'
    lineHeight: 44px
    letterSpacing: 0.02em
  headline-lg:
    fontFamily: Oswald
    fontSize: 40px
    fontWeight: '700'
    lineHeight: 48px
    letterSpacing: 0.01em
  headline-lg-mobile:
    fontFamily: Oswald
    fontSize: 28px
    fontWeight: '700'
    lineHeight: 36px
    letterSpacing: 0.01em
  headline-md:
    fontFamily: Oswald
    fontSize: 28px
    fontWeight: '600'
    lineHeight: 36px
    letterSpacing: 0.01em
  headline-sm:
    fontFamily: Oswald
    fontSize: 20px
    fontWeight: '600'
    lineHeight: 28px
    letterSpacing: 0.02em
  body-lg:
    fontFamily: Plus Jakarta Sans
    fontSize: 18px
    fontWeight: '400'
    lineHeight: 28px
  body-md:
    fontFamily: Plus Jakarta Sans
    fontSize: 16px
    fontWeight: '400'
    lineHeight: 24px
  body-sm:
    fontFamily: Plus Jakarta Sans
    fontSize: 14px
    fontWeight: '400'
    lineHeight: 20px
  label-lg:
    fontFamily: Space Grotesk
    fontSize: 14px
    fontWeight: '700'
    lineHeight: 18px
    letterSpacing: 0.08em
  label-md:
    fontFamily: Space Grotesk
    fontSize: 12px
    fontWeight: '600'
    lineHeight: 16px
    letterSpacing: 0.06em
  label-sm:
    fontFamily: Space Grotesk
    fontSize: 10px
    fontWeight: '600'
    lineHeight: 14px
    letterSpacing: 0.1em
rounded:
  sm: 0.125rem
  DEFAULT: 0.25rem
  md: 0.375rem
  lg: 0.5rem
  xl: 0.75rem
  full: 9999px
spacing:
  gutter: 1.5rem
  gutter-mobile: 0.75rem
  margin: 2rem
  margin-mobile: 1rem
  space-xs: 0.25rem
  space-sm: 0.5rem
  space-md: 1rem
  space-lg: 1.5rem
  space-xl: 2.5rem
---

## Brand & Style
The design system establishes a high-octane, tactical aesthetic tailored for competitive First-Person Shooter (FPS) esports journalism, tournament brackets, and apparel showcases. It fuses the precision of competitive FPS HUD elements with the curated polish of contemporary streetwear culture (blockcore, technical apparel, editorial typography).

The target audience encompasses competitive semi-pro and amateur FPS players, tournament organizers, and gaming lifestyle enthusiasts who value street-style graphics and high-fidelity visual documentation. The experience must evoke speed, high adrenaline, authoritative professionalism, and an underground competitive prestige.

The visual direction merges **High-Contrast Dark Minimalism** with **Tactical Cyberpunk accents**:
- Deep pitch-black and obsidian charcoal canvas layers that eliminate visual fatigue during marathon tournaments.
- Laser-sharp optical boundaries created via subtle glowing hairline borders and semi-translucent glass backdrops.
- High-saturation neon signals (Electric Cyan, Aggressive Crimson, Volt Lime) employed strictly as functional catalysts—indicating live telemetry, critical match states, and primary user interactions.

## Colors
The palette operates exclusively within a high-contrast dark realm designed to isolate photography, apparel textures, and match brackets against an infinite depth.

- **Primary Color (`#00F0FF` - Electric Cyan):** The primary kinetic signal. Used for interactive states, focus rings, primary navigation nodes, and active tournament bracket pathways.
- **Secondary Color (`#FF2E5B` - Aggressive Crimson):** The high-urgency operational hue. Strictly designated for live match badges, broadcast recording indicators, critical elimination statuses, and final calls-to-action (e.g., "Register Squad").
- **Tertiary Color (`#CCFF00` - Volt Lime):** Tactical precision highlight. Used for MVP badges, prize pool metrics, tournament qualification nodes, and apparel drop labels.
- **Neutral Color (`#0A0C10` - Pitch Black Canvas):** Deep, non-reflective base obsidian neutral that prevents OLED burn-in and creates razor-sharp contrast against neon accents.

### Color Rules & Hierarchy
- Never apply the primary Electric Cyan or Volt Lime as broad surface fills; they function strictly as hairline strokes, text badges, drop indicators, or box-shadow blooms.
- Surface transitions step strictly through obsidian tiers: `#0A0C10` (Canvas Background) → `#12161F` (Cards & Containers) → `#1A202C` (Hovered Containers, Dropdowns & Modals).
- Live match indicators must utilize `#FF2E5B` paired with an animated pulse glow to command immediate visual prioritization over standard news articles.

## Typography
The typography pairing balances condensed athletic power with pristine digital ergonomics:

- **Headlines (`Oswald`):** Condensed, aggressive, and industrial. Evokes athletic jersey lettering and esports arena broadcast overlays. Always styled with uppercase or title casing for section headers, tournament titles, and major news hooks.
- **Body & Longform (`Plus Jakarta Sans`):** Selected for its modern, balanced geometry and open aperture, ensuring maximum readability during prolonged match analyses, rulebook audits, and editorial reads.
- **Labels, Telemetry & Stats (`Space Grotesk`):** Provides a technical, tactical monospace-adjacent appearance. Applied to match scores, bracket round labels, in-game IDs (IGN), live tickers, and gear spec callouts.

### Editorial Guidelines
- Use uppercase for all `label-lg`, `label-md`, and `label-sm` tokens to emulate military HUD telemetry.
- Long-form article text should maintain a strict `max-width: 680px` to optimize cadence and scan speed.

## Layout & Spacing
The layout adheres to a flexible 12-column responsive fluid grid anchored by strict content containment:
- **Desktop (>= 1280px):** 12 columns, 1.5rem (`24px`) gutters, maximum content width capped at `1440px` with 2rem (`32px`) margins.
- **Tablet (768px - 1279px):** 8 columns, 1rem (`16px`) gutters, responsive outer edge safe margins.
- **Mobile (< 768px):** 4 columns, 0.75rem (`12px`) gutters, 1rem (`16px`) margin.

### Specialized Layout Modules
- **Esports Live Ticker:** Full-bleed continuous horizontal track directly pinned below the global navigation.
- **Visual Masonry Grid (Apparel & Posters):** Dynamic 2-column (mobile) to 4-column (desktop) uncropped layout preserving vertical aspect ratios (3:4, 4:5, 1:1) with uniform `space-md` gaps.
- **Tournament Bracket Canvas:** Horizontally scrollable overflow viewport with absolute SVG vector connections across stage rounds, ensuring responsive fidelity on mobile viewports.

## Elevation & Depth
Depth in the system is not achieved through heavy realistic drop shadows; instead, it relies on **tonal stepping, frosted luminescence, and selective neon bloom**.

1. **Surface Tiers:**
   - **Tier 0 (Backdrop):** `#0A0C10` (Pure canvas floor).
   - **Tier 1 (Cards, Ticker, Panels):** `#12161F` with a 1px solid stroke of `rgba(255, 255, 255, 0.08)`.
   - **Tier 2 (Modals, Overlays, Dropdowns):** `#1A202C` with a 1px solid stroke of `rgba(255, 255, 255, 0.15)`.

2. **Glassmorphic Shields:**
   - Global navigation bars, floating tournament control docks, and lightbox drawers utilize `rgba(18, 22, 31, 0.75)` combined with a `backdrop-filter: blur(16px)` and a bottom border of `rgba(255, 255, 255, 0.06)`.

3. **Glow & Neon Blooms:**
   - **Active Interactive Glow:** `box-shadow: 0 0 16px -2px rgba(0, 240, 255, 0.35);` applied to focused form elements, primary CTA hover states, and active bracket links.
   - **Live Telemetry Glow:** `box-shadow: 0 0 12px -2px rgba(255, 46, 91, 0.5);` paired with a continuous 2-second keyframe opacity pulse for ongoing matches.

## Shapes
The shape language favors razor-sharp tactical geometry with tight 4px (`0.25rem`) corners (`roundedness: 1`). Large radii and bubbly pill shapes are strictly prohibited to preserve an aggressive, athletic, military-grade FPS posture.

- **Micro Components (Chips, Tags, Badges):** 2px corner radius or chamfered 45-degree corner clips.
- **Interactive Controls (Buttons, Inputs):** 4px (`0.25rem`) corner radius.
- **Containers (News Cards, Match Nodes, Modals):** 6px to 8px corner radius (`rounded-lg: 0.5rem`).
- **Pills/Circular:** Used solely for round team avatars and live status dots.

## Components

### 1. Buttons
- **Primary Action (Register Squad / Action Primary):** Solid Electric Cyan background (`#00F0FF`), dark slate text (`#0A0C10`), font `Oswald` Bold, uppercase, `letter-spacing: 0.05em`. Hover state initiates an outward cyan bloom (`box-shadow: 0 0 20px rgba(0, 240, 255, 0.4)`) and slight upward scale (`translate-y: -1px`).
- **Urgent / Live Action:** Crimson fill (`#FF2E5B`) with white text (`#FFFFFF`) for immediate live match links and finals registration.
- **Secondary / Ghost:** Transparent background with a 1px border of `rgba(255, 255, 255, 0.2)` and text in `#F8FAFC`. On hover: border turns into `#00F0FF` with background tint `rgba(0, 240, 255, 0.06)`.

### 2. Live Match Ticker
A continuous horizontally scrolling tape anchored directly under the navigation:
- Surface: `#0A0C10` with top and bottom borders in `border-subtle`.
- Module Nodes: Contains game identifier, team shorthand tags (e.g., `ORD vs FLCN`), live score (e.g., `12 - 10`), and a pulsing red circular dot beside the label "LIVE".
- Interaction: Pauses marquee animation on hover; clicking redirects directly to the match telemetry page.

### 3. Match Score Card & Bracket Nodes
- Surface: `#12161F` with a 1px border.
- Layout: Dual-row team module displaying team logo, team name, and round score.
- Victor State: The winning team row receives an accent border-left of 3px in `#00F0FF`, white bold text, and a glowing numeric score badge. The losing team row shifts to 50% opacity (`#94A3B8`).
- Connector Lines: Dynamic 2px lines connecting bracket nodes render in `rgba(255, 255, 255, 0.12)`, switching to `#00F0FF` along the advancing team's winning track.

### 4. News & Editorial Cards
- Aspect ratio 16:9 thumbnail preview with a subtle vertical dark gradient (`rgba(10, 12, 16, 0.8)` to `transparent`) at the bottom.
- Typography: Oswald title layered with high contrast over dark surface, preceded by a Volt Lime (`#CCFF00`) category tag (e.g., `META UPDATE`, `ROSTER LEAKS`).
- Hover Effect: Image scales smoothly (`scale-105`, duration 300ms) within its overflow-hidden boundary, while the card border lights up with `border-active`.

### 5. Apparel & Visual Showcase Cards
- Framing: High aspect ratio (4:5 or 3:4) vertical masonry cards showcasing blockcore apparel and roster graphic art.
- Minimal chrome: All meta labels (item name, collection drop date) stay tucked into a subtle frosted bottom ribbon (`rgba(18, 22, 31, 0.85)` + backdrop blur) that slides up seamlessly on hover.

### 6. Inputs & Form Fields
- Surface: `#0A0C10` inset field with a 1px solid border in `rgba(255, 255, 255, 0.12)`.
- Typography: `Space Grotesk` at 14px for tactical data input (In-Game Nickname, In-Game ID).
- Focus State: Border transitions to `#00F0FF` with a subtle inner and outer ambient glow (`0 0 10px rgba(0, 240, 255, 0.2)`). Error state switches stroke to `#FF2E5B`.