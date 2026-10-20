// Starting conditions, 20 January 2025.
// id | ISO3 | name | leader | title | government | ideology | GDP $bn | pop m | stability | war support |
// debt %GDP | growth % | defence %GDP | capital lat,lon | military alliance | blocs |
// army: active k, MBT, combat aircraft, carriers, submarines, major surface ships, warheads | spirits
// Ideology codes: dem democratic, nat nationalist, aut autocratic, com communist, the theocratic.
const RAW = `
840|USA|United States|Donald Trump|President|Federal presidential republic|nat|29180|340|62|44|121|2.8|3.4|38.90,-77.04|NATO|UN-P5 G7 G20 QUAD AUKUS|1328,4640,2750,11,66,110,5044|reserve_currency america_first polarization constitutional_checks tech_giants
156|CHN|China|Xi Jinping|General Secretary|One-party socialist state|com|18750|1409|74|52|88|5.0|1.7|39.90,116.40||UN-P5 BRICS SCO G20|2035,4950,2100,3,60,140,600|made_in_china property_crisis great_firewall party_state export_dependency
643|RUS|Russia|Vladimir Putin|President|Authoritarian federal republic|aut|2160|144|58|61|20|3.6|6.3|55.75,37.62|CSTO|UN-P5 BRICS SCO G20 CIS|1320,2000,1180,1,60,75,5580|war_economy western_sanctions silovik_state security_vertical battlefield_attrition
356|IND|India|Narendra Modi|Prime Minister|Federal parliamentary republic|nat|3890|1451|68|40|83|6.5|2.4|28.61,77.21||BRICS SCO G20 QUAD|1475,4200,600,2,17,30,172|demographic_dividend strategic_autonomy coalition_federalism digital_public_goods
826|GBR|United Kingdom|Keir Starmer|Prime Minister|Constitutional monarchy|dem|3640|69|60|38|101|1.1|2.3|51.51,-0.13|NATO|UN-P5 G7 G20 AUKUS|138,213,140,2,10,17,225|city_of_london post_brexit parliamentary_mandate regional_divide
250|FRA|France|Emmanuel Macron|President|Semi-presidential republic|dem|3160|68|50|36|113|1.1|2.1|48.86,2.35|NATO|UN-P5 EU G7 G20|203,215,225,1,9,22,290|force_de_frappe hung_parliament republican_street administrative_state
276|DEU|Germany|Olaf Scholz|Chancellor|Federal parliamentary republic|dem|4710|84|52|30|63|0.0|2.1|52.52,13.40|NATO|EU G7 G20|181,300,225,0,6,11,0|zeitenwende industrial_stagnation debt_brake coalition_collapse export_engine federal_vetoes
392|JPN|Japan|Shigeru Ishiba|Prime Minister|Constitutional monarchy|dem|4070|124|70|26|236|0.4|1.6|35.68,139.69||G7 G20 QUAD|247,500,300,0,24,50,0|article_9 aging_society industrial_policy island_supply_lines
380|ITA|Italy|Giorgia Meloni|Prime Minister|Parliamentary republic|nat|2370|59|58|30|135|0.7|1.5|41.90,12.50|NATO|EU G7 G20|165,200,200,2,8,18,0|
124|CAN|Canada|Justin Trudeau|Prime Minister|Constitutional monarchy|dem|2240|41|52|30|107|1.5|1.4|45.42,-75.70|NATO|G7 G20|68,80,85,0,4,12,0|
076|BRA|Brazil|Luiz Inácio Lula da Silva|President|Federal presidential republic|dem|2170|212|50|22|87|3.2|1.1|-15.79,-47.88||BRICS G20|360,390,110,0,6,9,0|
410|KOR|South Korea|Choi Sang-mok|Acting President|Presidential republic|dem|1870|52|36|45|53|2.0|2.8|37.57,126.98||G20|500,2200,410,0,22,25,0|martial_law_crisis chaebol_economy
036|AUS|Australia|Anthony Albanese|Prime Minister|Constitutional monarchy|dem|1800|27|72|33|50|1.5|2.0|-35.28,149.13||G20 AUKUS QUAD|59,59,110,0,6,11,0|
724|ESP|Spain|Pedro Sánchez|Prime Minister|Constitutional monarchy|dem|1730|48|55|22|102|3.2|1.3|40.42,-3.70|NATO|EU|120,330,160,1,2,11,0|
484|MEX|Mexico|Claudia Sheinbaum|President|Federal presidential republic|dem|1850|131|48|18|58|1.2|0.7|19.43,-99.13||G20|280,0,30,0,0,8,0|cartel_violence nearshoring
360|IDN|Indonesia|Prabowo Subianto|President|Presidential republic|nat|1400|283|60|35|40|5.0|0.8|-6.21,106.85||BRICS G20 ASEAN|400,330,100,0,4,7,0|
528|NLD|Netherlands|Dick Schoof|Prime Minister|Constitutional monarchy|dem|1230|18|58|30|44|0.9|2.0|52.37,4.90|NATO|EU|41,18,40,0,4,6,0|
792|TUR|Turkey|Recep Tayyip Erdoğan|President|Presidential republic|nat|1320|87|52|48|26|3.2|2.1|39.93,32.86|NATO|G20|355,2200,300,0,12,16,0|inflation_crisis bosphorus_gate presidential_system currency_pressure
682|SAU|Saudi Arabia|Mohammed bin Salman|Crown Prince|Absolute monarchy|aut|1100|34|70|40|26|1.3|7.1|24.71,46.68||G20 GCC OPEC|257,1000,270,0,0,11,0|vision_2030 oil_economy
756|CHE|Switzerland|Karin Keller-Sutter|President of the Confederation|Federal directorial republic|dem|940|9|85|15|38|1.3|0.7|46.95,7.45|||20,134,55,0,0,0,0|armed_neutrality
616|POL|Poland|Donald Tusk|Prime Minister|Parliamentary republic|dem|910|37|62|58|55|2.9|4.1|52.23,21.01|NATO|EU|216,800,100,0,1,2,0|eastern_flank
158|TWN|Taiwan|Lai Ching-te|President|Semi-presidential republic|dem|790|23|62|46|26|4.3|2.5|25.03,121.56|||169,900,400,0,4,26,0|silicon_shield porcupine_doctrine
056|BEL|Belgium|Alexander De Croo|Prime Minister|Constitutional monarchy|dem|660|12|55|20|104|1.0|1.3|50.85,4.35|NATO|EU|23,0,45,0,0,2,0|
752|SWE|Sweden|Ulf Kristersson|Prime Minister|Constitutional monarchy|dem|610|10.6|72|45|33|0.9|2.2|59.33,18.07|NATO|EU|24,120,95,0,5,7,0|
032|ARG|Argentina|Javier Milei|President|Federal presidential republic|nat|630|46|45|20|85|-1.7|0.5|-34.60,-58.38||G20|72,230,30,0,2,5,0|chainsaw_austerity
372|IRL|Ireland|Simon Harris|Taoiseach|Parliamentary republic|dem|580|5.3|74|12|42|1.2|0.2|53.35,-6.26||EU|8,0,0,0,0,0,0|
376|ISR|Israel|Benjamin Netanyahu|Prime Minister|Parliamentary republic|nat|540|10|45|72|69|0.9|8.8|31.77,35.21|||170,1300,340,0,5,7,90|iron_dome multi_front_war
784|ARE|United Arab Emirates|Mohamed bin Zayed|President|Federal absolute monarchy|aut|540|10|80|35|30|3.8|5.0|24.45,54.38||BRICS GCC OPEC|65,380,150,0,0,10,0|
578|NOR|Norway|Jonas Gahr Støre|Prime Minister|Constitutional monarchy|dem|480|5.5|80|40|43|1.5|2.2|59.91,10.75|NATO||25,36,52,0,6,4,0|
040|AUT|Austria|Alexander Schallenberg|Chancellor (interim)|Federal parliamentary republic|dem|520|9.1|55|15|79|-1.0|0.8|48.21,16.37||EU|23,56,15,0,0,0,0|
764|THA|Thailand|Paetongtarn Shinawatra|Prime Minister|Constitutional monarchy|dem|530|72|52|25|63|2.5|1.3|13.76,100.50||ASEAN|360,400,100,0,0,7,0|
608|PHL|Philippines|Ferdinand Marcos Jr.|President|Presidential republic|dem|460|115|55|40|60|5.7|1.1|14.60,120.98||ASEAN|145,0,20,0,0,3,0|
704|VNM|Vietnam|Tô Lâm|General Secretary|One-party socialist state|com|480|101|75|45|37|7.0|2.0|21.03,105.85||ASEAN|480,1300,75,0,6,10,0|
364|IRN|Iran|Ali Khamenei|Supreme Leader|Islamic republic|the|430|91|38|50|34|3.0|2.1|35.69,51.39||BRICS SCO OPEC|610,1500,200,0,19,7,0|axis_of_resistance maximum_pressure
050|BGD|Bangladesh|Muhammad Yunus|Chief Adviser|Interim government|dem|450|174|35|15|37|4.2|1.0|23.81,90.41|||163,320,80,0,2,6,0|
208|DNK|Denmark|Mette Frederiksen|Prime Minister|Constitutional monarchy|dem|410|6|78|40|30|3.0|2.4|55.68,12.57|NATO|EU|15,44,30,0,0,9,0|
458|MYS|Malaysia|Anwar Ibrahim|Prime Minister|Federal constitutional monarchy|dem|420|34|60|20|64|5.1|1.0|3.14,101.69||ASEAN|113,48,40,0,2,6,0|
170|COL|Colombia|Gustavo Petro|President|Presidential republic|dem|420|53|42|22|55|1.7|3.0|4.71,-74.07|||293,0,40,0,4,4,0|
818|EGY|Egypt|Abdel Fattah el-Sisi|President|Presidential republic|aut|380|116|52|35|90|2.4|1.2|30.04,31.24||BRICS AU|440,3600,500,2,8,13,0|
710|ZAF|South Africa|Cyril Ramaphosa|President|Parliamentary republic|dem|400|63|46|15|74|0.6|0.7|-25.75,28.19||BRICS G20 AU|74,24,50,0,3,4,0|
586|PAK|Pakistan|Shehbaz Sharif|Prime Minister|Federal parliamentary republic|aut|370|251|38|50|70|2.5|2.6|33.68,73.05||SCO|654,2500,380,0,8,10,170|military_establishment imf_program
152|CHL|Chile|Gabriel Boric|President|Presidential republic|dem|330|20|55|18|41|2.6|1.4|-33.45,-70.67|||68,170,40,0,4,8,0|
642|ROU|Romania|Marcel Ciolacu|Prime Minister|Semi-presidential republic|dem|380|19|42|35|54|0.9|2.3|44.43,26.10|NATO|EU|70,380,40,0,0,3,0|
203|CZE|Czechia|Petr Fiala|Prime Minister|Parliamentary republic|dem|340|10.9|62|35|44|1.0|2.1|50.08,14.44|NATO|EU|27,30,30,0,0,0,0|
246|FIN|Finland|Petteri Orpo|Prime Minister|Parliamentary republic|dem|300|5.6|75|60|82|-0.1|2.4|60.17,24.94|NATO|EU|24,200,60,0,0,0,0|total_defence
620|PRT|Portugal|Luís Montenegro|Prime Minister|Parliamentary republic|dem|300|10.6|58|20|96|1.9|1.5|38.72,-9.14|NATO|EU|27,34,30,0,2,5,0|
604|PER|Peru|Dina Boluarte|President|Presidential republic|dem|290|34|30|15|33|3.3|1.0|-12.05,-77.04|||81,165,40,0,6,7,0|
398|KAZ|Kazakhstan|Kassym-Jomart Tokayev|President|Presidential republic|aut|290|20|62|25|23|4.8|1.0|51.17,71.45|CSTO|SCO CIS|39,300,100,0,0,0,0|
368|IRQ|Iraq|Mohammed Shia al-Sudani|Prime Minister|Federal parliamentary republic|aut|270|46|40|30|44|1.0|3.0|33.31,44.36||OPEC|193,350,40,0,0,0,0|
012|DZA|Algeria|Abdelmadjid Tebboune|President|Presidential republic|aut|260|47|55|30|48|3.5|8.2|36.75,3.06||AU OPEC|139,1400,100,0,6,8,0|
554|NZL|New Zealand|Christopher Luxon|Prime Minister|Constitutional monarchy|dem|260|5.2|78|20|46|0.5|1.1|-41.29,174.78|||9,0,0,0,0,2,0|
300|GRC|Greece|Kyriakos Mitsotakis|Prime Minister|Parliamentary republic|dem|250|10.4|58|40|154|2.3|3.1|37.98,23.73|NATO|EU|142,1300,230,0,11,13,0|
634|QAT|Qatar|Tamim bin Hamad Al Thani|Emir|Absolute monarchy|aut|220|3|82|20|40|2.4|4.0|25.29,51.53||GCC|17,62,90,0,0,4,0|
348|HUN|Hungary|Viktor Orbán|Prime Minister|Parliamentary republic|nat|220|9.6|62|25|74|0.5|2.1|47.50,19.04|NATO|EU|41,44,14,0,0,0,0|illiberal_democracy
804|UKR|Ukraine|Volodymyr Zelenskyy|President|Semi-presidential republic|dem|190|37|42|75|90|2.9|26|50.45,30.52|||900,1100,100,0,0,1,0|total_mobilization western_aid drone_warfare
566|NGA|Nigeria|Bola Tinubu|President|Federal presidential republic|dem|250|230|35|20|52|3.4|0.6|9.08,7.40||AU OPEC|143,100,50,0,0,5,0|insurgency
504|MAR|Morocco|Mohammed VI|King|Constitutional monarchy|aut|150|38|65|30|69|3.2|4.0|34.02,-6.83||AU|196,900,85,0,0,6,0|
414|KWT|Kuwait|Mishal Al-Ahmad Al-Jaber Al-Sabah|Emir|Constitutional monarchy|aut|160|4.9|70|20|3|-2.8|5.0|29.37,47.98||GCC OPEC|17,293,40,0,0,0,0|
231|ETH|Ethiopia|Abiy Ahmed|Prime Minister|Federal parliamentary republic|aut|145|130|30|40|40|6.1|1.0|9.03,38.74||BRICS AU|503,400,30,0,0,0,0|ethnic_conflict
862|VEN|Venezuela|Nicolás Maduro|President|Authoritarian presidential republic|aut|100|28|30|35|150|3.0|1.0|10.48,-66.90||OPEC|123,190,40,0,1,2,0|sanctioned_economy
404|KEN|Kenya|William Ruto|President|Presidential republic|dem|110|56|40|15|70|4.6|1.1|-1.29,36.82||AU|24,0,20,0,0,1,0|
192|CUB|Cuba|Miguel Díaz-Canel|President|One-party socialist state|com|100|11|35|30|120|-1.0|3.0|23.11,-82.37|||49,300,20,0,0,1,0|special_period
104|MMR|Myanmar|Min Aung Hlaing|Commander-in-Chief|Military junta|aut|65|54|12|30|60|1.0|4.0|19.76,96.08||ASEAN|150,200,70,0,2,5,0|civil_war
408|PRK|North Korea|Kim Jong Un|Supreme Leader|One-party juche state|com|25|26|80|85|0|3.7|25|39.03,125.75|||1280,4000,400,0,70,3,50|juche songun
760|SYR|Syria|Ahmed al-Sharaa|De facto leader|Transitional government|the|20|23|15|30|50|-1.0|3.0|33.51,36.29|||50,200,20,0,0,0,0|fragmented_country
004|AFG|Afghanistan|Hibatullah Akhundzada|Supreme Leader|Islamic emirate|the|17|42|40|60|7|2.7|4.0|34.53,69.17|||170,0,0,0,0,0,0|
112|BLR|Belarus|Alexander Lukashenko|President|Authoritarian presidential republic|aut|72|9.1|65|40|37|4.0|1.5|53.90,27.57|CSTO|SCO CIS|48,500,70,0,0,0,0|union_state
031|AZE|Azerbaijan|Ilham Aliyev|President|Presidential republic|aut|74|10.2|70|50|21|4.1|5.0|40.41,49.87|||64,570,40,0,0,0,0|
688|SRB|Serbia|Aleksandar Vučić|President|Parliamentary republic|nat|82|6.6|46|35|47|3.9|2.3|44.79,20.45|||28,240,40,0,0,0,0|
268|GEO|Georgia|Irakli Kobakhidze|Prime Minister|Parliamentary republic|nat|33|3.7|35|25|38|9.0|1.3|41.72,44.79|||21,120,10,0,0,0,0|
051|ARM|Armenia|Nikol Pashinyan|Prime Minister|Parliamentary republic|dem|25|3|45|30|48|6.0|6.0|40.18,44.51|||42,110,15,0,0,0,0|
434|LBY|Libya|Abdul Hamid Dbeibah|Prime Minister|Divided transitional government|aut|45|7.4|20|30|0|2.0|3.0|32.89,13.19||AU OPEC|32,200,20,0,0,2,0|
729|SDN|Sudan|Abdel Fattah al-Burhan|Chairman of the Sovereignty Council|Military junta|aut|30|50|8|50|200|-20|3.0|15.50,32.56||AU|100,170,45,0,0,0,0|civil_war
887|YEM|Yemen|Rashad al-Alimi|Chairman of the Presidential Council|Divided government|aut|19|35|10|50|70|-1.0|3.0|15.37,44.19|||40,100,10,0,0,0,0|houthi_insurgency
422|LBN|Lebanon|Joseph Aoun|President|Confessional parliamentary republic|dem|20|5.8|22|20|160|-5.0|3.0|33.89,35.50|||60,0,0,0,0,0,0|
400|JOR|Jordan|Abdullah II|King|Constitutional monarchy|aut|53|11.4|60|25|90|2.4|4.5|31.95,35.93|||100,500,50,0,0,0,0|
512|OMN|Oman|Haitham bin Tariq|Sultan|Absolute monarchy|aut|108|5.3|75|20|36|1.0|5.0|23.59,58.41||GCC|43,117,40,0,0,6,0|
788|TUN|Tunisia|Kais Saied|President|Presidential republic|aut|52|12.3|45|20|80|1.4|2.5|36.81,10.18||AU|36,80,15,0,0,2,0|
860|UZB|Uzbekistan|Shavkat Mirziyoyev|President|Presidential republic|aut|100|36|65|25|35|6.5|3.0|41.30,69.24||SCO CIS|48,340,50,0,0,0,0|
795|TKM|Turkmenistan|Serdar Berdimuhamedow|President|Authoritarian republic|aut|80|6.5|70|20|5|6.0|2.0|37.96,58.33||CIS|36,650,40,0,0,0,0|
417|KGZ|Kyrgyzstan|Sadyr Japarov|President|Presidential republic|aut|17|7.2|58|25|42|9.0|2.0|42.87,74.59|CSTO|SCO CIS|11,150,0,0,0,0,0|
762|TJK|Tajikistan|Emomali Rahmon|President|Authoritarian republic|aut|14|10.6|62|25|30|8.4|1.5|38.56,68.77|CSTO|SCO CIS|9,40,0,0,0,0,0|
496|MNG|Mongolia|Ukhnaagiin Khürelsükh|President|Semi-presidential republic|dem|21|3.5|60|15|45|5.0|0.6|47.92,106.92|||10,420,0,0,0,0,0|
218|ECU|Ecuador|Daniel Noboa|President|Presidential republic|dem|120|18|38|40|55|0.3|2.0|-0.18,-78.47|||40,0,20,0,2,2,0|cartel_violence
068|BOL|Bolivia|Luis Arce|President|Presidential republic|dem|46|12.4|35|20|85|1.4|1.5|-16.50,-68.15|||34,0,10,0,0,0,0|
600|PRY|Paraguay|Santiago Peña|President|Presidential republic|dem|43|6.9|55|15|40|4.0|1.0|-25.26,-57.58|||14,0,0,0,0,0,0|
858|URY|Uruguay|Luis Lacalle Pou|President|Presidential republic|dem|80|3.4|78|12|60|3.1|2.0|-34.90,-56.16|||22,0,10,0,0,2,0|
144|LKA|Sri Lanka|Anura Kumara Dissanayake|President|Presidential republic|dem|98|22|50|15|100|5.0|1.8|6.93,79.85|||255,60,20,0,0,2,0|
524|NPL|Nepal|KP Sharma Oli|Prime Minister|Federal parliamentary republic|dem|42|30|40|10|45|3.5|1.2|27.72,85.32|||96,0,0,0,0,0,0|
116|KHM|Cambodia|Hun Manet|Prime Minister|Constitutional monarchy|aut|46|17.6|62|20|35|6.0|2.0|11.56,104.92||ASEAN|124,200,10,0,0,0,0|
418|LAO|Laos|Thongloun Sisoulith|General Secretary|One-party socialist state|com|15|7.7|60|15|110|4.0|0.2|17.97,102.63||ASEAN|29,25,0,0,0,0,0|
702|SGP|Singapore|Lawrence Wong|Prime Minister|Parliamentary republic|dem|550|6|85|30|170|4.4|2.8|1.35,103.82||ASEAN|51,96,100,0,4,6,0|
288|GHA|Ghana|John Mahama|President|Presidential republic|dem|76|34|52|15|80|5.7|0.4|5.60,-0.19||AU|16,0,0,0,0,2,0|
384|CIV|Côte d'Ivoire|Alassane Ouattara|President|Presidential republic|dem|87|31|55|20|58|6.0|1.0|5.36,-4.01||AU|27,10,0,0,0,0,0|
834|TZA|Tanzania|Samia Suluhu Hassan|President|Presidential republic|aut|79|68|60|15|47|5.5|1.0|-6.16,35.75||AU|27,45,10,0,0,0,0|
180|COD|DR Congo|Félix Tshisekedi|President|Semi-presidential republic|aut|70|109|18|45|15|6.0|1.5|-4.32,15.31||AU|134,100,5,0,0,0,0|m23_insurgency
120|CMR|Cameroon|Paul Biya|President|Presidential republic|aut|53|29|40|20|45|3.9|1.0|3.85,11.50||AU|25,0,5,0,0,0,0|
800|UGA|Uganda|Yoweri Museveni|President|Presidential republic|aut|55|50|55|25|50|6.0|2.0|0.35,32.58||AU|45,250,10,0,0,0,0|
024|AGO|Angola|João Lourenço|President|Presidential republic|aut|90|37|45|15|60|3.0|1.4|-8.84,13.23||AU|107,300,20,0,0,0,0|
508|MOZ|Mozambique|Daniel Chapo|President|Presidential republic|aut|23|34|25|25|95|1.8|1.0|-25.97,32.57||AU|11,0,0,0,0,0,0|insurgency
894|ZMB|Zambia|Hakainde Hichilema|President|Presidential republic|dem|26|21|55|10|110|4.0|1.0|-15.39,28.32||AU|15,30,0,0,0,0,0|
716|ZWE|Zimbabwe|Emmerson Mnangagwa|President|Presidential republic|aut|35|16.6|40|15|60|2.0|1.0|-17.83,31.05||AU|29,40,5,0,0,0,0|
466|MLI|Mali|Assimi Goïta|Transitional President|Military junta|aut|22|24|30|50|50|4.0|4.0|12.64,-8.00|AES|AES|21,0,5,0,0,0,0|jihadist_insurgency
854|BFA|Burkina Faso|Ibrahim Traoré|Transitional President|Military junta|aut|22|23|28|55|58|4.0|4.0|12.37,-1.52|AES|AES|12,0,0,0,0,0,0|jihadist_insurgency
562|NER|Niger|Abdourahamane Tchiani|President of the CNSP|Military junta|aut|19|27|30|50|50|6.0|3.0|13.51,2.11|AES|AES|33,0,0,0,0,0,0|jihadist_insurgency
148|TCD|Chad|Mahamat Déby|President|Presidential republic|aut|18|19|35|40|40|3.0|2.0|12.13,15.06||AU|33,60,5,0,0,0,0|
706|SOM|Somalia|Hassan Sheikh Mohamud|President|Federal parliamentary republic|dem|11|19|18|40|30|4.0|2.0|2.05,45.32||AU|15,0,0,0,0,0,0|al_shabaab
686|SEN|Senegal|Bassirou Diomaye Faye|President|Presidential republic|dem|31|18|58|15|100|6.0|1.5|14.72,-17.47||AU|14,0,0,0,0,1,0|
191|HRV|Croatia|Andrej Plenković|Prime Minister|Parliamentary republic|dem|90|3.9|60|25|60|3.8|1.8|45.81,15.98|NATO|EU|15,30,12,0,0,0,0|
100|BGR|Bulgaria|Rosen Zhelyazkov|Prime Minister|Parliamentary republic|dem|112|6.4|40|25|24|2.8|2.0|42.70,23.32|NATO|EU|37,90,15,0,0,4,0|
703|SVK|Slovakia|Robert Fico|Prime Minister|Parliamentary republic|nat|140|5.4|48|20|58|2.1|2.0|48.15,17.11|NATO|EU|17,30,12,0,0,0,0|
705|SVN|Slovenia|Robert Golob|Prime Minister|Parliamentary republic|dem|72|2.1|62|15|68|1.6|1.3|46.06,14.51|NATO|EU|7,14,0,0,0,0,0|
440|LTU|Lithuania|Gintautas Paluckas|Prime Minister|Semi-presidential republic|dem|85|2.9|65|60|38|2.7|3.0|54.69,25.28|NATO|EU|23,0,0,0,0,0,0|
428|LVA|Latvia|Evika Siliņa|Prime Minister|Parliamentary republic|dem|43|1.9|60|55|47|-0.4|3.1|56.95,24.11|NATO|EU|8,0,0,0,0,0,0|
233|EST|Estonia|Kristen Michal|Prime Minister|Parliamentary republic|dem|42|1.4|62|60|24|-0.3|3.4|59.44,24.75|NATO|EU|7,0,0,0,0,0,0|
008|ALB|Albania|Edi Rama|Prime Minister|Parliamentary republic|dem|27|2.4|55|20|58|3.9|2.0|41.33,19.82|NATO||7,0,0,0,0,0,0|
807|MKD|North Macedonia|Hristijan Mickoski|Prime Minister|Parliamentary republic|nat|16|1.8|50|15|62|2.8|2.2|41.99,21.43|NATO||8,30,0,0,0,0,0|
499|MNE|Montenegro|Milojko Spajić|Prime Minister|Parliamentary republic|dem|8|0.6|50|15|60|3.4|1.8|42.44,19.26|NATO||2,0,0,0,0,0,0|
070|BIH|Bosnia and Herzegovina|Borjana Krišto|Chair of the Council of Ministers|Federal parliamentary republic|dem|28|3.2|35|15|30|2.5|0.8|43.86,18.41|||11,40,0,0,0,0,0|
498|MDA|Moldova|Maia Sandu|President|Parliamentary republic|dem|18|2.4|45|25|35|1.0|0.6|47.01,28.86|||6,0,0,0,0,0,0|
352|ISL|Iceland|Kristrún Frostadóttir|Prime Minister|Parliamentary republic|dem|33|0.4|80|5|60|0.6|0.1|64.15,-21.94|NATO||0,0,0,0,0,0,0|
442|LUX|Luxembourg|Luc Frieden|Prime Minister|Constitutional monarchy|dem|90|0.67|82|10|26|1.0|0.7|49.61,6.13|NATO|EU|1,0,0,0,0,0,0|
196|CYP|Cyprus|Nikos Christodoulides|President|Presidential republic|dem|34|1.3|60|30|70|3.4|1.8|35.17,33.36||EU|12,82,0,0,0,0,0|
Kosovo|XKX|Kosovo|Albin Kurti|Prime Minister|Parliamentary republic|nat|11|1.6|50|40|17|4.0|1.5|42.66,21.17|||5,0,0,0,0,0,0|
020|AND|Andorra|Head of government||Parliamentary co-principality|dem|3.8|0.08|80|5|35|1.5|0|42.51,1.52|||0,0,0,0,0,0,0|
438|LIE|Liechtenstein|Head of government||Constitutional monarchy|dem|7|0.04|85|5|10|1.5|0|47.14,9.52|||0,0,0,0,0,0,0|
470|MLT|Malta|Head of government||Parliamentary republic|dem|23|0.56|75|10|50|3|0.5|35.90,14.51||EU|2,0,0,0,0,0,0|
492|MCO|Monaco|Head of government||Constitutional monarchy|dem|9|0.04|85|5|10|1.5|0|43.73,7.42|||0,0,0,0,0,0,0|
674|SMR|San Marino|Captains Regent||Parliamentary republic|dem|2|0.034|80|5|65|1.5|0|43.94,12.45|||0,0,0,0,0,0,0|
336|VAT|Vatican City|Holy See||Ecclesiastical state|the|0.02|0.0008|85|5|10|1|0|41.90,12.45|||0,0,0,0,0,0,0|
275|PSE|Palestine|Mahmoud Abbas|President|Partially recognised state|aut|18|5.5|5|70|50|-28|0|31.90,35.20|||30,0,0,0,0,0,0|gaza_war
332|HTI|Haiti|Leslie Voltaire|President of the Transitional Council|Transitional government|dem|25|11.7|5|20|20|-4.0|0.2|18.54,-72.34|||1,0,0,0,0,0,0|gang_rule
214|DOM|Dominican Republic|Luis Abinader|President|Presidential republic|dem|125|11.4|62|15|60|5.0|0.7|18.49,-69.93|||56,0,10,0,0,2,0|
320|GTM|Guatemala|Bernardo Arévalo|President|Presidential republic|dem|113|18|45|10|28|3.5|0.4|14.63,-90.51|||18,0,0,0,0,0,0|
340|HND|Honduras|Xiomara Castro|President|Presidential republic|dem|36|10.6|40|10|46|3.6|1.5|14.07,-87.19|||15,0,10,0,0,0,0|
222|SLV|El Salvador|Nayib Bukele|President|Presidential republic|nat|35|6.3|75|25|85|2.6|1.0|13.69,-89.22|||25,0,0,0,0,0,0|
558|NIC|Nicaragua|Daniel Ortega|Co-President|Authoritarian presidential republic|aut|18|7|50|20|40|3.6|0.6|12.11,-86.24|||12,60,0,0,0,0,0|
188|CRI|Costa Rica|Rodrigo Chaves|President|Presidential republic|dem|95|5.2|65|5|61|4.0|0|9.93,-84.08|||0,0,0,0,0,0,0|
591|PAN|Panama|José Raúl Mulino|President|Presidential republic|dem|87|4.5|55|10|56|2.9|0|8.98,-79.52|||0,0,0,0,0,0,0|canal_toll
388|JAM|Jamaica|Andrew Holness|Prime Minister|Constitutional monarchy|dem|20|2.8|55|10|70|1.0|1.0|18.00,-76.79|||4,0,0,0,0,0,0|
048|BHR|Bahrain|Hamad bin Isa Al Khalifa|King|Constitutional monarchy|aut|47|1.6|65|25|125|3.0|3.5|26.23,50.59||GCC|8,180,40,0,0,1,0|
646|RWA|Rwanda|Paul Kagame|President|Presidential republic|aut|14|14|72|40|73|8.9|1.4|-1.95,30.06||AU|33,30,0,0,0,0,0|
232|ERI|Eritrea|Isaias Afwerki|President|One-party state|aut|2.5|3.7|55|50|180|2.9|10|15.32,38.93||AU|200,150,10,0,0,0,0|
728|SSD|South Sudan|Salva Kiir|President|Presidential republic|aut|5|11|15|30|60|-26|3.0|4.85,31.58||AU|53,80,0,0,0,0,0|
140|CAF|Central African Republic|Faustin-Archange Touadéra|President|Presidential republic|aut|3|5.7|15|30|55|1.5|2.0|4.39,18.56||AU|9,0,0,0,0,0,0|
450|MDG|Madagascar|Andry Rajoelina|President|Presidential republic|dem|17|31|40|10|55|4.2|0.6|-18.88,47.51||AU|14,0,0,0,0,0,0|
516|NAM|Namibia|Nangolo Mbumba|President|Presidential republic|dem|13|3|65|10|67|3.7|2.8|-22.56,17.08||AU|10,0,0,0,0,0,0|
072|BWA|Botswana|Duma Boko|President|Parliamentary republic|dem|19|2.5|70|10|20|-1.0|2.6|-24.65,25.91||AU|9,0,0,0,0,0,0|
266|GAB|Gabon|Brice Oligui Nguema|Transitional President|Military junta|aut|21|2.5|50|20|70|2.9|1.4|0.42,9.47||AU|5,0,0,0,0,0,0|
178|COG|Republic of the Congo|Denis Sassou Nguesso|President|Presidential republic|aut|15|6.3|45|15|95|3.5|2.0|-4.27,15.28||AU|10,40,0,0,0,0,0|
324|GIN|Guinea|Mamadi Doumbouya|Transitional President|Military junta|aut|24|14|38|25|40|5.7|1.5|9.64,-13.58||AU|10,30,0,0,0,0,0|
478|MRT|Mauritania|Mohamed Ould Ghazouani|President|Presidential republic|aut|11|5|55|20|50|4.6|2.5|18.08,-15.98||AU|16,35,0,0,0,0,0|
598|PNG|Papua New Guinea|James Marape|Prime Minister|Constitutional monarchy|dem|32|10.3|40|10|52|4.5|0.4|-9.44,147.18|||4,0,0,0,0,0,0|
Somaliland|SML|Somaliland|Muse Bihi Abdi|President|Unrecognised presidential republic|dem|4|5.7|55|40|10|3.0|3.0|9.56,44.06|||10,0,0,0,0,0,0|
N. Cyprus|NCY|Northern Cyprus|Ersin Tatar|President|Unrecognised semi-presidential republic|nat|4.5|0.4|55|30|50|3.0|1.0|35.19,33.36|||3,0,0,0,0,0,0|
`;

