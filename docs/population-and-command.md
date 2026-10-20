# Living population, conscription, fuel and command

Three systems were added on top of the existing economy and military layers. All four files are new
(`src/game/population.js`, `src/game/fuel.js`, `src/game/commanders.js`, `src/data/conscription.js`);
the hooks into `game.js`, `units.js` and `actions.js` are a handful of lines each.

## Population

Each nation carries 101 single-year cohorts (ages 0&ndash;100+) in thousands of people and is advanced
once a month by a twelfth of a year, the demographers' **cohort-component method**: a population is
carried forward by applying fertility, mortality and migration to each age group, so that

> population at the start + births &minus; deaths &plusmn; migration = population at the end.

* **Births** &mdash; a beta-shaped age-specific fertility curve over ages 15&ndash;49 whose values sum to the
  country's total fertility rate, applied to the female population of those ages. The mean age at
  childbearing moves with life expectancy and with the TFR itself, so richer and longer-lived
  countries have children later. (A TFR *is* the sum of the age-specific rates; that identity is what
  lets one observed number drive the whole curve.)
* **Deaths** &mdash; a Siler hazard (falling infant mortality, a flat accident term, exponential
  senescence) whose scale is fitted per country by bisection so that the life table's expectancy at
  birth matches the observed figure. War deaths are taken out of the 18&ndash;45 band instead of the
  pyramid as a whole.
* **Migration** &mdash; the WatchTower net-migration figure, spread over working ages, plus whatever the
  immigration system is doing.
* **Starting pyramid** &mdash; reconstructed from the three World Bank age bands (0&ndash;14, 15&ndash;64, 65+) in
  `public/data/demographics.json`, smoothed across the band joins and thinned at the top on the
  country's own mortality. Fallbacks keep countries with no row playable.

Fertility drifts toward a target that family policy lifts and war, unemployment and inflation push
down. Nothing here turns around quickly, which is the point.

The demographics screen now shows the pyramid the simulation is actually carrying, annual births and
deaths, natural change, median age, dependency ratio and the civilian labour force. Starting values
land close to the published ones &mdash; the United States opens at a median age of 38.8 and a dependency
ratio of 0.54.

## Conscription

Seven laws (`src/data/conscription.js`), the ladder from Hearts of Iron IV, from **Disarmed nation**
through **Volunteer only**, **Limited**, **Extensive**, **Service by requirement** and **All adults
serve** to **Scraping the barrel**. Each rung sets the share of the *recruitable pool* the state may
call up and charges for it in industry, training time, stability and growth.

The pool is ages 18&ndash;45, men in full and women by the law's own share &mdash; so an old country raises
fewer soldiers from the same law than a young one, which is the link back to the TFR. Manpower
refills toward that ceiling rather than toward a fixed share of total population.

Moving one rung costs 150 political power, as in HOI4, and is offered as an ordinary decision. Going
up needs war support (10% for limited, 20% extensive, 40% required, 70% all adults, 90% barrel), and
a democracy at peace will not go past limited conscription. Reported HOI4 percentages differ between
guides and patches; the shares here follow the common 1.5 / 2.5 / 5 / 10 / 20 / 25 ladder and are
then tuned against this game's division sizes.

## Fuel

Fuel is refined out of the energy sector (the economy's own `comm.energy.self`), bought on the world
market, or brought in under a standing import deal, and burned by anything with an engine. Armour and
aircraft burn the most, infantry almost nothing; everything burns more while moving and more again in
battle. Storage holds about 45 days of supply.

A country whose tanks run dry does not stop: `fuelFactor` scales movement and combat weight by how
motorised a formation is, down to a floor. Blockade and sanctions cut the import channel, which is
what makes an oil-poor belligerent feel it.

## Command

* **Officers** &mdash; a general staff sized on the country's weight, each with four skills, a level, and
  an army to command. They gain experience in the field, go up levels, and earn traits from the kind
  of war they keep fighting (panzer leader, unyielding, logistics wizard, old guard, and so on).
  Names are drawn from language-group surname pools, mapped by country and otherwise by the nearest
  mapped capital.
* **Army experience** &mdash; a national pool filled by war, by armies in contact, and slowly by peacetime
  exercises.
* **Land doctrine** &mdash; the four HOI4 branches (mobile warfare, superior firepower, grand battleplan,
  mass mobilisation), four steps each, bought with army experience.

Combat reads one number out of all of this, `commandFactor`, which multiplies a formation's weight by
what its commander and its country's doctrine are worth. The Command screen (military tab, **K**)
shows the staff, the doctrine tree and the fuel position.

## Sources

Conscription ladder and costs: player documentation for Hearts of Iron IV
([forum thread](https://steamcommunity.com/app/394360/discussions/0/358415206080913869),
[law guide](https://eip.gg/hoi4/guides/impact-of-laws/)) &mdash; these disagree on the upper tiers, so the
values here are a reading, not a transcription. Cohort-component method and the Leslie-matrix form:
[Missouri budget office methodology](https://budplan.oa.mo.gov/demographic-info/population-projections/methodology),
[CDC WONDER population projection methodology](https://wonder.cdc.gov/wonder/help/populations/population-projections/methodology.html).
Starting demographic observations: World Bank World Development Indicators, as described in
[demographics-data.md](demographics-data.md).
