/* Bea's Course Builder — the ability-level ladder.

   HOW TO CORRECT THIS FILE. Every number here is a default, and the ones tagged
   with 'bcb-estimate' in `sources` are our guesses because the rulebook was
   unreachable when this app was built. If you have the current British
   Showjumping Members Handbook or the Pony Club Show Jumping rulebook in front
   of you, edit the numbers below and nothing else needs to change — the app
   reads its heights, spreads and speeds from here.

   Fields:
     heightCm      first-round fence height for the class
     maxHeightCm   the highest a fence may be built (second-round singles, or
                   the course builder's leeway) — null when it is just heightCm
     spreadCm      widest spread for an oxer at this level
     tripleBarCm   widest spread for a triple bar (wider than an oxer)
     speedMpm      metres per minute, used to work out the time allowed
     efforts       [min, max] jumping efforts a course of this level usually has
     minCombos     doubles/trebles a course of this level should include
     scale         'pony' | 'horse' | 'both' — which stride default suits it   */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else Object.assign(root, api);
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  const E = 'bcb-estimate';

  const LEVELS = [
    /* ---- Learning at home. No governing body recognises these as classes;
            they are the heights people actually school over. ---- */
    { id: 'crosspoles', name: 'Cross poles', group: 'Learning at home', body: 'unaffiliated',
      heightCm: 40, maxHeightCm: 50, spreadCm: 0, tripleBarCm: 0, speedMpm: 300,
      efforts: [4, 8], minCombos: 0, scale: 'pony',
      note: 'Where everybody starts. Jump the middle.', sources: [E] },
    { id: 'u50', name: '50cm', group: 'Learning at home', body: 'unaffiliated',
      heightCm: 50, maxHeightCm: 55, spreadCm: 50, tripleBarCm: 60, speedMpm: 300,
      efforts: [6, 8], minCombos: 0, scale: 'pony', sources: [E] },
    { id: 'u60', name: '60cm', group: 'Learning at home', body: 'unaffiliated',
      heightCm: 60, maxHeightCm: 65, spreadCm: 60, tripleBarCm: 70, speedMpm: 300,
      efforts: [6, 10], minCombos: 0, scale: 'pony', sources: [E] },
    { id: 'u70', name: '70cm', group: 'Learning at home', body: 'unaffiliated',
      heightCm: 70, maxHeightCm: 75, spreadCm: 70, tripleBarCm: 85, speedMpm: 300,
      efforts: [8, 10], minCombos: 1, scale: 'pony', sources: [E] },
    { id: 'u80', name: '80cm', group: 'Learning at home', body: 'unaffiliated',
      heightCm: 80, maxHeightCm: 85, spreadCm: 80, tripleBarCm: 95, speedMpm: 300,
      efforts: [8, 12], minCombos: 1, scale: 'pony', sources: [E] },

    /* ---- The Pony Club. The right reference for a young rider. ---- */
    { id: 'pc70', name: 'PC70', group: 'Pony Club', body: 'ponyclub',
      heightCm: 70, maxHeightCm: 75, spreadCm: 70, tripleBarCm: 85, speedMpm: 325,
      efforts: [8, 12], minCombos: 1, scale: 'pony',
      note: 'Two single fences may go up to 0.75m in the second round.',
      sources: ['pc-heights', 'pc-speed', E] },
    { id: 'pc80', name: 'PC80', group: 'Pony Club', body: 'ponyclub',
      heightCm: 80, maxHeightCm: 85, spreadCm: 80, tripleBarCm: 95, speedMpm: 350,
      efforts: [8, 12], minCombos: 1, scale: 'pony',
      note: 'Two singles may go to 0.85m in the second round. From 2026 water trays '
        + 'appear in the second round at Area competitions.',
      sources: ['pc-heights', 'pc-speed', 'pc-2026', E] },
    { id: 'pc90', name: 'PC90', group: 'Pony Club', body: 'ponyclub',
      heightCm: 90, maxHeightCm: 95, spreadCm: 100, tripleBarCm: 115, speedMpm: 350,
      efforts: [10, 12], minCombos: 1, scale: 'pony',
      note: 'Two singles may go to 0.95m. Second-round height is unverified.',
      sources: ['pc-heights', 'pc-speed', E] },
    { id: 'pc100', name: 'PC100', group: 'Pony Club', body: 'ponyclub',
      heightCm: 100, maxHeightCm: 105, spreadCm: 110, tripleBarCm: 125, speedMpm: 375,
      efforts: [10, 12], minCombos: 2, scale: 'both',
      sources: ['pc-heights', 'pc-speed', E] },

    /* ---- British Showjumping: Club and Just for Schools. ---- */
    { id: 'jfs60', name: 'Just for Schools 60cm', group: 'BS Club & Schools', body: 'bs-club',
      heightCm: 60, maxHeightCm: 60, spreadCm: 60, tripleBarCm: 70, speedMpm: 300,
      efforts: [6, 10], minCombos: 0, scale: 'pony',
      sources: ['bs-club-jfs', 'bs-club-speed', E] },
    { id: 'club70', name: 'Club 70cm', group: 'BS Club & Schools', body: 'bs-club',
      heightCm: 70, maxHeightCm: 70, spreadCm: 70, tripleBarCm: 85, speedMpm: 300,
      efforts: [8, 10], minCombos: 1, scale: 'pony',
      sources: ['bs-club-jfs', 'bs-club-speed', E] },
    { id: 'club80', name: 'Club 80cm', group: 'BS Club & Schools', body: 'bs-club',
      heightCm: 80, maxHeightCm: 80, spreadCm: 80, tripleBarCm: 95, speedMpm: 300,
      efforts: [8, 12], minCombos: 1, scale: 'pony',
      sources: ['bs-club-jfs', 'bs-club-speed', E] },
    { id: 'club90', name: 'Club 90cm', group: 'BS Club & Schools', body: 'bs-club',
      heightCm: 90, maxHeightCm: 90, spreadCm: 100, tripleBarCm: 115, speedMpm: 300,
      efforts: [8, 12], minCombos: 1, scale: 'both',
      sources: ['bs-club-jfs', 'bs-club-speed', E] },
    { id: 'club100', name: 'Club 1.00m', group: 'BS Club & Schools', body: 'bs-club',
      heightCm: 100, maxHeightCm: 100, spreadCm: 110, tripleBarCm: 125, speedMpm: 300,
      efforts: [10, 12], minCombos: 1, scale: 'both',
      sources: ['bs-club-jfs', 'bs-club-speed', E] },
    { id: 'jfs110', name: 'Just for Schools 1.10m', group: 'BS Club & Schools', body: 'bs-club',
      heightCm: 110, maxHeightCm: 110, spreadCm: 120, tripleBarCm: 135, speedMpm: 300,
      efforts: [10, 12], minCombos: 2, scale: 'both',
      sources: ['bs-club-jfs', 'bs-club-speed', E] },

    /* ---- British Showjumping: the junior/pony named classes. ---- */
    { id: 'new-recruits', name: 'New Recruits', group: 'BS on ponies', body: 'bs',
      heightCm: 60, maxHeightCm: 65, spreadCm: 60, tripleBarCm: 70, speedMpm: 325,
      efforts: [6, 10], minCombos: 0, scale: 'pony', sources: ['bs-junior', E] },
    { id: 'bn-junior', name: 'British Novice (junior)', group: 'BS on ponies', body: 'bs',
      heightCm: 80, maxHeightCm: 90, spreadCm: 80, tripleBarCm: 95, speedMpm: 325,
      efforts: [8, 12], minCombos: 1, scale: 'pony',
      sources: ['bs-junior', 'bs-leeway', E] },
    { id: 'discovery-junior', name: 'Discovery (junior)', group: 'BS on ponies', body: 'bs',
      heightCm: 90, maxHeightCm: 100, spreadCm: 100, tripleBarCm: 115, speedMpm: 325,
      efforts: [8, 12], minCombos: 1, scale: 'pony',
      sources: ['bs-junior', 'bs-leeway', E] },
    { id: 'newcomers-junior', name: 'Newcomers (junior)', group: 'BS on ponies', body: 'bs',
      heightCm: 100, maxHeightCm: 110, spreadCm: 110, tripleBarCm: 125, speedMpm: 350,
      efforts: [10, 12], minCombos: 2, scale: 'pony',
      sources: ['bs-junior', 'bs-leeway', E] },
    { id: 'foxhunter-junior', name: 'Foxhunter (junior)', group: 'BS on ponies', body: 'bs',
      heightCm: 110, maxHeightCm: 120, spreadCm: 120, tripleBarCm: 135, speedMpm: 350,
      efforts: [10, 12], minCombos: 2, scale: 'pony',
      sources: ['bs-junior', 'bs-leeway', E] },

    /* ---- Pony height categories. From the BS Talent Pathway document, so these
            are Home Pony trial heights rather than the general class table. ---- */
    { id: 'pony128', name: '128cm ponies', group: 'Pony height classes', body: 'bs',
      heightCm: 105, maxHeightCm: 105, spreadCm: 110, tripleBarCm: 125, speedMpm: 325,
      efforts: [10, 12], minCombos: 2, scale: 'pony',
      note: 'For ponies up to 128cm (12.2hh).', sources: ['bs-pathway-pony', E] },
    { id: 'pony138', name: '138cm ponies', group: 'Pony height classes', body: 'bs',
      heightCm: 115, maxHeightCm: 115, spreadCm: 120, tripleBarCm: 135, speedMpm: 350,
      efforts: [10, 12], minCombos: 2, scale: 'pony',
      note: 'For ponies up to 138cm (13.2hh).', sources: ['bs-pathway-pony', E] },
    { id: 'pony148', name: '148cm ponies', group: 'Pony height classes', body: 'bs',
      heightCm: 120, maxHeightCm: 120, spreadCm: 130, tripleBarCm: 145, speedMpm: 350,
      efforts: [10, 12], minCombos: 2, scale: 'pony',
      note: 'For ponies up to 148cm (14.2hh).', sources: ['bs-pathway-pony', E] },

    /* ---- British Showjumping: the main ladder. ---- */
    { id: 'british-novice', name: 'British Novice', group: 'British Showjumping', body: 'bs',
      heightCm: 90, maxHeightCm: 100, spreadCm: 100, tripleBarCm: 115, speedMpm: 325,
      efforts: [10, 12], minCombos: 1, scale: 'horse',
      note: '0.90m first round. Grade C horses that have won under 125 points.',
      sources: ['bs-ladder', 'bs-leeway', E] },
    { id: 'discovery', name: 'Discovery', group: 'British Showjumping', body: 'bs',
      heightCm: 100, maxHeightCm: 110, spreadCm: 110, tripleBarCm: 125, speedMpm: 325,
      efforts: [10, 12], minCombos: 1, scale: 'horse',
      note: 'Under 225 points.', sources: ['bs-ladder', 'bs-leeway', E] },
    { id: 'newcomers', name: 'Newcomers', group: 'British Showjumping', body: 'bs',
      heightCm: 110, maxHeightCm: 120, spreadCm: 120, tripleBarCm: 135, speedMpm: 350,
      efforts: [10, 12], minCombos: 2, scale: 'horse',
      note: 'Under 375 points.', sources: ['bs-ladder', 'bs-leeway', E] },
    { id: 'national115', name: 'National 1.15m', group: 'British Showjumping', body: 'bs',
      heightCm: 115, maxHeightCm: 115, spreadCm: 125, tripleBarCm: 140, speedMpm: 350,
      efforts: [10, 12], minCombos: 2, scale: 'horse',
      note: 'Members Cup qualifier.', sources: ['bs-ladder', E] },
    { id: 'foxhunter', name: 'Foxhunter', group: 'British Showjumping', body: 'bs',
      heightCm: 120, maxHeightCm: 130, spreadCm: 130, tripleBarCm: 145, speedMpm: 350,
      efforts: [10, 13], minCombos: 2, scale: 'horse',
      note: '1.20m first round, rising to 1.30m in the second round. Under 700 points.',
      sources: ['bs-ladder', 'bs-leeway', E] },
    { id: 'open120', name: 'Open 1.20m', group: 'British Showjumping', body: 'bs',
      heightCm: 120, maxHeightCm: 125, spreadCm: 130, tripleBarCm: 145, speedMpm: 350,
      efforts: [10, 13], minCombos: 2, scale: 'horse', sources: ['bs-ladder', E] },
    { id: 'open130', name: 'Open 1.30m', group: 'British Showjumping', body: 'bs',
      heightCm: 130, maxHeightCm: 135, spreadCm: 145, tripleBarCm: 160, speedMpm: 375,
      efforts: [10, 13], minCombos: 2, scale: 'horse', sources: ['bs-ladder', E] },
    { id: 'open140', name: 'Open 1.40m', group: 'British Showjumping', body: 'bs',
      heightCm: 140, maxHeightCm: 145, spreadCm: 160, tripleBarCm: 180, speedMpm: 375,
      efforts: [11, 13], minCombos: 2, scale: 'horse', sources: ['bs-ladder', E] }
  ];

  const BODIES = {
    'unaffiliated': { name: 'Unaffiliated / schooling', short: 'Home' },
    'ponyclub': { name: 'The Pony Club', short: 'PC' },
    'bs-club': { name: 'British Showjumping — Club & Just for Schools', short: 'BS Club' },
    'bs': { name: 'British Showjumping', short: 'BS' }
  };

  const DEFAULT_LEVEL_ID = 'pc80';

  function level(id) { return LEVELS.find(l => l.id === id) || null; }
  function levelGroups() {
    const order = [];
    const byGroup = new Map();
    for (const l of LEVELS) {
      if (!byGroup.has(l.group)) { byGroup.set(l.group, []); order.push(l.group); }
      byGroup.get(l.group).push(l);
    }
    return order.map(name => ({ name, levels: byGroup.get(name) }));
  }

  return {
    BCB_LEVELS: LEVELS,
    BCB_BODIES: BODIES,
    BCB_DEFAULT_LEVEL: DEFAULT_LEVEL_ID,
    bcbLevel: level,
    bcbLevelGroups: levelGroups
  };
});