// Feature id (or name) → sovereign id, for dependencies drawn as separate shapes.
export const DEPENDENCIES = {
  304: '208', 234: '208', 630: '840', 316: '840', 850: '840', '016': '840', 580: '840',
  540: '250', 258: '250', 260: '250', 666: '250', 876: '250', 663: '250', 652: '250',
  238: '826', '060': '826', 136: '826', '092': '826', 796: '826', 500: '826', 660: '826', 654: '826',
  612: '826', '086': '826', 239: '826', 832: '826', 831: '826', 833: '826',
  533: '528', 531: '528', 534: '528', 344: '156', 446: '156', 248: '246',
  334: '036', 574: '036', 'Indian Ocean Ter.': '036', 'Siachen Glacier': '356', 732: '504',
  570: '554', 184: '554',
};

export const IDEOLOGIES = {
  dem: { name: 'Democratic', shade: 0.92 },
  nat: { name: 'Nationalist', shade: 0.62 },
  aut: { name: 'Autocratic', shade: 0.42 },
  com: { name: 'Communist', shade: 0.28 },
  the: { name: 'Theocratic', shade: 0.18 },
};
export const IDEOLOGY_KEYS = Object.keys(IDEOLOGIES);

export const FACTIONS = {
  NATO: { name: 'NATO', long: 'North Atlantic Treaty Organization', leader: '840' },
  CSTO: { name: 'CSTO', long: 'Collective Security Treaty Organization', leader: '643' },
  AES: { name: 'AES', long: 'Alliance of Sahel States', leader: '466' },
};

