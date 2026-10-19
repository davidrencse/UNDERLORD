// name, lat, lon, metro population (millions), owner ISO3
const CITY_ROWS = `
Tokyo|35.68|139.69|37.1|JPN
Delhi|28.61|77.21|33.8|IND
Shanghai|31.23|121.47|29.9|CHN
Dhaka|23.81|90.41|23.9|BGD
São Paulo|-23.55|-46.63|22.8|BRA
Cairo|30.04|31.24|22.6|EGY
Mexico City|19.43|-99.13|22.5|MEX
Beijing|39.90|116.40|21.9|CHN
Mumbai|19.08|72.88|21.7|IND
Osaka|34.69|135.50|18.9|JPN
Chongqing|29.56|106.55|17.8|CHN
Karachi|24.86|67.01|17.6|PAK
Kinshasa|-4.32|15.31|17.0|COD
Lagos|6.52|3.38|16.5|NGA
Istanbul|41.01|28.98|15.8|TUR
Buenos Aires|-34.60|-58.38|15.5|ARG
Kolkata|22.57|88.36|15.5|IND
Manila|14.60|120.98|14.9|PHL
Guangzhou|23.13|113.26|14.3|CHN
Lahore|31.55|74.34|14.0|PAK
Shenzhen|22.54|114.06|13.5|CHN
Rio de Janeiro|-22.91|-43.17|13.8|BRA
Moscow|55.75|37.62|12.7|RUS
Bangalore|12.97|77.59|13.6|IND
Paris|48.86|2.35|11.3|FRA
Jakarta|-6.21|106.85|11.4|IDN
Lima|-12.05|-77.04|11.2|PER
Bangkok|13.76|100.50|11.2|THA
Seoul|37.57|126.98|10.0|KOR
London|51.51|-0.13|9.6|GBR
Tehran|35.69|51.39|9.5|IRN
Chicago|41.88|-87.63|8.9|USA
New York|40.71|-74.01|18.9|USA
Los Angeles|34.05|-118.24|12.5|USA
Ho Chi Minh City|10.82|106.63|9.3|VNM
Baghdad|33.31|44.36|7.7|IRQ
Riyadh|24.71|46.68|7.7|SAU
Hong Kong|22.32|114.17|7.6|CHN
Bogotá|4.71|-74.07|11.5|COL
Santiago|-33.45|-70.67|6.9|CHL
Madrid|40.42|-3.70|6.8|ESP
Toronto|43.65|-79.38|6.4|CAN
Washington|38.90|-77.04|6.3|USA
Houston|29.76|-95.37|7.3|USA
Dallas|32.78|-96.80|7.9|USA
Miami|25.76|-80.19|6.2|USA
San Francisco|37.77|-122.42|4.7|USA
Seattle|47.61|-122.33|4.0|USA
Atlanta|33.75|-84.39|6.2|USA
Boston|42.36|-71.06|4.9|USA
Norfolk|36.85|-76.29|1.8|USA
San Diego|32.72|-117.16|3.3|USA
Honolulu|21.31|-157.86|1.0|USA
Anchorage|61.22|-149.90|0.4|USA
Denver|39.74|-104.99|3.0|USA
Khartoum|15.50|32.56|6.3|SDN
Port Sudan|19.62|37.22|0.6|SDN
Luanda|-8.84|13.23|9.3|AGO
Saint Petersburg|59.93|30.34|5.6|RUS
Novosibirsk|55.01|82.93|1.6|RUS
Yekaterinburg|56.84|60.61|1.5|RUS
Vladivostok|43.12|131.89|0.6|RUS
Murmansk|68.97|33.07|0.3|RUS
Kaliningrad|54.71|20.51|0.5|RUS
Rostov-on-Don|47.24|39.71|1.1|RUS
Belgorod|50.60|36.59|0.4|RUS
Kursk|51.73|36.19|0.4|RUS
Sevastopol|44.62|33.53|0.5|UKR
Kyiv|50.45|30.52|3.0|UKR
Kharkiv|49.99|36.23|1.4|UKR
Odesa|46.48|30.73|1.0|UKR
Dnipro|48.46|35.05|1.0|UKR
Zaporizhzhia|47.84|35.14|0.7|UKR
Donetsk|48.02|37.80|0.9|UKR
Luhansk|48.57|39.31|0.4|UKR
Mariupol|47.10|37.55|0.4|UKR
Kherson|46.64|32.62|0.3|UKR
Lviv|49.84|24.03|0.7|UKR
Pokrovsk|48.28|37.18|0.06|UKR
Kramatorsk|48.72|37.56|0.15|UKR
Berlin|52.52|13.40|4.6|DEU
Hamburg|53.55|9.99|2.6|DEU
Munich|48.14|11.58|2.9|DEU
Frankfurt|50.11|8.68|2.3|DEU
Cologne|50.94|6.96|2.0|DEU
Rome|41.90|12.50|4.3|ITA
Milan|45.46|9.19|4.3|ITA
Barcelona|41.39|2.17|5.6|ESP
Warsaw|52.23|21.01|3.1|POL
Kraków|50.06|19.94|1.1|POL
Amsterdam|52.37|4.90|2.5|NLD
Brussels|50.85|4.35|2.1|BEL
Vienna|48.21|16.37|2.0|AUT
Stockholm|59.33|18.07|1.7|SWE
Oslo|59.91|10.75|1.1|NOR
Helsinki|60.17|24.94|1.3|FIN
Copenhagen|55.68|12.57|1.4|DNK
Prague|50.08|14.44|1.4|CZE
Budapest|47.50|19.04|1.8|HUN
Bucharest|44.43|26.10|1.8|ROU
Athens|37.98|23.73|3.2|GRC
Lisbon|38.72|-9.14|2.9|PRT
Dublin|53.35|-6.26|1.5|IRL
Minsk|53.90|27.57|2.0|BLR
Vilnius|54.69|25.28|0.6|LTU
Riga|56.95|24.11|0.6|LVA
Tallinn|59.44|24.75|0.4|EST
Belgrade|44.79|20.45|1.7|SRB
Manchester|53.48|-2.24|2.8|GBR
Glasgow|55.86|-4.25|1.8|GBR
Marseille|43.30|5.37|1.8|FRA
Lyon|45.76|4.84|2.3|FRA
Ankara|39.93|32.86|5.8|TUR
Izmir|38.42|27.14|3.0|TUR
Tel Aviv|32.09|34.78|4.4|ISR
Jerusalem|31.77|35.21|1.3|ISR
Haifa|32.79|34.99|1.1|ISR
Gaza|31.50|34.47|0.8|PSE
Beirut|33.89|35.50|2.4|LBN
Damascus|33.51|36.29|2.6|SYR
Aleppo|36.20|37.13|2.1|SYR
Amman|31.95|35.93|4.6|JOR
Dubai|25.20|55.27|3.6|ARE
Abu Dhabi|24.45|54.38|1.6|ARE
Doha|25.29|51.53|2.4|QAT
Kuwait City|29.37|47.98|3.3|KWT
Sanaa|15.37|44.19|3.3|YEM
Aden|12.79|45.03|1.1|YEM
Muscat|23.59|58.41|1.6|OMN
Jeddah|21.49|39.19|4.8|SAU
Isfahan|32.65|51.67|2.3|IRN
Bandar Abbas|27.18|56.27|0.6|IRN
Kabul|34.53|69.17|4.9|AFG
Islamabad|33.68|73.05|1.2|PAK
Tashkent|41.30|69.24|2.9|UZB
Almaty|43.24|76.89|2.2|KAZ
Astana|51.17|71.45|1.4|KAZ
Baku|40.41|49.87|2.4|AZE
Tbilisi|41.72|44.79|1.2|GEO
Yerevan|40.18|44.51|1.1|ARM
Chennai|13.08|80.27|11.8|IND
Hyderabad|17.39|78.49|11.0|IND
Ahmedabad|23.02|72.57|8.8|IND
Colombo|6.93|79.85|0.8|LKA
Kathmandu|27.72|85.32|1.5|NPL
Yangon|16.87|96.20|5.6|MMR
Naypyidaw|19.76|96.08|1.2|MMR
Hanoi|21.03|105.85|5.3|VNM
Phnom Penh|11.56|104.92|2.3|KHM
Kuala Lumpur|3.14|101.69|8.6|MYS
Singapore|1.35|103.82|6.0|SGP
Surabaya|-7.25|112.75|3.0|IDN
Taipei|25.03|121.56|7.0|TWN
Kaohsiung|22.63|120.30|2.8|TWN
Pyongyang|39.03|125.75|3.1|PRK
Busan|35.18|129.08|3.4|KOR
Nagoya|35.18|136.91|9.5|JPN
Sapporo|43.06|141.35|2.6|JPN
Fukuoka|33.59|130.40|5.5|JPN
Wuhan|30.59|114.31|11.4|CHN
Chengdu|30.57|104.07|16.0|CHN
Tianjin|39.34|117.36|11.0|CHN
Xi'an|34.34|108.94|8.9|CHN
Harbin|45.80|126.53|5.0|CHN
Urumqi|43.83|87.62|3.0|CHN
Lhasa|29.65|91.17|0.9|CHN
Qingdao|36.07|120.38|6.0|CHN
Ulaanbaatar|47.92|106.92|1.6|MNG
Sydney|-33.87|151.21|5.3|AUS
Melbourne|-37.81|144.96|5.2|AUS
Perth|-31.95|115.86|2.2|AUS
Brisbane|-27.47|153.03|2.6|AUS
Darwin|-12.46|130.84|0.15|AUS
Auckland|-36.85|174.76|1.7|NZL
Johannesburg|-26.20|28.05|6.2|ZAF
Cape Town|-33.92|18.42|4.8|ZAF
Nairobi|-1.29|36.82|5.3|KEN
Addis Ababa|9.03|38.74|5.5|ETH
Dar es Salaam|-6.79|39.21|7.8|TZA
Abuja|9.08|7.40|3.8|NGA
Accra|5.60|-0.19|2.6|GHA
Abidjan|5.36|-4.01|5.6|CIV
Dakar|14.72|-17.47|3.5|SEN
Bamako|12.64|-8.00|2.9|MLI
Niamey|13.51|2.11|1.4|NER
Ouagadougou|12.37|-1.52|3.1|BFA
N'Djamena|12.13|15.06|1.6|TCD
Mogadishu|2.05|45.32|2.8|SOM
Goma|-1.68|29.22|1.0|COD
Kampala|0.35|32.58|3.8|UGA
Kigali|-1.95|30.06|1.3|RWA
Algiers|36.75|3.06|3.0|DZA
Casablanca|33.57|-7.59|3.9|MAR
Tunis|36.81|10.18|2.5|TUN
Tripoli|32.89|13.19|1.2|LBY
Benghazi|32.12|20.09|0.8|LBY
Antananarivo|-18.88|47.51|3.9|MDG
Harare|-17.83|31.05|1.6|ZWE
Lusaka|-15.39|28.32|3.2|ZMB
Maputo|-25.97|32.57|1.2|MOZ
Brasília|-15.79|-47.88|4.8|BRA
Manaus|-3.12|-60.02|2.3|BRA
Caracas|10.48|-66.90|3.0|VEN
Havana|23.11|-82.37|2.1|CUB
Port-au-Prince|18.54|-72.34|2.9|HTI
Panama City|8.98|-79.52|1.9|PAN
Guatemala City|14.63|-90.51|3.0|GTM
Quito|-0.18|-78.47|2.0|ECU
Guayaquil|-2.17|-79.92|3.1|ECU
La Paz|-16.50|-68.15|1.9|BOL
Montevideo|-34.90|-56.16|1.8|URY
Asunción|-25.26|-57.58|3.5|PRY
Monterrey|25.69|-100.32|5.3|MEX
Guadalajara|20.67|-103.35|5.4|MEX
Vancouver|49.28|-123.12|2.6|CAN
Montreal|45.50|-73.57|4.3|CAN
Ottawa|45.42|-75.70|1.5|CAN
Reykjavík|64.15|-21.94|0.2|ISL
Nuuk|64.18|-51.72|0.02|DNK
`;

