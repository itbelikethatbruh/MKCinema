
'use strict';
/* 2.93 "Why this one" names more of what Smart Play weighed: your own server, your audio language, your first-choice
   addon and the source you picked last time for this show. Only facts the app already has; nothing is guessed. */
(function () {
  if (typeof SourceCheck === 'undefined' || typeof SourceCheck.why !== 'function') return;
  const why = SourceCheck.why.bind(SourceCheck);
  SourceCheck.why = function (s) {
    const base = why(s), pre = [], post = [];
    try {
      if (s && s._srv) pre.push('from your own server');
      const want = [CFG.srAudio, CFG.audioOnly].find((x) => x && x !== 'any');
      if (want && typeof AudioPref !== 'undefined') { const l = AudioPref.langs(s); if (l.langs.has(want)) pre.push('in your audio language'); else if (l.multi) pre.push('several audio languages'); }
      if (CFG.pinAddon && s._addon === CFG.pinAddon) post.push('your first-choice addon');
      const memo = typeof PickMemo !== 'undefined' && typeof D === 'object' ? PickMemo.get(D.meta) : null;
      if (memo && memo.a && s._addon === memo.a && (!memo.r || (s._tel && s._tel.res === memo.r))) post.push('like the source you picked last time');
    } catch (e) { /* the plain reasons still show */ }
    return [...pre, base, ...post].filter(Boolean).join(' · ');
  };
})();
