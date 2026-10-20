# Immigration and settlement

Open **National trajectory → Immigration and settlement** or **Demographics → Open immigration focus tree**. Immigration shares the country's existing national focus slot. Programs take effect after the focus completes and deliver outcomes at the monthly economic settlement.

## Scope

The catalog covers all 56 countries in the supplied brief, plus Liechtenstein and Kazakhstan: 58 trees. There are 64 reusable shared focuses, 18 regional focuses per country, and national chains, supporting bargains and final settlements. Together these generate 5,369 focus instances. Smaller countries have 9–10 national focuses; larger trees have 14–16. Three national doctrines and three doctrines for each priority region are mutually exclusive. Opposing secondary policies also exclude one another, while public safety and administrative programs cross doctrine branches.

National entries containing “or” create separate, mutually exclusive focuses. Either choice can satisfy a subsequent national prerequisite. Final settlements require both the chosen doctrine and completion of the national chain.

Additional focuses include:

- Build Homes Before Raising Caps / Let Demand Lead Construction.
- Clear the Asylum Court Backlog; Independent Residency Appeals.
- Ethical Health-Worker Recruitment; Compete for Global Talent.
- Employer Recruitment Bonds; Untie Visas from Employers; End Recruitment Debt.
- Diaspora Return Guarantee; Portable Pension Agreements.
- Childcare for Workforce Entry; Paid Workplace Language Hours.
- Climate Displacement Protocol; No Lost School Years.
- Citizens Assembly on Settlement; Publish the Capacity Ledger.
- NHS Recruitment Covenant; Provincial Nominee Bargain; Apprenticeship Bridge; Safe Return Housing Guarantee; Rural Care Workforce, and other national programs.

## State and units

`src/data/immigration.js` defines the shared catalog, country chains, origin taxonomy and expanded trees. `src/game/immigration.js` owns `nation.immigration`. Focus effects install idempotent programs into that state; they do not award instant GDP or population bonuses.

Program modifier values are additive. Capacity values use a 0–1 scale; admissions, family and humanitarian channels use multipliers. `spending` is **percentage points of GDP per year**: `0.15` means an annual commitment equal to 0.15% of GDP. Funding can range from 0% to 150% of commitments. Reducing delivery funding does not repeal statutory admission rules.

The monthly sequence is:

1. Reconcile cohort totals with any external population change and apply the economy's existing population trend once.
2. Apply legal arrivals, family migration, asylum admissions, unauthorized arrivals, departures and capacity-limited removals.
3. Transfer residents between statuses after asylum decisions or regularization. These transfers and citizenship grants conserve population.
4. Improve language and credential access according to needs, eligibility and funded administrative capacity.
5. Update employment, housing, trust, inclusion, public-safety delivery and political response.
6. Feed labor availability, consumption, productivity and program spending into the existing national accounts. Spending appears in the economic ledger and contributes to the deficit.

Citizenship, age, civic participation and institutional trust contribute to simulated voter preferences; origin is never a party-preference input. Ruling-party satisfaction and an explicitly modeled sovereignty constituency affect the existing daily party drift and election machinery. Relations with source countries respond gradually to cooperation or disputes, including region-targeted agreements.

Events cover housing protests, recruitment shortages, implementation funding disputes, judicial challenges and integration reviews. Players receive choices through the existing event system; AI countries resolve them automatically. Each event has an 18-month recurrence cooldown.

## Demographics and safety

The population ledger filters by region, country of origin and migration status. South Asia lists the seven requested countries; Afghanistan can be classified separately or included in South Asia. Sub-Saharan origins have West, East, Central and Southern African subdivisions. Other origins include European, Central Asian, Middle Eastern, East Asian, American and Pacific countries.

Cohorts retain population, birth country, ancestry, generation, route, residency status, age/sex shares, citizenship counts, residence duration, education, employment, unemployment, income estimates, tax estimates, housing demand, language, credential recognition, civic participation, inclusion, trust and monthly flows.

Public-safety outcomes depend on unemployment, housing stress, funding, prevention, survivor services, judicial capacity and trust. Reporting access is shown separately. Neither origin nor ethnicity enters the safety calculation. Safety outcomes feed back into institutional trust.

## Scenario assumptions and limits

This is a fictional strategy simulation, not an OECD calibration or a claim that these policies were enacted in 2025. New cohort data is explicitly separated from the sourced demographic observations already displayed by the game. The six added microstate records use scenario economic and political placeholders.

Starting cohorts use 92% native-born and 8% foreign-born residents, divided evenly among listed origin countries and then by migration pathway. Different starting education, employment and language needs come from pathways, not origin. The source-country list is an extensible scenario sample, not a complete census.

Age and sex distributions are fixed aggregate shares. Generation distinguishes native-born from first-generation residents; the model does not yet simulate detailed family trees, annual aging or origin-specific second-generation ancestry. Citizenship eligibility uses average residence duration and language access, not individual case histories. Tax figures in the cohort ledger are estimates; national tax receipts remain calculated by the macroeconomic model to avoid double counting.

Baseline gross migration is approximately balanced because the existing economic population trend already includes its baseline demographic assumptions. Incoming and outgoing residents are modeled against external reservoirs; countries are not paired in a closed global migration accounting system. Long-term balance and country-specific source calibration remain tuning work.

## Verification

`tests/immigration.test.mjs` checks tree integrity and reachability, symmetric exclusions, focus completion, alternate prerequisites, excluded descendants, population conservation, monthly idempotency, ten-year finite-state behavior, funding and regional targeting, taxonomy changes, origin-independent safety, bilateral effects, event cooldowns, every country's presence on the real map, and national-account reconciliation.

Visual verification requires a connected browser. The implementation uses the existing typography and palette, native selects, scrollable cohort tables, keyboard focus indicators, responsive layouts and reduced-motion handling.
