/* Bea's Course Builder — provenance register.

   Every governing-body figure in this app carries a source id from this file so
   the Reference screen can show where a number came from and how much to trust
   it. This matters because the machine that built this app could not reach
   britishshowjumping.co.uk, pcuk.org or inside.fei.org (the network blocked
   them), so no official rulebook PDF was ever read directly.

   confidence:
     'official'  read from a governing body's own page
     'pdf'       extracted from an official PDF via a search summary; the number
                 is probably right but its article and context are unverified
     'secondary' reputable equestrian media, venue or retailer restating a rule
     'community' coaching blog, forum or trade catalogue — convention, not rule
     'estimate'  our own sensible default; no source claims this figure

   Anything below 'official'/'pdf' is a starting default the rider may edit, and
   the app must word its warnings as advice rather than as a rule. */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else Object.assign(root, api);
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  const SOURCES = {
    'bs-ladder': {
      confidence: 'secondary',
      body: 'British Showjumping',
      what: 'Class ladder and first-round heights (British Novice to Foxhunter)',
      where: 'Horse & Hound, Eland Lodge and The Saddle Bank guides to BS levels',
      url: 'https://www.horseandhound.co.uk/features/starting-affiliated-showjumping-34835',
      checked: '2026-08-23'
    },
    'bs-junior': {
      confidence: 'secondary',
      body: 'British Showjumping',
      what: 'Junior/pony named classes (New Recruits through junior Foxhunter)',
      where: 'The Saddle Bank / Eland Lodge',
      url: 'https://www.elandlodge.com/blogs/blog/the-british-showjumping-levels-explained',
      checked: '2026-08-23'
    },
    'bs-pathway-pony': {
      confidence: 'pdf',
      body: 'British Showjumping',
      what: 'Pony height-category fence heights (128 / 138 / 148cm)',
      where: 'BS International Teams and Talent Pathway PDF. NOTE: a talent-pathway '
        + 'document, so these are Home Pony trial heights, not the general pony '
        + 'class table in the Members Handbook (which we could not open).',
      url: 'https://www.britishshowjumping.co.uk/_files/International%20Teams%20and%20Talent%20Pathway.pdf',
      checked: '2026-08-23'
    },
    'bs-club-jfs': {
      confidence: 'official',
      body: 'British Showjumping',
      what: 'Club and Just for Schools class heights (0.70-1.10m)',
      where: 'BS Just for Schools membership page',
      url: 'https://www.britishshowjumping.co.uk/membership/just-for-schools-membership',
      checked: '2026-08-23'
    },
    'bs-club-speed': {
      confidence: 'pdf',
      body: 'British Showjumping',
      what: 'Club & Schools time allowed based on 300 m/min',
      where: 'BS Club and schools rules, April 2018. Probably superseded by the '
        + 'current Club & JFS Member Handbook, which we could not open.',
      url: 'https://britishshowjumping.co.uk/_files/Club%20and%20schools%20rules%20updated%20April%202018%20.pdf',
      checked: '2026-08-23'
    },
    'bs-leeway': {
      confidence: 'community',
      body: 'British Showjumping',
      what: 'Roughly 10cm of build leeway at the course builder’s discretion',
      where: 'Horse & Hound forum discussion — riders’ experience, not a published rule',
      url: 'https://forums.horseandhound.co.uk/threads/bsja-class-heights.329206/',
      checked: '2026-08-23'
    },
    'pc-heights': {
      confidence: 'pdf',
      body: 'The Pony Club',
      what: 'PC70 / PC80 / PC90 Area competition heights and second-round singles',
      where: 'Pony Club Show Jumping rulebook via search summary. The course '
        + 'dimension tables are on pp. 47-48 of the 2026 book, which we could not open.',
      url: 'https://pcuk.org/sports/showjumping/',
      checked: '2026-08-23'
    },
    'pc-speed': {
      confidence: 'pdf',
      body: 'The Pony Club',
      what: 'Speeds: PC70 325, PC80/PC90 350, PC100 375 m/min',
      where: 'Pony Club rules via search summary — but surfaced in an Arena Eventing '
        + 'context, so verify against the Show Jumping rulebook before relying on it.',
      url: 'https://pcuk.org/sports/showjumping/',
      checked: '2026-08-23'
    },
    'pc-course': {
      confidence: 'pdf',
      body: 'The Pony Club',
      what: '12 fences including a double and a treble; minimum 8 fences with a '
        + 'double in some first rounds; no three-stride distances; at least five '
        + 'strides before and after a combination',
      where: 'Pony Club rulebook / Barrier Spring Festival rules via search summary',
      url: 'https://www.ponyclubresults.co.uk/uploads/events/4867/THE-BARRIER-SPRING-FESTIVAL-2025-ENGWAL-ALL-RULES-final.pdf',
      checked: '2026-08-23'
    },
    'pc-2026': {
      confidence: 'official',
      body: 'The Pony Club',
      what: '2026 changes: water trays in the second round for PC80 Areas; course '
        + 'dimensions slightly adjusted',
      where: 'Pony Club 2026 rulebook updates news item',
      url: 'https://pcuk.org/news/2026-rulebook-updates-a-look-across-the-pony-club-sports/',
      checked: '2026-08-23'
    },
    'fei-combination': {
      confidence: 'pdf',
      body: 'FEI',
      what: 'Combination elements must be 7.00-12.00m apart; outside that range '
        + 'they count as separate obstacles',
      where: 'FEI Jumping Rules via search summary',
      url: 'https://inside.fei.org/sites/default/files/Jumping_Rules_2025_clean.pdf',
      checked: '2026-08-23'
    },
    'fei-course-length': {
      confidence: 'pdf',
      body: 'FEI',
      what: 'Maximum course length = number of obstacles x 60m',
      where: 'FEI Jumping Rules via search summary',
      url: 'https://inside.fei.org/sites/default/files/Jumping_Rules_2025_clean.pdf',
      checked: '2026-08-23'
    },
    'fei-start-finish': {
      confidence: 'pdf',
      body: 'FEI',
      what: 'Start and finish lines 6-15m from the first and last obstacle; red '
        + 'flag right, white flag left',
      where: 'FEI Jumping Rules via search summary',
      url: 'https://inside.fei.org/sites/default/files/Jumping_Rules_2025_clean.pdf',
      checked: '2026-08-23'
    },
    'fei-arena': {
      confidence: 'pdf',
      body: 'FEI',
      what: 'Indoor arena minimum 1200 m2 with a 25m short side; outdoor minimum '
        + '4000 m2 with a 50m short side',
      where: 'FEI Jumping Rules via search summary. These are international (CSI) '
        + 'minimums, far larger than any home school.',
      url: 'https://inside.fei.org/sites/default/files/Jumping_Rules_2025_clean.pdf',
      checked: '2026-08-23'
    },
    'fei-water': {
      confidence: 'pdf',
      body: 'FEI',
      what: 'Water jump maximum spread 4.00m',
      where: 'FEI Jumping Rules via search summary',
      url: 'https://inside.fei.org/sites/default/files/Jumping_Rules_2025_clean.pdf',
      checked: '2026-08-23'
    },
    'arena-uk-practice': {
      confidence: 'secondary',
      body: 'UK arena builders',
      what: 'Common UK arena sizes: 20x40 small dressage, 20x60 large dressage, '
        + '30x60 typical jumping training arena (8-10 obstacles)',
      where: 'Day Equestrian, Combi-Ride, Horse & Hound arena guides',
      url: 'https://dayequestrian.co.uk/planning-your-arena-and-surface/',
      checked: '2026-08-23'
    },
    'stride-horse': {
      confidence: 'community',
      body: 'Coaching convention',
      what: 'Horse canter stride 3.6m (12ft); course-design convention 12ft, '
        + 'reduced to about 10ft for ponies',
      where: 'wehorse, grey-mare.co.uk, Essex Equestrian',
      url: 'https://www.wehorse.com/en/blog/showjumping-distances/',
      checked: '2026-08-23'
    },
    'stride-pony': {
      confidence: 'community',
      body: 'Coaching convention',
      what: 'Pony canter stride about 3.0m; reduce lines by 0.6-0.9m per stride '
        + 'against horse distances',
      where: 'wehorse pony tables (148cm), strides.co.nz pony calculators',
      url: 'https://www.wehorse.com/en/blog/showjumping-distances/',
      checked: '2026-08-23'
    },
    'takeoff-landing': {
      confidence: 'community',
      body: 'Coaching convention',
      what: 'Allow about 6ft (1.83m) to land after a fence and 6ft to take off at '
        + 'the next, so a related distance = 1.83 + (n x stride) + 1.83',
      where: 'Schneider Saddlery, grey-mare.co.uk',
      url: 'https://www.sstack.com/blogs/how-tos/how-to-measure-strides-between-jumps',
      checked: '2026-08-23'
    },
    'paces': {
      confidence: 'community',
      body: 'Coaching convention',
      what: 'Walking a distance: about 4 human paces to a 12ft horse stride, 3.5 '
        + 'to a 10ft pony stride (a pace of roughly 0.9m / 3ft)',
      where: 'grey-mare.co.uk, Essex Equestrian',
      url: 'http://grey-mare.co.uk/articles/showjumping/setting-show-jump-distances.shtm',
      checked: '2026-08-23'
    },
    'poles-pony': {
      confidence: 'community',
      body: 'Pony Magazine',
      what: 'Ground pole spacings by pony height: 14.2hh trot 1.00-1.10m and one '
        + 'canter stride 2.10-2.40m; 13.2hh 0.90-1.00 / 2.00-2.20m; 12.2hh '
        + '0.80-0.90 / 1.80-2.00m',
      where: 'Pony Magazine jumping strides guide',
      url: 'https://www.ponymag.com/pony-know-how/jumping-strides-guides/',
      checked: '2026-08-23'
    },
    'poles-general': {
      confidence: 'community',
      body: 'Coaching convention',
      what: 'Trot poles about 1.2m apart for a horse; bounce fences 3.0-3.7m; a '
        + 'placing pole 1.8-2.7m in front of a cross pole',
      where: 'Equisense, Riding Warehouse, Horse & Rider gridwork articles',
      url: 'https://blog.equisense.com/en/poles-distance/',
      checked: '2026-08-23'
    },
    'fence-types': {
      confidence: 'secondary',
      body: 'Equestrian media',
      what: 'Fence vocabulary and shapes; descending oxers are prohibited by the FEI '
        + 'because they deceive the horse’s eye',
      where: 'Kentucky Three-Day Event visual guide, Equi Supermarket, ReiterWelt',
      url: 'https://www.kentuckythreedayevent.com/types-of-showjumping-jumps-a-visual-guide',
      checked: '2026-08-23'
    },
    'bcb-estimate': {
      confidence: 'estimate',
      body: "Bea's Course Builder",
      what: 'Our own default where no source could be found — most often a fence '
        + 'spread, since the British Showjumping "Heights and Spreads of '
        + 'Obstacles" table was unreachable. Edit these freely.',
      where: 'Chosen to be sensible and safe, not authoritative',
      url: '',
      checked: '2026-08-23'
    }
  };

  /* Figures we could NOT establish. Shown on the Reference screen so the gaps are
     visible rather than silently filled in. */
  const UNVERIFIED = [
    'The British Showjumping "Heights and Spreads of Obstacles" table — every spread in this app is an estimate.',
    'British Showjumping minimum arena dimensions, indoor and outdoor.',
    'British Showjumping obstacle counts, jumping efforts and minimum combinations per class.',
    'British Showjumping speeds in m/min per class (we only have 300 m/min for Club & Schools, from 2018).',
    'The general pony-class height table in the BS Members Handbook, as distinct from the Talent Pathway heights.',
    'Whether British Showjumping recognises cross-pole or 40-50cm classes at all.',
    'The Pony Club 2026 course dimension tables on pp. 47-48.',
    'Standard UK pole length and jump cup spacing — trade sources disagree (3.0m / 3.5m / 3.66m).'
  ];

  function source(id) { return SOURCES[id] || null; }
  function confidenceOf(id) { const s = SOURCES[id]; return s ? s.confidence : 'estimate'; }

  return { BCB_SOURCES: SOURCES, BCB_UNVERIFIED: UNVERIFIED, bcbSource: source, bcbConfidence: confidenceOf };
});