export const CITIES = CITY_ROWS.trim().split('\n').map((l) => {
  const [name, lat, lon, pop, iso3] = l.split('|');
  return { name, lat: +lat, lon: +lon, pop: +pop, iso3 };
});

// Naval bases as a point at sea just off the harbour: name, sea lat, sea lon, owner ISO3.
const BASE_ROWS = `
Norfolk|36.95|-75.70|USA
Mayport|30.40|-81.20|USA
San Diego|32.55|-117.45|USA
Pearl Harbor|21.15|-158.10|USA
Bremerton|47.90|-122.55|USA
Yokosuka (7th Fleet)|35.05|139.95|USA
Guam|13.40|144.45|USA
Bahrain (5th Fleet)|26.65|50.95|USA
Naples (6th Fleet)|36.90|16.80|USA
Rota|36.45|-6.55|USA
Qingdao|35.85|120.70|CHN
Zhoushan|29.85|122.70|CHN
Sanya|17.95|109.65|CHN
Zhanjiang|20.95|110.75|CHN
Severomorsk|69.45|34.20|RUS
Baltiysk|54.80|19.50|RUS
Novorossiysk|44.50|37.85|RUS
Vladivostok|42.85|132.10|RUS
Vilyuchinsk|52.80|158.90|RUS
Portsmouth|50.60|-1.00|GBR
Clyde|55.55|-5.30|GBR
Toulon|42.90|6.00|FRA
Brest|48.25|-4.85|FRA
Mumbai|18.75|72.60|IND
Visakhapatnam|17.50|83.55|IND
Karwar|14.75|73.95|IND
Yokosuka|35.15|139.80|JPN
Sasebo|33.00|129.55|JPN
Maizuru|35.70|135.35|JPN
Busan|34.95|129.25|KOR
Jinhae|34.85|128.80|KOR
Taranto|40.30|17.05|ITA
La Spezia|43.95|9.85|ITA
Rota|36.40|-6.70|ESP
Cartagena|37.45|-0.95|ESP
Gölcük|40.75|29.50|TUR
Aksaz|36.80|28.20|TUR
Wilhelmshaven|53.80|8.10|DEU
Kiel|54.60|10.40|DEU
Sydney|-33.90|151.40|AUS
Stirling|-32.25|115.55|AUS
Halifax|44.45|-63.35|CAN
Esquimalt|48.30|-123.40|CAN
Rio de Janeiro|-23.10|-43.10|BRA
Alexandria|31.45|29.80|EGY
Safaga|26.80|34.10|EGY
Bandar Abbas|26.90|56.35|IRN
Karachi|24.60|66.80|PAK
Haifa|32.90|34.90|ISR
Kaohsiung|22.45|120.10|TWN
Sinpo|39.85|128.35|PRK
Nampo|38.65|124.90|PRK
Den Helder|53.10|4.60|NLD
Karlskrona|55.95|15.75|SWE
Bergen|60.40|4.85|NOR
Salamis|37.80|23.40|GRC
Jeddah|21.40|38.95|SAU
Jubail|27.20|50.05|SAU
Surabaya|-6.85|112.85|IDN
Cam Ranh|11.85|109.35|VNM
Changi|1.25|104.05|SGP
Mers-el-Kébir|35.80|-0.75|DZA
Abu Dhabi|24.65|54.25|ARE
Callao|-12.10|-77.30|PER
Valparaíso|-33.00|-71.75|CHL
Puerto Belgrano|-39.00|-61.95|ARG
Sattahip|12.55|100.85|THA
Subic Bay|14.75|120.15|PHL
Chittagong|22.15|91.70|BGD
Mexico Gulf|19.25|-95.90|MEX
Lumut|4.20|100.50|MYS
Cartagena de Indias|10.35|-75.65|COL
Copenhagen|55.70|12.75|DNK
Lisbon|38.60|-9.35|PRT
Constanța|44.10|28.80|ROU
Simon's Town|-34.25|18.55|ZAF
`;

