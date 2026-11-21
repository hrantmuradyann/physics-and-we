/* ============================================================================
   theme.js — the three themes of the public site: dark, light and simple.

   YOU DO NOT NEED TO READ THIS FILE TO EDIT THE WEBSITE.
   The colours of every theme are in  css/style.css .

   HOW IT WORKS
     The light theme is simply the class "theme-light" on the <html> tag,
     the simple one the class "theme-simple" (dark has no class).
     css/style.css gives every colour variable another value under each
     class, so the whole site changes at once; css/simple.css adds the
     simple theme's serif type and square, effect-free look.

     This file is loaded in the <head>, before the page is drawn, so a
     visitor who chose another theme never sees a flash of the dark one.
     The choice is remembered, like the language.

   OTHER SCRIPTS
     Theme.current            "dark", "light" or "simple"
     Theme.next()             the theme the header's button switches to
     Theme.toggle()           switch to it: dark -> light -> simple -> dark
     "theme:changed" event    fired after a switch — js/home.js and
                              js/labs.js use it to recolour their drawings
   ========================================================================== */
(function (global) {
  "use strict";

  var THEMES = ["dark", "light", "simple"];   // in the button's order
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
    document.documentElement.classList.toggle("theme-simple", theme === "simple");
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

  // The theme after the current one, back to the first after the last.
  function nextTheme() {
    var index = THEMES.indexOf(theme);
    return THEMES[(index + 1) % THEMES.length];
  }

  global.Theme = {
    get current() { return theme; },
    set: setTheme,
    next: nextTheme,
    toggle: function () {
      setTheme(nextTheme());
    }
  };
})(window);
