// Broad public garrison and military-region anchors, not exact unit positions.
// Each generated battalion is dispersed and checked against the game's control map.
// US Army installations and brigade locations: https://www.hrc.army.mil/content/10739
// Japan Ground Self-Defense Force regional stations: https://www.mod.go.jp/gsdf/
// French Army unit map: https://www.defense.gouv.fr/terre/carte-unites-larmee-terre
// Bundeswehr Army structure: https://www.bundeswehr.de/en/organization/army/structure
// UK training and garrison areas: https://www.gov.uk/government/publications/public-information-leaflet-salisbury-plain-training-area
// Other anchors are regional estimates for the January 2025 game start.
export const MAJOR_GARRISONS = {
  USA: [
    ['Fort Cavazos area', 31.13, -97.78], ['Fort Bliss area', 31.82, -106.42],
    ['Fort Carson area', 38.74, -104.78], ['Fort Stewart area', 31.87, -81.61],
    ['Fort Bragg area', 35.14, -79.00], ['Fort Drum area', 44.05, -75.76],
    ['Fort Riley area', 39.10, -96.81], ['Fort Campbell area', 36.67, -87.47],
    ['Lewis-McChord area', 47.10, -122.57], ['Schofield area', 21.50, -158.06],
    ['Fort Wainwright area', 64.83, -147.64], ['Camp Pendleton area', 33.30, -117.32],
  ],
  CHN: [
    ['Beijing region', 39.90, 116.40], ['Shenyang region', 41.80, 123.43],
    ['Jinan region', 36.65, 117.12], ['Nanjing region', 32.06, 118.79],
    ['Shanghai region', 31.23, 121.47], ['Wuhan region', 30.59, 114.31],
    ['Guangzhou region', 23.13, 113.26], ['Chengdu region', 30.66, 104.07],
    ['Chongqing region', 29.56, 106.55], ['Lanzhou region', 36.06, 103.83],
    ['Urumqi region', 43.83, 87.62], ['Kunming region', 25.04, 102.72],
  ],
  RUS: [
    ['Moscow region', 55.75, 37.62], ['St Petersburg region', 59.94, 30.32],
    ['Kaliningrad region', 54.71, 20.51], ['Pskov region', 57.82, 28.33],
    ['Smolensk region', 54.78, 32.05], ['Voronezh region', 51.67, 39.20],
    ['Rostov region', 47.24, 39.70], ['Volgograd region', 48.71, 44.51],
    ['Kazan region', 55.79, 49.12], ['Yekaterinburg region', 56.84, 60.61],
    ['Novosibirsk region', 55.03, 82.92], ['Vladivostok region', 43.12, 131.89],
  ],
  IND: [
    ['Delhi region', 28.61, 77.21], ['Jammu region', 32.73, 74.87],
    ['Srinagar region', 34.08, 74.84], ['Chandigarh region', 30.73, 76.78],
    ['Jaipur region', 26.91, 75.79], ['Jodhpur region', 26.24, 73.02],
    ['Lucknow region', 26.85, 80.95], ['Kolkata region', 22.57, 88.36],
    ['Guwahati region', 26.14, 91.74], ['Pune region', 18.52, 73.86],
    ['Bengaluru region', 12.97, 77.59], ['Chennai region', 13.08, 80.27],
  ],
  GBR: [
    ['Aldershot area', 51.25, -0.76], ['Salisbury Plain area', 51.20, -1.98],
    ['Catterick area', 54.38, -1.63], ['Colchester area', 51.89, 0.90],
    ['Warminster area', 51.20, -2.18], ['Tidworth area', 51.23, -1.66],
    ['Bulford area', 51.19, -1.76], ['Bovington area', 50.70, -2.24],
    ['Leuchars area', 56.38, -2.86], ['Edinburgh area', 55.95, -3.19],
    ['Belfast area', 54.60, -5.93], ['Cardiff area', 51.48, -3.18],
  ],
  FRA: [
    ['Paris region', 48.86, 2.35], ['Lille region', 50.63, 3.06],
    ['Metz region', 49.12, 6.18], ['Strasbourg region', 48.58, 7.75],
    ['Nancy region', 48.69, 6.18], ['Besançon region', 47.24, 6.03],
    ['Lyon region', 45.76, 4.84], ['Grenoble region', 45.19, 5.73],
    ['Marseille region', 43.30, 5.37], ['Nîmes region', 43.84, 4.36],
    ['Toulouse region', 43.60, 1.44], ['Bordeaux region', 44.84, -0.58],
  ],
  DEU: [
    ['Oldenburg region', 53.14, 8.21], ['Munster region', 52.99, 10.09],
    ['Hannover region', 52.38, 9.73], ['Hamburg region', 53.55, 10.00],
    ['Berlin region', 52.52, 13.40], ['Potsdam region', 52.40, 13.06],
    ['Leipzig region', 51.34, 12.37], ['Dresden region', 51.05, 13.74],
    ['Kassel region', 51.31, 9.49], ['Stadtallendorf region', 50.82, 9.02],
    ['Ulm region', 48.40, 10.00], ['Munich region', 48.14, 11.58],
  ],
  JPN: [
    ['Sapporo region', 43.06, 141.35], ['Asahikawa region', 43.77, 142.37],
    ['Chitose region', 42.82, 141.65], ['Aomori region', 40.82, 140.74],
    ['Sendai region', 38.27, 140.87], ['Tokyo region', 35.68, 139.69],
    ['Matsumoto region', 36.24, 137.97], ['Nagoya region', 35.18, 136.91],
    ['Kyoto region', 35.01, 135.77], ['Hiroshima region', 34.39, 132.46],
    ['Fukuoka region', 33.59, 130.40], ['Kumamoto region', 32.80, 130.71],
  ],
};
