/* ============================================================================
   theme.js — the dark and the light theme of the public site.

   YOU DO NOT NEED TO READ THIS FILE TO EDIT THE WEBSITE.
   The colours of both themes are in  css/style.css .

   HOW IT WORKS
     The light theme is simply the class "theme-light" on the <html> tag.
     css/style.css gives every colour variable a second, cream value under
     that class, so the whole site changes at once.

     This file is loaded in the <head>, before the page is drawn, so a
     visitor who chose the light theme never sees a flash of the dark one.
     The choice is remembered, like the language.

   OTHER SCRIPTS
     Theme.current            "dark" or "light"
     Theme.toggle()           switch to the other one (the sun / moon button)
     "theme:changed" event    fired after a switch — js/home.js and
                              js/labs.js use it to recolour their drawings
   ========================================================================== */
(function (global) {
  "use strict";

  var THEMES = ["dark", "light"];
  var DEFAULT_THEME = "dark";

  var theme = resolveInitialTheme();
  apply();

  function resolveInitialTheme() {
    var saved = null;
    try { saved = localStorage.getItem("theme"); } catch (e) { /* private mode */ }
    if (saved && THEMES.indexOf(saved) !== -1) return saved;
    return DEFAULT_THEME;
  }

  function apply() {
    document.documentElement.classList.toggle("theme-light", theme === "light");
  }

  function setTheme(next) {
    if (THEMES.indexOf(next) === -1) next = DEFAULT_THEME;
    if (next === theme) return;

    theme = next;
    try { localStorage.setItem("theme", theme); } catch (e) { /* private mode */ }

    // Every colour changes at the same moment. Without this the few parts
    // that fade (the header, the buttons) would lag behind the rest, and for
    // a moment dark text would sit on a still-dark header.
    var root = document.documentElement;
    root.classList.add("theme-switching");      // css/site.css: no fading
    apply();
    void root.offsetWidth;                      // make the browser apply it now
    root.classList.remove("theme-switching");

    global.dispatchEvent(new CustomEvent("theme:changed", { detail: { theme: theme } }));
  }

  global.Theme = {
    get current() { return theme; },
    set: setTheme,
    toggle: function () {
      setTheme(theme === "dark" ? "light" : "dark");
    }
  };
})(window);
