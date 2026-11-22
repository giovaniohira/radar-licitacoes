# Visual revamp: "Editorial"

Screenshots at 1440px (desktop) and 390px (mobile), taken from a local dev server with local data
(the live PNCP numbers on the landing are from the local database, not production).

## System
- **Colour:** warm paper `#f6f4ef`, white surfaces, ink `#0b0f14` for dark sections, the sidebar and primary buttons. The V mark orange `#f97316` is the only accent (`#c2410c` for text on light backgrounds, for contrast).
- **Type:** Newsreader (light serif) for display headings and big numbers, Geist for UI and body, Geist Mono for small uppercase labels. Space Grotesk stays for the wordmark only.
- **Shape:** square corners (`--r: 2px`), 1px hairlines instead of shadows and filled boxes.
- **Signature details:** the 6px orange square before every label, an orange rule on the active nav item, links whose arrow nudges forward on hover, nav underlines that draw from the left, and a plus that folds into a minus in the FAQ.
- **Motion:** the hero rises once on load; landing sections fade up as they scroll in (CSS scroll-driven animations, only where supported); the FAQ opens smoothly where `interpolate-size` exists. All of it is off under `prefers-reduced-motion`.

## Landing order
Ink hero (promise, sign-up, a real product screenshot with callouts, live PNCP numbers) → 01 Como funciona → 02 Resumo por IA (ink) → 03 Recursos → 04 Mercado → 05 Preços → 06 Dúvidas → ink closing CTA and footer.

Texts are the existing ones. New words are only the section labels (Recursos, Dúvidas, Produto, Legal), "R$ 0" on the free plan, the "Preço de fundador" tag on the paid plan, the paid plan's single sentence split into four bullets, the four hero callouts (titles from the existing features and steps, with one-line versions of their texts) and the caption "Tela real do Vencedital, com editais publicados no PNCP."

## Hero screenshot
`src/app/(site)/produto-busca.webp` is a real capture of `/buscar` with the "Alimentação" sector query, logged in,
at 1280×860 CSS px and 2× density, cropped at the row divider (1280×841), with the sidebar account footer and the
dev indicator hidden. The four callouts in `DESTAQUES` (page.tsx) store the box of each highlighted control as % of
that image, so if the image is retaken, re-measure them (`getBoundingClientRect()` / image size) and update the numbers.
The data in it is public PNCP data from the day of capture; retake it now and then so the dates stay plausible.
