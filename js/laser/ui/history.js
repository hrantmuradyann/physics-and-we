/* ============================================================================
   history.js — what the plot remembers: the newest points of the
   simulation, { t, P, y } (simulated seconds, output power in W, inversion
   over threshold).

     var h = LaserUI.history.create(4096);
     h.push(t, P, y);        adds a point; a full history drops its oldest.
                             Times must not go back (page.js clears the
                             history on Reset, the only time t does)
     h.points(fromTime)      copies of the points at or after fromTime, oldest first
     h.last()                the newest point, or null
     h.size()   h.clear()

   Times, not pixels: a resize or a new slow-motion setting changes only how
   the points are drawn. A fixed size (a ring buffer): a long visit never
   makes it grow.

   Tests: tests/laser/history.test.js
   ========================================================================== */
(function (root) {
  "use strict";

  var UI = root.LaserUI = root.LaserUI || {};

  function create(capacity) {
    if (typeof capacity !== "number" || !isFinite(capacity) || capacity < 1 ||
        Math.floor(capacity) !== capacity) {
      throw new Error("LaserUI.history.create: the size must be a whole number of at least 1, got " +
        capacity + ".");
    }
    var times = new Array(capacity);
    var powers = new Array(capacity);
    var inversions = new Array(capacity);
    var next = 0;            // where the next point goes
    var count = 0;

    // Where the i-th point is kept, counting from the oldest.
    function indexOf(i) {
      return (next - count + i + capacity) % capacity;
    }

    function pointAt(i) {
      var index = indexOf(i);
      return { t: times[index], P: powers[index], y: inversions[index] };
    }

    return Object.freeze({
      push: function (t, P, y) {
        times[next] = t;
        powers[next] = P;
        inversions[next] = y;
        next = (next + 1) % capacity;
        if (count < capacity) count += 1;
      },
      points: function (fromTime) {
        // The times are in order, so walk back from the newest point to the
        // first one before fromTime: a frame copies only what the plot
        // shows, not the whole buffer (stage-6 review).
        var first = count;
        while (first > 0 && times[indexOf(first - 1)] >= fromTime) first -= 1;
        var list = [];
        for (var i = first; i < count; i++) list.push(pointAt(i));
        return list;
      },
      last: function () {
        return count ? pointAt(count - 1) : null;
      },
      size: function () {
        return count;
      },
      clear: function () {
        next = 0;
        count = 0;
      }
    });
  }

  UI.history = Object.freeze({ create: create });
})(this);
