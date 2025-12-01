Brand Identity: Jadler in Japan

1. Core Philosophy

The Vibe: "Tokyo Noir meets Edwardian High-Stakes."
A fusion of old-world physical luxury (mahogany, felt) with modern, cinematic digital interfaces (glassmorphism, glowing typography). It feels like an exclusive, after-hours backroom in a cyberpunk metropolis where tradition meets degeneracy.

The Aesthetic: "Glass & Grain."
We do not choose between skeuomorphism and flat design; we blend them. Real wood and felt textures provide the foundation, while floating, blurred glass panels provide the interface.

2. Color Palette

Primary Surfaces

Color Name

Hex Code

Usage

Royal Blue

#003B5C

The primary table felt. Deep, intellectual, calm.

Tokyo Night

#050505

The global background. Near-black, infinite depth.

Deep Mahogany

#3E1C14

Table rails and physical borders. Rich, warm wood tones.

UI & Accents

Color Name

Hex Code

Usage

Whiskey Gold

#D4AF37

Primary accent, winners, active states, "Call to Action".

Cream Parchment

#F5F5F0

Primary text. softer than pure white, readable on dark.

Glass Frost

rgba(0,0,0,0.4)

Backgrounds for panels (requires backdrop-blur).

Velvet Red

#8B0000

Error states, "Fold" actions, Hearts/Diamonds suits.

Cigar Ash

#A8A8A8

Secondary text, labels, inactive elements.

3. Typography

Display & Branding: Cinzel

Usage: Main Logo, Table branding ("DEGENERATE"), special headers.

Characteristics: Classical proportions, majestic, historical.

Headings: Playfair Display

Usage: Modal titles, emphatic statements, card ranks.

Characteristics: High-contrast serif, editorial, sophisticated.

Body Copy: Lato

Usage: General UI text, player names, button labels.

Characteristics: Clean sans-serif, highly legible at small sizes.

Data & Numbers: Roboto Mono

Usage: Pot sizes, bet amounts, stack sizes.

Characteristics: Monospaced, technical, precise.

4. UI Design Language

The "Glassmorphism" Standard

Player plaques and control panels must not look like solid plastic. They must look like frosted glass floating above the table.

CSS: background: rgba(0, 0, 0, 0.4);

Filter: backdrop-filter: blur(8px);

Border: 1px solid rgba(255, 255, 255, 0.1);

Lighting & Atmosphere

Vignette: The edges of the screen must always fade to black (#000). Focus is strictly on the table.

Glow: Active elements (winners, high-value pots) should utilize text-shadows to simulate luminescence.

Gold Glow: text-shadow: 0 0 12px rgba(212, 175, 55, 0.6);

Texture Strategy

Wood: Used only for structural boundaries (the table rail).

Felt: Used only for the play surface.

Glass: Used for all transient information (names, scores, buttons).

5. Tone of Voice

Persona: The Silent Pit Boss.
Style: Minimalist, Direct, slightly Ominous but Professional.

Correct: "The stakes are raised." / "Folded." / "JADLER IN JAPAN"

Incorrect: "You bet more money!" / "Game Over" / "Welcome to the game!"

6. Developer Cheat Sheet (Tailwind)

Backgrounds: bg-royal-blue, bg-mahogany, bg-black/80 backdrop-blur.

Text: text-whiskey-gold, text-cream-parchment.

Borders: border-white/10 (for glass), border-whiskey-gold/50 (for active/winning).

Shadows: shadow-2xl for the table (depth), drop-shadow-lg for cards.