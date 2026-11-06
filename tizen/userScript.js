/* MKCinema for Samsung TVs (TizenBrew module).
   TizenBrew opens https://mkcinema.pages.dev/ and runs this file in the page. The web app already knows Samsung TVs
   (it reads "Tizen" in the browser's user agent): TV layout, remote navigation, Back (key 10009) and the media keys
   registered in package.json. This file marks the page: window.MKCinemaTizenBrew (the module version) tells the web
   app it runs inside TizenBrew, where window.tizen may be missing, and html.tv turns on the TV layout at once.
   TizenBrew keeps opening mkcinema.pages.dev (websiteURL): the TV's saved sign-in lives on that origin.
   Samsung TVs from 2019-2022 are sent on to tv-legacy.html (the app converted for their older browser); the mark is
   kept in sessionStorage so that page knows it runs inside TizenBrew too. */
(function () {
  try {
    window.MKCinemaTizenBrew = '1.1.0';
    try { sessionStorage.setItem('mkc:tizenbrew', window.MKCinemaTizenBrew); } catch (e) { /* storage blocked */ }
    document.documentElement.classList.add('tv');
  } catch (e) { /* nothing to do */ }
})();
