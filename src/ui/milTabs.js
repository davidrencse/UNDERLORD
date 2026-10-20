// The tab strip shared by the military screens (supply, army designer, production, research).
export const MIL_TABS = [
  ['supply', 'Supply', 'U'],
  ['designer', 'Army designer', 'B'],
  ['production', 'Production', 'P'],
  ['research', 'Research', 'I'],
];

export const milTabs = (active) => `<nav class="mil-tabs" aria-label="Military screens">${MIL_TABS.map(([id, label, key]) => `<button data-miltab="${id}" class="${id === active ? 'on' : ''}" ${id === active ? 'aria-current="page"' : ''}>${label} <kbd class="num">${key}</kbd></button>`).join('')}</nav>`;