export const NAVAL_BASES = BASE_ROWS.trim().split('\n').map((l) => {
  const [name, lat, lon, iso3] = l.split('|');
  return { name, lat: +lat, lon: +lon, iso3 };
});

// Carrier deployments on 20 January 2025 (approximate).
export const CARRIER_POSITIONS = {
  USA: [
    ['CSG-8 Harry S. Truman', 20.5, 38.5], ['CSG-1 Carl Vinson', 15.0, 125.0], ['CSG-5 George Washington', 34.6, 139.95],
    ['CSG-12 Gerald R. Ford', 36.9, -75.6], ['CSG-2 George H.W. Bush', 36.6, -75.4], ['CSG-3 Abraham Lincoln', 32.4, -117.6],
    ['CSG-11 Nimitz', 47.6, -122.6], ['CSG-9 Theodore Roosevelt', 32.5, -117.8], ['CSG-10 Dwight D. Eisenhower', 36.8, -75.3],
    ['CSG-4 Carl Levin (refit)', 36.75, -75.9], ['CSG-15 Ronald Reagan (refit)', 47.5, -122.8],
  ],
  CHN: [['Liaoning group', 36.0, 121.2], ['Shandong group', 18.0, 110.2], ['Fujian (trials)', 31.2, 122.5]],
  RUS: [['Admiral Kuznetsov (refit)', 69.0, 33.4]],
  GBR: [['CSG Prince of Wales', 50.5, -1.3], ['Queen Elizabeth (refit)', 55.9, -4.9]],
  FRA: [['Charles de Gaulle group', 9.0, 76.0]],
  IND: [['INS Vikramaditya group', 14.6, 73.6], ['INS Vikrant group', 9.8, 75.8]],
  ITA: [['Cavour group', 40.0, 17.4], ['Garibaldi', 43.8, 9.9]],
  ESP: [['Juan Carlos I', 36.4, -6.4]],
  EGY: [['Gamal Abdel Nasser LHD', 31.6, 29.6], ['Anwar El Sadat LHD', 26.6, 34.3]],
};

// Russian forces garrisoned in occupied Ukraine and on the Kursk axis start along the contact line.
export const FRONT_NAMES = ['Kupiansk axis', 'Lyman axis', 'Siversk axis', 'Kostiantynivka axis', 'Pokrovsk axis', 'Novopavlivka axis', 'Huliaipole axis', 'Zaporizhzhia axis', 'Dnipro river line', 'Kursk axis', 'Kharkiv axis', 'Sumy axis'];
