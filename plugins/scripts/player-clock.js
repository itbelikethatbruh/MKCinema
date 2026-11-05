// Player clock: shows the time of day and when the film will end, in the corner while something plays.
const box = document.createElement('div');
box.id = 'plgClock';
box.hidden = true;
document.body.appendChild(box);
MK.css('#plgClock{position:fixed;top:calc(18px + env(safe-area-inset-top,0px));right:24px;z-index:120;padding:8px 14px;border-radius:12px;background:rgba(0,0,0,.55);color:#f2f2f3;font:600 15px/1.2 system-ui,sans-serif;pointer-events:none;text-align:right}#plgClock small{display:block;font-weight:500;font-size:12px;color:#c2c2ca}');
const fmt = (d) => d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
const v = document.querySelector('video');
let timer = 0;
const paint = () => {
  const now = new Date();
  const left = v && isFinite(v.duration) ? (v.duration - v.currentTime) / (v.playbackRate || 1) : 0;
  box.innerHTML = `${fmt(now)}${left > 60 ? `<small>Ends at ${fmt(new Date(now.getTime() + left * 1000))}</small>` : ''}`;
};
MK.on('play', () => { box.hidden = false; paint(); clearInterval(timer); timer = setInterval(paint, 15000); });
MK.on('resume', paint);
MK.on('close', () => { box.hidden = true; clearInterval(timer); });
