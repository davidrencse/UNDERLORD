# Demographics data

The country demographics page combines the game's population baseline with two imported sources. The population number is a starting condition in the simulation and is not a World Bank observation. It does not currently change as time advances.

`public/data/demographics.json` contains the most recent non-null observation from 2020–2024 for each of seven [World Bank World Development Indicators](https://data.worldbank.org/): age shares (`SP.POP.0014.TO.ZS`, `SP.POP.1564.TO.ZS`, `SP.POP.65UP.TO.ZS`), urban share (`SP.URB.TOTL.IN.ZS`), life expectancy (`SP.DYN.LE00.IN`), crude birth rate (`SP.DYN.CBRT.IN`), and fertility (`SP.DYN.TFRT.IN`). Each value carries its observation year. The source is licensed [CC BY 4.0](https://datacatalog.worldbank.org/public-licenses#cc-by). Regenerate the snapshot with `node scripts/import-demographics.mjs`.

The existing WatchTower dossier supplies migrant stock, foreign-born share, net migration, and largest origin countries where available. Its migrant stock is labeled 2021. Missing values remain unavailable in the UI; the game does not synthesize age structure or migration values.
