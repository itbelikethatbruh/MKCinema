
/* ---------------- 2.55 Welcome tour, in depth ----------------
   Drake (2026-11-07): the tour summed everything up on one screen and went to Home. Now every feature gets its own
   screen between "Your player" and "From Stremio", in five chapters: Addons & sources, Watching, Discover, Together
   and Yours. Each screen has a small drawn preview of the feature, what it does, three points on how it works and
   where to find it. A contents screen comes first, and "Skip the features" (top bar) jumps to the setup part.
   Skip still ends the tour. Features this device or build does not have are left out (TV, browser, 2.55 modules).
   Nothing scrolls: Tour240.fit() measures every screen. Motion is transform and opacity only; none on TVs. */
const TourDeep = {
  CH: [['addons', 'Addons & sources'], ['watch', 'Watching'], ['discover', 'Discover'], ['together', 'Together'], ['yours', 'Yours']],
  // features that arrive in their own blocks (top-level consts, so no window.* and no eval under the CSP)
  has(n) {
    switch (n) {
      case 'Sensory': return typeof Sensory !== 'undefined';
      case 'GlPlayer': return typeof GlPlayer !== 'undefined';
      case 'Cams': return typeof Cams !== 'undefined';
      case 'WatchStats': return typeof WatchStats !== 'undefined';
      case 'RmInfo': return typeof RmInfo !== 'undefined';
      case 'Friends': return typeof Friends !== 'undefined' && !Friends.kids();
      default: return false;
    }
  },
  // ---- real screenshots of the app, one per screen (tour/<art>.webp, 1120 x 700, captured from the live app) ----
  img(name) { return `tour/${name}.webp`; },
  preload(i) { const s = TOUR[i]; if (s && s.td && !s._pre) { s._pre = new Image(); s._pre.decoding = 'async'; s._pre.src = this.img(s.td.art); } },
  // ---- the feature screens ----
  list() {
    const tv = IS_TV;
    const has = (n) => this.has(n);
    const F = [
      { id: 'addons', ch: 'addons', t: 'It starts with addons', art: 'addons',
        lede: 'MKCinema has no library of its own. Add the Stremio addons you trust, and everything they offer becomes rows on Home, film pages and sources to play.',
        pts: [['search', 'Find addons', 'Search the community list from Addons and install most of them in one press.'], ['link', 'Paste any link', 'An install link or setup page works too. Paste it again with new settings to update it.'], ['smartphone', 'Set up from your phone', tv ? 'Scan the code on the Addons screen and type links and settings on your phone.' : 'On a TV, scan the code and type links and settings on your phone instead.']],
        where: 'Addons, the puzzle button in the menu' },
      { id: 'health', ch: 'addons', t: 'Addon health check', art: 'addons',
        lede: 'When things feel slow, one press tells you why. MKCinema tests every addon you use and explains, in plain words, which one is slow, broken or needs a new key.',
        pts: [['gauge', 'Real timings', 'How long each addon takes to answer, tested with well-known films and shows.'], ['key-round', 'Key and setup problems', 'Spots an expired key or an addon that still needs setting up.'], ['wrench', 'Fixes in one press', 'Turn off the slow one, move it down, or keep one copy of a duplicate.']],
        where: 'Addons › Check my addons' },
      { id: 'smartplay', ch: 'addons', t: 'Smart Play', art: 'smartplay',
        lede: 'Press Play once. MKCinema looks across every source your addons found and starts the best one that is ready, following your own quality and language rules.',
        pts: [['zap', 'Ready sources first', 'Cached files and your preferred quality are tried before anything else.'], ['refresh-cw', 'Switches by itself', 'If a source stalls or has no picture, the next one takes over at the same line.'], ['shield-check', 'Source Check', 'Samples, archives, password-locked files and wrong episodes are kept out.']],
        where: 'Play, on any film or episode page' },
      { id: 'sources', ch: 'addons', t: 'Every source, side by side', art: 'sources',
        lede: 'Prefer to choose yourself? Every source gets the same tidy labels for quality, HDR, sound, size and whether it is ready, whichever addon found it.',
        pts: [['filter', 'Filter and sort', 'Only HDR or Atmos, biggest or smallest first.'], ['layers', 'No repeats', 'The same file found by several addons is shown once.'], ['sliders-horizontal', 'Your rules', 'Lowest resolution, file size, HDR, audio language and words to block.']],
        where: 'Sources on a film page · Settings › Source rules' },
      { id: 'player', ch: 'watch', t: 'A player made for films', art: 'player',
        lede: 'Edge to edge, with everything in four tabs: Playback, Picture, Audio and More. It remembers your speed for each title and your subtitle timing for each file.',
        pts: [['skip-forward', 'Skip intro, recap and credits', 'And the next episode is found a few minutes early, so it starts right away.'], ['volume-2', 'Sound that suits the room', 'Clear voices, Night, audio delay and volume up to 200 %.'],
          tv ? ['tv', 'Smooth on a TV', 'In the Android TV app, the TV player uses the TV’s own hardware for MKV, HEVC, HDR and Dolby Vision.'] : ['hand', 'Phone gestures', 'Hold for 2× speed, swipe for brightness and volume, swipe sideways to seek.']],
        where: 'Start anything, then Options' },
      { id: 'subtitles', ch: 'watch', t: 'Subtitles that line up', art: 'subtitles',
        lede: 'Subtitles from all your addons arrive as one list without repeats, with the ones made for your exact file first.',
        pts: [['captions', 'They sync themselves', 'A downloaded subtitle is matched to the file. A drag strip fixes the rest.'], ['languages', 'Always your language', 'None in your language? The best one is translated line by line and marked Translated.'], ['type', 'Styled anime subtitles', 'Fonts, signs and karaoke stay as they were made, with Signs & Songs for dubs.']],
        where: 'Subtitles in the player · Settings › Subtitles' },
      { id: 'xray', ch: 'watch', t: 'X-Ray and cast pages', art: 'xray',
        lede: 'Pause and the screen tells you who is in the scene. Tap a face for their photo, life story and every film they have made.',
        pts: [['users', 'Cast pages', 'Every actor, director and writer has a page with their photo, story and full filmography.'], ['scissors', 'Which cut is this?', 'Worked out from the length and the release name, with how sure it is.'], ['activity', 'Shape of the film', 'A curve of how much is said across the film. Tap it to jump. It shows no plot.']],
        where: 'Pause the player' },
      { id: 'lines', ch: 'watch', t: 'Find a line', art: 'lines',
        lede: 'MKCinema follows the dialogue. Type a few words someone says and play from that exact moment.',
        pts: [['history', 'Never miss a line', 'After a pause, playback picks up at the start of the sentence.'], ['replace', 'Same line on any source', 'Resuming or switching sources lands on the line you left, even on another version.'], ['share-2', 'Share this moment', 'A link that opens a friend’s MKCinema at the same line, on their own source.']],
        where: 'Player › More, or on a film page' },
      { id: 'comfort', ch: 'watch', t: 'Watch your way', art: 'comfort',
        lede: 'Small things that make a big difference, from late nights to learning a language.',
        pts: [
          has('Sensory') && ['waves', 'Sensory-friendly', 'Sudden bangs are softened and flashing light is dimmed as it happens, on your device.'],
          !tv && ['audio-lines', 'Sound from another source', 'Keep the picture you like and play a dub from another release, kept in step.'],
          ['graduation-cap', 'Learn mode', 'Tap any word in the subtitles to translate it, and keep a list of your words.'],
          ['signal', 'Slow internet mode', 'Smaller versions come first and the player loads further ahead.'],
          ['timer', 'A gentle sleep timer', 'It waits for a pause in the dialogue, then fades out.'],
        ].filter(Boolean).slice(0, 3),
        where: 'Player › Options · Settings › Playback' },
      { id: 'glasses', ch: 'watch', t: 'Subtitles on smart glasses', art: 'glasses', when: () => has('GlPlayer'),
        lede: 'Read the subtitles in your glasses instead of on the screen, in step with the film. Handy for a second language, or when the picture is busy.',
        pts: [['eye', 'Even Realities G1 and G2, Brilliant Labs Frame', 'Pick yours and they connect over Bluetooth, straight from the phone remote.'], ['link', 'Meta Ray-Ban Display', 'Copy a link into the Meta AI app once, and your glasses show the lines.'], ['moon', 'Dark phone', 'The phone goes dark while the glasses read, with size and timing one tap away.']],
        logos: [['rayban', 'Ray-Ban', 1], ['meta', 'Meta'], ['even', 'Even Realities', 1], ['brilliant', 'Brilliant Labs', 1]],
        where: tv ? 'Phone remote › Subtitles on this phone › Glasses' : 'Phone remote › Subtitles on this phone › Glasses · Player › More › Glasses' },
      { id: 'home', ch: 'discover', t: 'A Home that’s yours', art: 'home',
        lede: 'Continue watching, your watchlist, a Top 10 you can set by country, network, category or year, Peak Cinema, networks, Universes and rows from every addon.',
        pts: [['rows-3', 'Arrange Home', 'Hide, move or rename any row, addon catalogs included. Each seat keeps its own.'], ['tv', 'Your apps', 'Pick the streaming services you already pay for. Their films get a Watch on button.'], ['film', 'Peak Cinema', 'Can’t decide? Surf ninety-second scenes by mood, then keep watching from that second. Needs a debrid service.']],
        where: 'Settings › Home' },
      { id: 'picks', ch: 'discover', t: 'Your Picks', art: 'picks',
        lede: 'A For you row worked out on this device from what you watch and the favorites you pick in a moment. Your taste never leaves it.',
        pts: [['search', 'Ask in plain words', 'Type something like “a cosy mystery for tonight” in search.'], ['sparkles', 'More like this', 'Every film and series page ends with similar titles.'], ['trophy', 'Rows with a point of view', 'Hidden gems, award winners, under 90 minutes and a decade of the day.']],
        where: 'Your Picks row on Home · Settings › Your Picks' },
      { id: 'universes', ch: 'discover', t: 'Universes', art: 'universes',
        lede: '142 franchises, from superheroes to Middle-earth, each with every film in release order and its own title logo.',
        pts: [['orbit', 'Eight groups', 'Superheroes, sci-fi, action, horror, animation, anime, comedy and more.'], ['network', 'Networks', 'Real network logos open everything from that network.'], ['list', 'See all', 'Every universe on one page when you want to browse.']],
        where: 'Universes row on Home' },
      { id: 'title', ch: 'discover', t: 'Everything about a title', art: 'title',
        lede: 'Every film and series page brings together the trailer, the cast, scores and where it is streaming in your region.',
        pts: [['star', 'Scores from other sites', 'TMDB, Rotten Tomatoes, Metacritic, Trakt and Letterboxd next to IMDb, with a free MDBList key.'], ['globe', 'Where to watch', 'The services that have it in your region, with no key needed.'], ['eye-off', 'Spoiler Guard', 'Hides the synopsis of episodes you haven’t seen yet.']],
        logos: [['imdb', 'IMDb'], ['themoviedatabase', 'TMDB'], ['rottentomatoes', 'Rotten Tomatoes'], ['metacritic', 'Metacritic'], ['letterboxd', 'Letterboxd']],
        where: 'Open any poster' },
      { id: 'live', ch: 'discover', t: 'Live TV and Split Screen', art: 'live',
        lede: 'Bring your own playlist, Xtream login or channel addons, with a full guide grid and search.',
        pts: [['layout-grid', 'Split Screen', tv ? 'Two channels or streams at once. Sound follows the one you pick.' : 'Up to four channels or streams at once, two on phones. Sound follows the tile you pick.'], ['trophy', 'Sports', 'Live sports from your own sources, sorted by sport.'], ['radio', 'MK Channel', 'Switch on and something is already playing, made from your progress and watchlist.']],
        where: 'Live TV in the menu' },
      { id: 'anime', ch: 'discover', t: 'Anime', art: 'anime',
        lede: 'Its own section with Trending, Airing now, Most popular and Top rated, filled by your addons.',
        pts: [['fast-forward', 'Skip openings and endings', 'With any addon, on every episode.'], ['refresh-ccw', 'AniList and MyAnimeList', 'Your progress updates as you watch.'], ['palette', 'The Anime look', 'Manga frames and Kitsune, an animated mascot. Switch it on right on the Anime page.']],
        where: 'Anime in the menu' },
      { id: 'party', ch: 'together', t: 'Watch party', art: 'party',
        lede: 'Share a six-letter code and watch in sync, with chat, reactions and push-to-talk voice. The film dips while people talk.',
        pts: [['waypoints', 'Any version', 'Friends can use different releases. Everyone is lined up by the dialogue.'], ['rewind', 'Catch up to the room', 'Late? Catch up at 1.5× with subtitles and rejoin by yourself.'],
          has('Cams') ? ['camera', 'Party cameras', 'See each other, or use a phone as the TV’s camera. Video goes straight between your devices.'] : ['headphones', 'Voice on your phone', 'Talk through your phone while the film plays on the TV.'], ['mic-vocal', 'Watch-along', 'Record your own commentary and share it. It lines up with anyone’s copy.']],
        where: 'Settings › Devices › Watch party' },
      { id: 'friends', ch: 'together', t: 'Social Hub', art: 'friends', when: () => has('Friends'),
        lede: 'Post updates and how you feel, tag friends with @, react and reply. See who is online, chat, start a watch party together and earn trophies.',
        pts: [['users', 'Only people you accept', 'Requests need your OK. Remove or block anyone, any time, without them being told.'], ['messages-square', 'A feed just for friends', 'Posts, moods, reactions, replies and @tags, seen only by friends you accepted.'], ['trophy', 'Profiles and trophies', 'A bio, four favourites and a trophy case. Friends see what you watch only if you share it.']],
        where: 'Social Hub, the speech-bubble button in the menu' },
      { id: 'remote', ch: 'together', t: 'Your phone is the remote', art: 'remote',
        lede: 'Scan the TV’s code and your phone becomes a touchpad, keyboard and voice search. The TV asks before a new phone can take control.',
        pts: [['headphones', 'Listen on phone', 'The film plays on the TV, the sound in your headphones.'], ['subtitles', 'Subtitles on your phone', 'Everyone reads their own language, in step with the TV.'], ['monitor-smartphone', 'Take it with you', 'Leaving the room? The film carries on on your phone at the same line.'], ['languages', 'Hear it in your language', 'A dub plays on your phone while the TV keeps its sound for the room.']],
        where: 'Settings › Devices' },
      { id: 'phoneinfo', ch: 'together', t: 'Cast and details on your phone', art: 'phoneinfo', when: () => has('RmInfo'),
        lede: 'Tap what’s on the TV in the phone remote to see its story, cast, crew, episodes and where to watch, without stopping the film.',
        pts: [['users', 'Anyone’s whole career', 'Tap an actor for their life and full filmography, then any title they made, as deep as you like.'], ['search', 'Explore', 'Find any film, show or person from your phone.'], ['tv', 'Send it to the TV', 'Show on TV, Trailer and Watchlist, with one tap.']],
        where: 'Phone remote › Details' },
      { id: 'ask', ch: 'together', t: 'Meet Miko, your assistant', art: 'ask', when: () => has('RmInfo'),
        lede: 'Tap Miko in the bottom-right corner of any screen, or on the phone remote, then say or type what you want: “play Dune”, “who’s in this?”, “films with Zendaya”, “pause”, “subtitles off”. Free, with no account.',
        pts: [['mic', 'Talk or type', 'Everyday commands are understood right on your phone, with no account.'], ['play', 'Play anything', 'Ask for a film, an episode, a trailer or anyone’s films, and it opens on the TV.'], ['key', 'Free AI, if you like', 'Ask for “something like…” and she picks fitting titles. Add a free Groq or Gemini key in her settings to talk in your own words, and turn on her natural voice.']],
        logos: [['claude', 'Claude'], ['openai', 'OpenAI']],
        where: 'The bottom-right corner, or Phone remote › Miko' },
      { id: 'couch', ch: 'together', t: 'Couch match and Film night', art: 'couch',
        lede: 'No more scrolling for an hour. Everyone swipes on their own phone, and the first title you all like plays on the TV.',
        pts: [['popcorn', 'Film night', 'Seats take turns picking. Tonight’s shortlist goes to a vote on your phones.'], ['users', 'Or straight to a party', 'Send the pick to a watch party for friends who aren’t in the room.'], ['smartphone', 'No app to install', 'Phones join with the camera, in the browser.']],
        where: 'Your Picks row · Settings › Devices · Settings › Playback' },
      { id: 'seats', ch: 'together', t: 'A seat for everyone', art: 'seats',
        lede: 'Everyone in the house gets their own watchlist, progress, picks and languages, with a picture and an optional PIN.',
        pts: [['lock', 'Kids seats', 'Only titles for their age, and a grown-up PIN to leave.'], ['timer', 'Shows per day', 'A daily limit that stops at the end of an episode, never mid-scene.'], ['hand-helping', 'Family Helper', 'Whoever set things up can help from their phone, and you always see when they do.']],
        where: 'Settings › Seats' },
      { id: 'library', ch: 'yours', t: 'Library and sync', art: 'library',
        lede: 'Watchlist, In progress, Watched and your own lists, with addon lists as tabs too. Sign in and it all follows you to every screen.',
        pts: [['calendar-days', 'Airing calendar', 'New episodes of the series you follow, with alerts checked on your own device.'], ['refresh-ccw', 'Trakt and Simkl', 'What you watch is scrobbled as you go, plus AniList and MyAnimeList for anime.'], ['save', 'Backup code', 'Addons, settings, watchlist and progress in one code.']],
        logos: [['trakt', 'Trakt'], ['simkl', 'Simkl'], ['anilist', 'AniList'], ['myanimelist', 'MyAnimeList']],
        where: 'Library in the menu · Settings › Trakt & Simkl' },
      { id: 'stats', ch: 'yours', t: 'Your stats and ticket stubs', art: 'stats',
        lede: 'Your top films and shows, time watched, genres, streaks and who you watch with, for this month, this year or all time.',
        pts: [['bar-chart-3', 'Per seat, on this device', 'Nothing is uploaded. Save it as a picture to share.'], ['ticket', 'Ticket stubs', 'Every film you finish keeps a stub with the date, the seat and who was there.'], ['calendar', 'When you watch', 'Your busiest day, your longest sitting and your best streak.']],
        where: 'Library › Your stats · Settings › Playback', when: () => has('WatchStats') },
      { id: 'downloads', ch: 'yours', t: 'Downloads and your own servers', art: 'downloads',
        lede: tv ? 'Download films and episodes to the TV or a USB drive, and watch them with no internet.' : 'Save films and episodes in the Android and Windows apps, and watch them with no internet.',
        pts: [['server', 'Plex, Jellyfin and Emby', 'Films on your own media server show up as sources next to your addons.'], ['monitor-down', 'From your computer to your TV', 'The Windows app shares its downloads with your TV over home Wi-Fi.'], ['cloud-off', 'Opens offline', 'MKCinema starts without a connection, with your downloads ready.']],
        logos: [['plex', 'Plex'], ['jellyfin', 'Jellyfin'], ['emby', 'Emby']],
        where: 'Library › Downloads · Settings › Media servers' },
      { id: 'looks', ch: 'yours', t: 'Make it look like yours', art: 'looks',
        lede: 'Five looks, from Noir to Anime, and a colour wheel that tints the whole app.',
        pts: [['type', 'Fonts and text size', 'Nine type styles, and a size that reads well from the sofa.'], ['languages', 'Twelve languages', 'From English and Español to हिन्दी, Tamil and Samoan.'], ['blocks', 'Plugins & themes', 'A reviewed, signed gallery. Every file is checked before it runs.']],
        where: 'Settings › Appearance' },
    ];
    return F.filter((f) => !f.when || f.when());
  },
  // ---- "works with" logos (nominative use only) and a quiet note that we are not affiliated ----
  // Files live in tour/logos/<key>.svg|webp (TourDeep.HAVE is filled by patch.py). A third item of 1 marks a wordmark,
  // shown on its own; a key without a file shows its name only. Wording matches the website's glasses row.
  HAVE: ['anilist.svg','brilliant.webp','claude.svg','emby.svg','even.svg','imdb.svg','jellyfin.svg','letterboxd.svg','meta.svg','metacritic.svg','myanimelist.svg','openai.svg','plex.svg','rayban.webp','rottentomatoes.svg','simkl.svg','themoviedatabase.svg','trakt.svg'],
  logos(list) {
    const file = (k) => this.HAVE.find((f) => f.replace(/\.(svg|webp)$/, '') === k);
    const names = list.map(([, n]) => n), all = names.length > 1 ? `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}` : names[0];
    return `<div class="td-logos" role="list" aria-label="Works with">${list.map(([k, n, wm]) => { const f = file(k);
      return `<span class="td-logo${wm && f ? ' wm' : ''}" role="listitem">${f ? `<img src="tour/logos/${f}" alt="${wm ? n : ''}" decoding="async">` : ''}${wm && f ? '' : `<b>${n}</b>`}</span>`; }).join('')}</div>
      <p class="td-legal">${all} names and logos are trademarks of their owners and show compatibility only. MKCinema isn’t affiliated with, sponsored by or endorsed by them.</p>`;
  },
  // ---- one screen ----
  screen(f, n, of) {
    const chName = (this.CH.find(([k]) => k === f.ch) || [])[1] || '';
    return `<div class="td" data-ch="${f.ch}">
      <div class="td-art" aria-hidden="true"><img src="${this.img(f.art)}" alt="" width="1120" height="700" decoding="async"></div>
      <div class="td-copy">
        <span class="tw-kicker td-k">${chName}<em>${n} of ${of}</em></span>
        <h2 class="tw-h td-h">${f.t}</h2>
        <p class="td-lede">${f.lede}</p>
        <ul class="td-pts">${f.pts.map(([i, t, s], k) => `<li style="--k:${k}"><span class="t4-ic"><i data-lucide="${i}" aria-hidden="true"></i></span><div><b>${t}</b><span>${s}</span></div></li>`).join('')}</ul>
        <p class="td-where"><i data-lucide="compass" aria-hidden="true"></i><span><b>Find it</b>${f.where}</span></p>
        ${f.logos ? this.logos(f.logos) : ''}
      </div>
    </div>`;
  },
  map(list) {
    const by = this.CH.map(([k, name]) => [name, list.filter((f) => f.ch === k)]).filter(([, l]) => l.length);
    return `<div class="tw-sec td-map"><span class="tw-kicker">The tour</span><h2 class="tw-h">Here’s what’s ahead</h2>
      <p class="td-lede">${list.length} short screens, one for each part of MKCinema, with where to find it. Go at your own pace, or skip straight to setting up.</p>
      <ol class="td-chs">${by.map(([name, l], i) => `<li style="--k:${i}"><em>${String(i + 1).padStart(2, '0')}</em><div><b>${name}</b><span>${l.map((f) => f.t).join(' · ')}</span></div></li>`).join('')}</ol>
      <button type="button" class="btn btn-ghost btn-sm td-jump" data-td-skip data-nav><i data-lucide="fast-forward"></i>Skip the features</button></div>`;
  },
  // ---- wiring ----
  init() {
    if (typeof TOUR === 'undefined' || typeof Tour240 === 'undefined' || this._on) return;
    const at = TOUR.findIndex((s) => s.id === 'inside'); if (at < 0) return;
    this._on = true;
    const list = this.list(), self = this;
    const steps = [{ id: 'td-map', html: () => this.map(list) }].concat(list.map((f) => {
      const same = list.filter((x) => x.ch === f.ch);
      return { id: `td-${f.id}`, td: f, html: () => self.screen(f, same.indexOf(f) + 1, same.length) };
    }));
    TOUR.splice(at, 1, ...steps);
    Tour240.CHAPTER['td-map'] = 'The tour';
    list.forEach((f) => { Tour240.CHAPTER[`td-${f.id}`] = (this.CH.find(([k]) => k === f.ch) || [])[1]; });
    // where "Skip the features" lands: the first step after the last feature
    const after = () => { let i = -1; TOUR.forEach((s, k) => { if (/^td-/.test(s.id)) i = k; }); return Math.min(TOUR.length - 1, i + 1); };
    this.jump = () => { const to = after(); if (to > tourIdx) tourGo(to - tourIdx); };
    const tour = $('#tour'), top = tour && $('.tour-top', tour), skip = $('#tourSkip');
    if (top && skip && !$('#tdSkip', top)) skip.insertAdjacentHTML('beforebegin', '<button class="linkish td-skipf" type="button" id="tdSkip" hidden>Skip the features</button>');
    const sf = $('#tdSkip'); if (sf) sf.onclick = () => this.jump();
    const render = window.renderTour;
    window.renderTour = function () {
      render.apply(this, arguments);
      const st = TOUR[tourIdx] || {}, inTd = /^td-/.test(st.id || ''), b = $('#tourBody');
      if (sf) sf.hidden = !inTd || st.id === 'td-map';
      if (b) b.classList.toggle('td-on', inTd);
      self.preload(tourIdx + 1);
      if (tour) tour.classList.toggle('td-tour', inTd && st.id !== 'td-map');
      if (st.id === 'td-map') { $('#tourNext').innerHTML = 'Show me<i data-lucide="chevron-right"></i>'; const j = $('[data-td-skip]', b); if (j) j.onclick = () => self.jump(); icons(); }
    };
    // tour sounds: Next climbs within each chapter instead of topping out after six steps
    if (typeof TourSound !== 'undefined' && !TourSound._td) {
      TourSound._td = true; const base = TourSound.step.bind(TourSound), FIX = { welcome: 0, player: 1, 'td-map': 2, stremio: 4, taste: 5, ready: 6 };
      TourSound.step = (i) => {
        const s = TOUR[i]; if (!s) return base(i);
        if (s.td) { const same = TOUR.filter((x) => x.td && x.td.ch === s.td.ch); return base(Math.min(6, same.indexOf(s) + 1)); }
        return base(s.id in FIX ? FIX[s.id] : i);
      };
    }
  },
};
// after every block has loaded, so features from later blocks (2.55 cameras, sensory, glasses) are seen
const tdInit = () => { try { TourDeep.init(); } catch (e) { console.warn('Tour in depth:', e); } };
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', tdInit, { once: true }); else tdInit();
