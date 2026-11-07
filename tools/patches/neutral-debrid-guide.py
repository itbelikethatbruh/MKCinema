# MKCinema: the app no longer recommends one debrid service. Get started lets people pick whichever service they use
# (listed alphabetically) and saves and tests that key; the welcome tour and settings labels stop naming TorBox first.
# Dee asked for this on 2026-10-26: he uses TorBox himself but doesn't want MKCinema to read like a TorBox promotion.
# Usage: python3 neutral-debrid-guide.py index.html
import sys
p = sys.argv[1]; s = open(p).read()
def rep(a, b):
    global s
    assert s.count(a) == 1, a[:80]
    s = s.replace(a, b)
rep("""    ['Instant debrid', 'Connect TorBox or Real-Debrid and cached sources start in about a second.'],""",
    """    ['Instant debrid', 'Connect the debrid service you use and cached sources start in about a second.'],""")
rep("""walks you through VLC, a TorBox key and your first addons in about five minutes.""",
    """walks you through VLC, a debrid key and your first addons in about five minutes.""")
rep("""/* ---------------- Get started: VLC, a debrid key (TorBox as the easy pick), sources, an account ---------------- */""",
    """/* ---------------- Get started: VLC, a key for whichever debrid service the user has, sources, an account ---------------- */""")
rep("""    const st = this.steps(), done = Object.values(st).filter(Boolean).length, tb = Vault.cfg().tb || '';""",
    """    const st = this.steps(), done = Object.values(st).filter(Boolean).length, svc = this.svc(), key = Vault.cfg()[svc] || '';""")
a = s.index("""      ${step(2, 'debrid', 'Connect a debrid account <span class="tag-s g">TorBox recommended</span>',""")
b = s.index("""      ${step(3, 'addons',""", a)
s = s[:a] + """      ${step(2, 'debrid', 'Connect a debrid account', `<p>A debrid service turns the torrent links your addons find into fast, direct streams that start instantly. MKCinema works with all the major ones, so use whichever you prefer:</p>
        <ol class="gs-list">
          <li>Pick your service below.</li>
          <li>Copy your API key from <a href="https://${esc(DEBRID[svc].help.split(' ')[0])}" target="_blank" rel="noopener" id="gsKeyLink">${esc(DEBRID[svc].help)}</a>.</li>
          <li>Paste it here and press Save and test.</li>
        </ol>
        <div class="inrow"><select class="inp" id="gsSvc" aria-label="Debrid service">${['ad', 'pm', 'rd', 'tb'].map((k) => `<option value="${k}"${k === svc ? ' selected' : ''}>${esc(DEBRID[k].label)}</option>`).join('')}</select></div>
        <div class="inrow"><input class="inp mono" type="password" id="gsTb" value="${esc(key)}" placeholder="Paste your ${esc(DEBRID[svc].label)} API key" autocomplete="off" spellcheck="false" aria-label="Debrid API key"><button class="btn btn-prime btn-sm" type="button" id="gsTbGo"><i data-lucide="plug-zap"></i>Save and test</button></div>
        <small class="gs-note" id="gsTbSt">${key ? 'Key saved.' : ''} You can add more services later under Settings › Debrid. Your key ${Account.user && CFG.syncKeys !== false ? 'syncs to your account, readable only by you' : 'stays on this device'}.</small>`)}
""" + s[b:]
rep("""  bind() {
    const on = (id, fn) => { const el = $(id); if (el) el.onclick = fn; };
    $$('.gs a[href*="videolan"]""",
    """  // the service shown in the debrid step: the one already saved, else the last one picked here, else the first in the list
  svc() { return Vault.service() || Store.get('guideSvc', '') || 'ad'; },
  bind() {
    const on = (id, fn) => { const el = $(id); if (el) el.onclick = fn; };
    const sel = $('#gsSvc');
    if (sel) sel.onchange = () => {
      const k = sel.value, d = DEBRID[k], inp = $('#gsTb'), a = $('#gsKeyLink');
      Store.set('guideSvc', k); inp.value = Vault.cfg()[k] || ''; inp.placeholder = `Paste your ${d.label} API key`;
      if (a) { a.textContent = d.help; a.href = `https://${d.help.split(' ')[0]}`; }
    };
    $$('.gs a[href*="videolan"]""")
rep("""      const v = $('#gsTb').value.trim(), st = $('#gsTbSt');
      if (!v) { toast('Paste your TorBox API key first', 'err'); return; }
      Vault.save('tb', v); st.textContent = 'Checking the key with TorBox…';
      try { st.textContent = `✓ ${await Vault.test('tb')}`; toast('TorBox connected', 'ok'); setTimeout(() => renderSettingsBody(), 1400); }""",
    """      const k = $('#gsSvc') ? $('#gsSvc').value : this.svc(), d = DEBRID[k], v = $('#gsTb').value.trim(), st = $('#gsTbSt');
      if (!v) { toast(`Paste your ${d.label} API key first`, 'err'); return; }
      Vault.save(k, v); st.textContent = `Checking the key with ${d.label}…`;
      try { st.textContent = `✓ ${await Vault.test(k)}`; toast(`${d.label} connected`, 'ok'); setTimeout(() => renderSettingsBody(), 1400); }""")
rep("""  start: 'VLC, TorBox and your first sources',""", """  start: 'VLC, debrid and your first sources',""")
rep("""debrid: 'TorBox, Real-Debrid, AllDebrid, Premiumize',""", """debrid: 'AllDebrid, Premiumize, Real-Debrid, TorBox',""")
open(p, 'w').write(s); print('patched')
