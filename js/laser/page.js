/* ============================================================================
   page.js — builds the laser page (?view=laser) once the router has put
   its layout (sections/laser.html) and words (data/laser.json) on the page.

   It connects the parts and owns nothing else: the physics is in
   js/laser/engine/, the drawing in js/laser/ui/. For now the page shows a
   still picture of the bench, so its loop starts paused and only draws
   when the size or the theme changes; build stage 6 adds the controls,
   the Play button and the simulation.

   WHY IT TAKES ITSELF DOWN FIRST
   The router (js/router.js) fires "section:ready" for this page more often
   than the visitor opens it: once when it quietly builds every page in the
   background (this page is hidden then), and again on every language
   switch. So each time the previous build is taken down first, nothing
   heavy happens while building, and the loop only runs while the canvas
   is on screen (js/laser/ui/loop.js). The build is synchronous (the words
   arrive with the event), so tearing down first is enough; js/labs.js
   also needs a generation counter only because it fetches its words.

   Tests: tests/laser/page.test.js
   ========================================================================== */
(function (root) {
  "use strict";

  var ROUTE = "laser";

  var teardown = null;          // takes the current build down, or null

  // One word from data/laser.json in the visitor's language ("" if missing).
  function word(data, path) {
    return root.Content.inLang(root.Content.valueAt(data, path), root.Site.lang);
  }

  // Builds the page inside the router's container. Returns the function
  // that takes it down again, or null if there is nothing to build (the
  // layout failed to load, so the router put an error message there).
  function build(container, data) {
    var canvas = container.querySelector('[data-laser-canvas="bench"]');
    if (!canvas) return null;

    // The picture's name for screen readers (role="img" is in the layout):
    // its description, or else the page title, as js/labs.js does. With
    // neither, an unnamed picture is worse than none, so it is hidden from
    // screen readers. Set as attributes, so a word is never read as markup.
    var name = word(data, "bench.alt") || word(data, "page.title");
    if (name) {
      canvas.setAttribute("aria-label", name);
      canvas.removeAttribute("aria-hidden");
    } else {
      canvas.removeAttribute("aria-label");
      canvas.setAttribute("aria-hidden", "true");
    }

    var bench = root.LaserUI.bench;
    var labels = {};
    bench.PARTS.forEach(function (part) {
      labels[part] = word(data, "bench.parts." + part);
    });

    var loop = root.LaserUI.loop.create({
      running: false,             // nothing moves yet (stage 6: Play)
      canvases: [{
        canvas: canvas,
        box: canvas.parentNode,
        aspect: bench.SIZE.aspect,
        minHeight: bench.SIZE.minHeight,
        maxHeight: bench.SIZE.maxHeight,
        draw: function (view) { bench.draw(view, labels); }
      }]
    });

    return function () { loop.destroy(); };
  }

  root.addEventListener("section:ready", function (event) {
    var detail = event.detail || {};
    if (detail.route !== ROUTE) return;
    if (teardown) {
      teardown();
      teardown = null;
    }
    if (!detail.container) return;
    teardown = build(detail.container, detail.data || {});
  });
})(this);
