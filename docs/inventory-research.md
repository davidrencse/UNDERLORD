# National starting inventories

`src/data/inventories.js` gives fourteen nations their real January 2025 equipment: USA, China, Russia, Germany, France, Britain, India, Turkey, Ukraine, Poland, Israel, South Korea, Japan and Iran. For each equipment class it lists the systems the nation operates and roughly how many (`have`), what it keeps in usable storage (`store`), and the models its industry builds (`build`). `seedProduction` in `src/game/production.js` uses these at the start:

- **Stock rating** is the holdings-weighted average of the catalog ratings (`q` in `src/data/equipment.js`). Ukraine's tank fleet is mostly T-64BV and T-72, with a few Leopards and Abrams, so it rates about 0.8. Poland's fleet of K2, Abrams, Leopard 2 and PT-91 rates about 1.03.
- **Stockpile** is the army's fielded equipment times `store / have`, capped at 1.5×. Israel's large reserve of Merkavas and M113s gives it deep stocks. Germany's thin stores after its donations to Ukraine give it very few. Ammunition and drones have no counts, so they take a `reserve` multiplier for the months of fire held: Russia 1.5 (including North Korean shells), South Korea 2, Ukraine 0.5, Britain 0.4. Without an entry, a class keeps the old default: half of what the army fields, or two months of fire.
- **Production lines** build the listed models in order of preference, and a class's factories are split between them by weight. Russia, for example, runs T-90M, T-72B3M and T-80BVM tank lines. A model the nation cannot build yet, through research or because of an in-production date, is skipped. Borsuk only opens in mid-2025, so until then Poland's fighting-vehicle line builds Rosomak. If nothing listed is available, the class falls back to the generic choice: the best model the nation can build itself, then under licence, then the generic pattern.
- **Every other nation** keeps the generic defaults.

The **Production** screen (Military → Production) shows the lines. Each stockpile row lists the main systems held, and hovering over a row shows the approximate counts.

## Catalog additions

`src/data/equipment.js` gained about 130 widely fielded national and legacy systems. Examples include the Leopard 1A5, Leopard 2A4/2A5/2A6/2PL, T-64BV, T-72A/B, T-80BVM, T-62, PT-91, Arjun, Type 10, Altay, Karrar, BMP-1/2, M113, Stryker, Marder, Rosomak, Borsuk, Namer, M777, 2S1, 2S3, 2S22 Bohdana, AHS Krab, AS-90, T-155, Pinaka, Vilkha, TOS-1A, Bayraktar Akıncı, Gray Eagle, Leleka/Furia, Harop, Kargu-2, Warmate, Liutyi, S-300, Buk, Tor, Gepard, Hawk, HQ-9B, SAMP/T, CAMM, KM-SAM, David's Sling, Bavar-373, Stugna-P, TOW-2, MMP, Konkurs and Bukovel-AD.

- **Legacy models** have no makers: nations hold them but no line can build them.
- **Real licence deals** live in `LICENCES`: K2, K9, Chunmoo and CAMM in Poland; T-90S, BMP-2, K9, Konkurs and AK-203 in India; Boxer in Britain; Patriot in Japan. These are built at the 30% licence premium whatever the alliances. Poland was therefore removed from the K2's makers, since K2PL is licence production.
- **Ratings** follow the existing scale. 1.0 is a sound modern design and generic patterns sit at 0.5–0.9. Cold War designs come in at 0.45–0.75, and upgraded Soviet and Western designs at 0.8–1.15. These are game estimates for relative standing, not measured performance.

## Sources

The figures are **estimates**, rounded, and grouped into the nearest catalog model. For example, a T-72AV and a T-72B both count as `t72`, and 2S5 Giatsint counts as `2s3`. Hand-launched quadcopters and MANPADS are left out of the counts, because counting by number would let them swamp the class rating.

- **IISS, *The Military Balance 2025*** (February 2025). This is the baseline for active and stored holdings. The book is paywalled, so the figures come from its published summaries and press coverage. Examples include the 2024 edition's 1,750 active Russian tanks plus about 4,000 in store, and the IISS estimate of about 1,400 Russian tanks lost in 2024 with roughly as many returned to service ([SCMP / Reuters on the 2024 edition](https://scmp.com/news/world/europe/article/3251900/russia-refits-old-tanks-after-losing-3000-ukraine-war-iiss-report-says); [Euromaidan Press on the 2025 edition](https://euromaidanpress.com/2025/02/14/russia-loses-172000-troops-but-maintains-combat-power-through-2025/); [Ukranews](https://ukranews.com/en/news/984390-russia-has-reserves-of-tanks-for-three-years-of-war-military-balance)).
- **Open-source satellite counts of Russian storage bases**: about 3,500 tanks remained in open storage at the end of 2024, many unserviceable ([mind.ua](https://mind.ua/en/news/20269520-russia-has-enough-old-tanks-for-at-least-2-3-more-years-of-war-study)). Russia's `store` is set at 2,000 usable tanks.
- **Oryx** (visually confirmed losses). Ukrainian and Russian holdings are net of recorded losses to January 2025. Examples include about 20 of Ukraine's 31 M1A1s remaining, and its Leopard 2 and Bradley fleets about a third down.
- **SIPRI Arms Transfers Database**, plus national announcements for deliveries to January 2025. Examples include Poland's K2GF (about 110 of the 180 in the first contract; the last were handed over in November 2025, per [Defence24](https://defence24.pl/przemysl/zakonczenie-dostaw-czolgow-k2-z-pierwszej-umowy-wykonawczej)), its M1A1 FEPs, and Chunmoo/Homar-K. They also cover donor equipment for Ukraine: Leopard 1A5, CAESAR, Krab, PzH 2000, M777, Archer, AS-90, Patriot, NASAMS, IRIS-T SLM and Gepard.
- **Manufacturer and government statements** cover production in 2025. Examples include Altay's first deliveries, Ukraine's roughly 1.5 million FPV drones made in 2024, Bohdana and Stugna-P serial production, and US 155 mm output ramping toward 100,000 a month.

## Caveats

- **Uncertain counts.** Wartime holdings for Ukraine and Russia are the least certain figures here: an error of ±30% is plausible. Ukraine's `store` stands for its refurbishment and donor pipeline, not a depot.
- **Ground forces only.** Air-force SAMs (Patriot, SAMP/T, HQ-9, S-400) are included because the game's air defence class covers them. Naval and air equipment are not.
- **No precise orders of battle.** Counts are for the game's relative standing.
- **Ratios, not raw counts.** The game's fielded equipment comes from its division templates, not from these counts, so only the reserve ratio and the rating carry over. Raw numbers do not.
