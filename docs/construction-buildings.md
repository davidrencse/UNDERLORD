# Construction: the modern-day building list

The construction screen started with thirteen economic projects. Nine more were added, chosen the
way Hearts of Iron IV chooses buildings — each one exists because some other system needs it — and
updated for a present-day setting. The supply hub, which used to be sited from a map tool, is now
one of the choices too.

The panel groups them: **Industry**, **Energy, fuel and water**, **Logistics**, **Services and
science**, **Defence**.

| Building | Effect | Reads it |
|---|---|---|
| Oil refinery | +40 kt of fuel a day, scaled by what crude the country can draw on; +2% energy output | `fuel.js refining()` |
| Synthetic fuel plant | +25 kt a day with no crude at all; +1% energy output; slow and expensive | `fuel.js refining()` |
| Fuel depot | +8 days of fuel storage | `fuel.js storageDays()` |
| Rail yard | +4% throughput at every hub the country holds; +0.3% capacity nationwide | `supply.js hubCap()` |
| Research campus | +6% research speed (diminishing); +1.5% technology capacity; city only | `research.js speedFor()` |
| Data centre | +3% research speed (diminishing); +2% technology capacity | `research.js speedFor()` |
| Air defence network | Blunts enemy air support over ground the builder controls | `units.js _nationalAA()` |
| Desalination plant | +3% farm output, and the same rise in food self-sufficiency | `economy.js completeProject()` |
| Mining complex | +4% mining output and metals self-sufficiency | `economy.js completeProject()` |
| Supply hub | A railhead, 20 PP, level 2 in 20 days | `armies.js buildHub()` |

## Why these

**Fuel buildings.** HOI4 has synthetic refineries and fuel silos because fuel is a binding
constraint on armour and aircraft; this game gained a fuel layer, so it needed the same two answers
to it, plus an ordinary refinery for countries that do have crude. The split matters: a refinery
needs something to refine, so it scales with the country's energy self-sufficiency, while a
synthetic plant (coal- or gas-to-liquids, the Fischer-Tropsch route Germany ran in the 1940s and
South Africa ran through sanctions) is expensive, slow to build and independent of crude. That is
exactly the choice an oil-poor belligerent faces. Depots are the strategic-reserve analogue: states
hold fuel in days of consumption, so a depot buys days.

**Rail yard.** HOI4's *No Step Back* made railways and supply hubs the logistics layer; here the
hub already existed, and what was missing was a way to push more through the hubs you have. A rail
yard raises throughput nationally rather than adding another hub, so it competes with building one.

**Research campus and data centre.** The modern equivalent of HOI4's research-slot buildings. Both
feed research speed with diminishing returns, because the scarce input is people, not buildings. The
campus is city-only, like offices.

**Air defence network.** HOI4's anti-air buildings reduce enemy air superiority over the province
that holds them. Here it is national and territorial: the network cancels part of enemy air support
in battles fought on ground the builder still controls, and nothing at all abroad.

**Desalination and mining.** Both come from the economy's commodity model, where a sector's new
capacity raises self-sufficiency in the commodity it makes. Desalination is the Gulf-state answer to
a food and water constraint; a mining complex is the metals one. They are the modern-day version of
HOI4's resource extraction without inventing resource tiles.

## Cost

Projects priced themselves from the capacity they added, which gives a building that adds no sector
capacity — a depot, a rail yard, a launcher site — a cost of nearly nothing. Such buildings now carry
a `capital` figure, priced against the civilian economy without adding to it.
