# Country ledger: starting budget data

The funding screen treats every allocation as an **annual percentage of GDP**. The values in `public/data/budget-baselines.json` are a compact, local snapshot. Run `node scripts/import-budget-baselines.mjs` to refresh it. The importer selects each country's most recent observation from **2018–2024**, so no observation after the game's January 2025 start becomes a starting value.

| Funding line | Baseline source | Coverage in local snapshot |
|---|---|---:|
| Education | [World Bank / UNESCO, SE.XPD.TOTL.GD.ZS](https://data.worldbank.org/indicator/SE.XPD.TOTL.GD.ZS) | 229 countries |
| Health | [World Bank / WHO, SH.XPD.GHED.GD.ZS](https://data.worldbank.org/indicator/SH.XPD.GHED.GD.ZS) | 237 countries |
| Military | [World Bank / SIPRI, MS.MIL.XPND.GD.ZS](https://data.worldbank.org/indicator/MS.MIL.XPND.GD.ZS) | 200 countries |
| Pensions | [OECD, *Pensions at a Glance 2025*, Table 8.2](https://www.oecd.org/en/publications/pensions-at-a-glance-2025_e40274c1-en/full-report/public-expenditure-on-pensions_ddc9a2dd.html) | 32 countries |

The OECD pension table gives cash old-age and survivor benefits, with latest years varying between 2021 and 2023. Other lines, including administration, infrastructure, border security, foreign aid, UN contributions, immigration assistance, public safety, and housing, have no directly comparable global series in these sources. They are **game estimates**, derived from each country's income per person, GDP scale, migrant stock, and the WatchTower spending envelope when available. An unobserved education, health, military, or pension line also uses a marked estimate. The fixed `Other services` line fills out the approximate spending envelope; it is not a reported category.

The [IMF](https://data.imf.org/Datasets/GFS_COFOG) and [OECD](https://data-explorer.oecd.org/) use COFOG to compare government spending by function. Their broad categories do not directly separate every decision in this game. [UN assessments](https://www.un.org/en/ga/contributions/assessments.shtml) are set under a separate scale. This is why those small allocations are labeled as estimates rather than presented as official figures.

Gameplay effects are intentionally modest and are **design assumptions**, not causal estimates from the cited sources. Changing a budget line changes the annual debt path and its stated growth, stability, war support, or political-power effect. Borrowing raises debt immediately and creates a reserve that is drawn down against later deficits; repayment uses that reserve.
