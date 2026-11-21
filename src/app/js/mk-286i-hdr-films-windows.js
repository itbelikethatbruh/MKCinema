
'use strict';
/* ---- HDR films in the Windows app's player: HDR on HDR screens (and converted on others), or always converted ---- */
{
  const sec = secById('playback'), win = () => !!(window.MKDesktop && MKDesktop.platform === 'windows' && window.MkNative && MkNative.bridge());
  if (sec) {
    const rows = sec.rows;
    sec.rows = () => [...rows(), ...(win() ? [{ key: 'hdrMap', label: 'HDR films', help: 'Automatic shows HDR films in HDR on an HDR screen and converts them on others. If they look dim or washed out with Windows HDR on, pick Always normal colour.', type: 'select', options: [['auto', 'Automatic'], ['sdr', 'Always normal colour']], get: () => (CFG.hdrMap === 'sdr' ? 'sdr' : 'auto'), set: (v) => { setCfg('hdrMap', v); if (MkNative.active) MkNative.cmd('tonemap', v === 'sdr' ? 'sdr' : 'auto').catch(() => {}); } }] : [])];
  }
}
