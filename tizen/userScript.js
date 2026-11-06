/* MKCinema for Samsung TVs (TizenBrew module).
   TizenBrew opens https://mkcinema.pages.dev/ and runs this file in the page. The web app already knows Samsung TVs
   (it reads "Tizen" in the browser's user agent): TV layout, remote navigation, Back (key 10009) and the media keys
   registered in package.json. This file only marks the page so Settings > Help can tell the TizenBrew app apart. */
(function () {
  try {
    window.MKCinemaTizenBrew = '1.0.0';
    document.documentElement.classList.add('tv');
  } catch (e) { /* nothing to do */ }
})();