export const BLOCS = {
  'UN-P5': 'UN Security Council (permanent)', EU: 'European Union', G7: 'Group of Seven', G20: 'Group of Twenty',
  BRICS: 'BRICS', SCO: 'Shanghai Cooperation Organisation', QUAD: 'Quadrilateral Security Dialogue', AUKUS: 'AUKUS',
  GCC: 'Gulf Cooperation Council', ASEAN: 'ASEAN', AU: 'African Union', OPEC: 'OPEC', CIS: 'Commonwealth of Independent States',
  AES: 'Alliance of Sahel States',
};

// Bilateral defence commitments outside the factions.
export const PACTS = [
  ['840', '392'], ['840', '410'], ['840', '608'], ['840', '036'], ['840', '158'], ['840', '376'],
  ['156', '408'], ['643', '408'], ['643', '112'], ['682', '784'],
];

// Opinion between nations at game start; symmetric unless noted. Faction & pact bonuses are added on top.
export const RIVALRIES = [
  ['643', '804', -100], ['376', '275', -100], ['376', '364', -100], ['408', '410', -90], ['156', '158', -90],
  ['840', '364', -85], ['840', '408', -90], ['840', '643', -60], ['840', '156', -45], ['356', '586', -75],
  ['156', '356', -30], ['156', '392', -35], ['156', '608', -55], ['156', '704', -20], ['051', '031', -60],
  ['300', '792', -25], ['682', '364', -30], ['504', '012', -50], ['840', '862', -60], ['840', '192', -60],
  ['231', '232', -40], ['643', '616', -70], ['643', '440', -70], ['643', '428', -70], ['643', '233', -70],
  ['643', '246', -55], ['643', '826', -65], ['643', '276', -45], ['643', '250', -50], ['643', '268', -40],
  ['156', '643', 60], ['364', '643', 50], ['408', '643', 65], ['112', '643', 90], ['156', '586', 55],
  ['840', '826', 70], ['840', '376', 70], ['840', '392', 65], ['376', '422', -60], ['376', '760', -40],
  ['729', '784', -40], ['180', '646', -60], ['688', '-1', 0],
];

export const WARS = [
  { attacker: '643', defender: '804', name: 'Russo-Ukrainian War', since: '2022-02-24' },
  { attacker: '376', defender: '275', name: 'Gaza War', since: '2023-10-07' },
];

const N = (s) => Number(s);
export function parseNations() {
  const out = {};
  for (const line of RAW.trim().split('\n')) {
    const f = line.split('|');
    const [lat, lon] = f[14].split(',').map(N);
    const army = f[17] ? f[17].split(',').map(N) : null;
    out[f[0]] = {
      key: f[0], iso3: f[1], name: f[2], leader: f[3], title: f[4], gov: f[5], ideology: f[6],
      gdp: N(f[7]), pop: N(f[8]), stability: N(f[9]), warSupport: N(f[10]), debt: N(f[11]),
      growth: N(f[12]), defPct: N(f[13]), capital: { lat, lon }, faction: f[15] || null,
      blocs: f[16] ? f[16].split(' ') : [],
      army: army && { active: army[0], mbt: army[1], air: army[2], carriers: army[3], subs: army[4], ships: army[5], nukes: army[6] },
      spirits: f[18] ? f[18].split(' ') : [],
      curated: true,
    };
  }
  return out;
}
