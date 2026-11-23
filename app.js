
(function () {
  'use strict';

  /* RSVP endpoint 

\*/
  var FORM_ENDPOINT = "https://formspree.io/f/mvkavwgg";

  var STORAGE_KEY = "wedding-rsvps";

  function $(sel, root) { return (root || document).querySelector(sel); }
  function $all(sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); }

  function escapeHtml(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  }

  /* localStorage store (this device only)*/
  function loadRSVPs() {
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      var data = raw ? JSON.parse(raw) : [];
      return Array.isArray(data) ? data : [];
    } catch (e) { return []; }
  }
  function saveRSVPs(list) {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(list)); } catch (e) { /* storage unavailable */ }
  }
  function addRSVP(party) {
    var list = loadRSVPs();
    list.push(party);
    saveRSVPs(list);
    return list;
  }

  function partyCounts(party) {
    var attending = party.attending === "yes" ? 1 : 0;
    var declined = party.attending === "yes" ? 0 : 1;
    (party.guests || []).forEach(function (g) {
      if (g.attending === "yes") { attending++; } else { declined++; }
    });
    return { attending: attending, declined: declined, total: attending + declined };
  }

  function getStats(list) {
    var attending = 0, declined = 0;
    list.forEach(function (p) {
      var c = partyCounts(p);
      attending += c.attending;
      declined += c.declined;
    });
    return { parties: list.length, attending: attending, declined: declined };
  }

  /*CSV + summary (used by guest-list.html) */
  function csvCell(v) {
    var s = String(v == null ? "" : v);
    return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  }
  function buildCSV(list) {
    var rows = [["Party", "Guest", "Attending", "Dietary notes", "Submitted"]];
    list.forEach(function (p) {
      var stamp = p.submittedAt || "";
      rows.push([p.primaryName, p.primaryName + " (primary)", p.attending === "yes" ? "Yes" : "No", p.dietary || "", stamp]);
      (p.guests || []).forEach(function (g) {
        rows.push([p.primaryName, g.name, g.attending === "yes" ? "Yes" : "No", "", stamp]);
      });
    });
    return rows.map(function (r) { return r.map(csvCell).join(","); }).join("\r\n");
  }
  function buildSummary(list) {
    var s = getStats(list);
    var lines = [
      "Wedding guest list — " + s.parties + " parties, " +
      s.attending + " attending, " + s.declined + " not attending",
      ""
    ];
    list.forEach(function (p) {
      var c = partyCounts(p);
      lines.push(p.primaryName + " — " + c.attending + " of " + c.total + " attending" +
        (p.dietary ? " (dietary: " + p.dietary + ")" : ""));
    });
    return lines.join("\n");
  }

  /* RSVP form (index.html)*/
  function initRSVP() {
    var form = $("#rsvp-form");
    if (!form) { return; }

    var guestsBox = $("#party-guests");
    var addBtn = $("#add-guest");
    var partyField = $("#party-field");
    var confirmBox = $("#rsvp-confirm");
    var confirmText = $("#confirm-text");
    var confirmHeading = $(".rsvp-confirm h3");

    function addGuestRow(name, attending) {
      var row = document.createElement("div");
      row.className = "party-guest";
      row.innerHTML =
        '<div class="guest-row">' +
          '<input type="text" class="guest-name" placeholder="[Guest full name]" aria-label="Party guest name" value="' + escapeHtml(name || "") + '">' +
          '<button type="button" class="remove-guest" aria-label="Remove this guest">&times;</button>' +
        '</div>' +
        '<select class="guest-attending" aria-label="Is this guest attending?">' +
          '<option value="yes"' + (attending !== "no" ? " selected" : "") + '>Attending</option>' +
          '<option value="no"' + (attending === "no" ? " selected" : "") + '>Not attending</option>' +
        '</select>';
      row.querySelector(".remove-guest").addEventListener("click", function () {
        row.remove();
      });
      guestsBox.appendChild(row);
      return row;
    }

    addBtn.addEventListener("click", function () {
      var row = addGuestRow("", "yes");
      row.querySelector(".guest-name").focus();
    });

    // If the primary guest declines, party guests do not apply.
    $all('input[name="attending"]', form).forEach(function (radio) {
      radio.addEventListener("change", function () {
        if (radio.value === "no" && radio.checked) {
          partyField.style.display = "none";
        } else if (radio.checked) {
          partyField.style.display = "";
        }
      });
    });

    form.addEventListener("submit", function (e) {
      e.preventDefault();
      var nameInput = $("#primary-name");
      var name = nameInput.value.trim();
      if (!name) {
        nameInput.focus();
        nameInput.setAttribute("aria-invalid", "true");
        return;
      }
      var attending = (form.querySelector('input[name="attending"]:checked') || {}).value || "yes";
      var guests = [];
      if (attending === "yes") {
        $all(".party-guest", guestsBox).forEach(function (row) {
          var gName = row.querySelector(".guest-name").value.trim();
          if (!gName) { return; }
          guests.push({ name: gName, attending: row.querySelector(".guest-attending").value });
        });
      }
      var party = {
        primaryName: name,
        email: $("#primary-email").value.trim(),
        attending: attending,
        guests: guests,
        dietary: $("#dietary").value.trim(),
        submittedAt: new Date().toISOString()
      };

      function finish(endpointUsed) {
        // Local backup on this device, always.
        addRSVP(party);
        form.style.display = "none";
        confirmHeading.textContent = "Thank you, " + name.split(" ")[0] + "!";
        if (endpointUsed) {
          confirmText.textContent = attending === "yes"
            ? "Your RSVP has been received — " + (guests.length + 1) + " in your party attending. We can't wait to celebrate with you."
            : "Thank you for letting us know — we'll miss you, and we appreciate the reply.";
        } else {
          // No shared endpoint set yet: say so plainly. The reply is NOT
          // with the couple yet — it is only saved on this device.
          confirmText.textContent = attending === "yes"
            ? "Your reply is saved on this device as a backup, but it has not reached Sadie & Jaron's shared guest list yet — the couple still needs to connect the RSVP form (see the site README, step 3). Please also let them know directly so your place is held."
            : "Your reply is saved on this device as a backup, but it has not reached Sadie & Jaron's shared guest list yet — the couple still needs to connect the RSVP form (see the site README, step 3).";
        }
        confirmBox.classList.add("show");
        confirmBox.scrollIntoView({ behavior: "smooth", block: "center" });
      }

      if (FORM_ENDPOINT) {
        fetch(FORM_ENDPOINT, {
          method: "POST",
          headers: { "Content-Type": "application/json", "Accept": "application/json" },
          body: JSON.stringify(party)
        }).then(function (res) {
          finish(res.ok);
        }).catch(function () {
          finish(false);
        });
      } else {
        finish(false);
      }
    });
  }

  /*Guest list (guest-list.html)
     */

  function formatSubmitted(iso) {
    if (!iso) { return ""; }
    try {
      return new Date(iso).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
    } catch (e) { return ""; }
  }

  function partyStatus(c) {
    if (c.attending === 0) { return "Not attending"; }
    if (c.declined === 0) { return "Attending"; }
    return "Partly attending";
  }

  function initGuestList() {
    var listEl = $("#party-list");
    if (!listEl) { return; }

    var emptyEl = $("#empty-state");
    var searchInput = $("#guest-search");
    var filter = "all";

    function render() {
      var list = loadRSVPs();
      var stats = getStats(list);
      $("#stat-parties").textContent = stats.parties;
      $("#stat-attending").textContent = stats.attending;
      $("#stat-declined").textContent = stats.declined;


      $all(".filter-pill").forEach(function (btn) {
        var f = btn.getAttribute("data-filter");
        var label = f === "attending" ? "Attending" : f === "declined" ? "Not attending" : "All";
        var n = f === "attending" ? stats.attending : f === "declined" ? stats.declined : stats.attending + stats.declined;
        btn.textContent = label + " (" + n + ")";
      });

      var q = searchInput.value.trim().toLowerCase();
      var visible = list.filter(function (p) {
        var hay = (p.primaryName + " " + (p.guests || []).map(function (g) { return g.name; }).join(" ")).toLowerCase();
        if (q && hay.indexOf(q) === -1) { return false; }
        var c = partyCounts(p);
        if (filter === "attending" && c.attending === 0) { return false; }
        if (filter === "declined" && c.attending > 0) { return false; }
        return true;
      });

      emptyEl.style.display = list.length === 0 ? "" : "none";
      listEl.innerHTML = visible.map(function (p) {
        var c = partyCounts(p);
        var status = partyStatus(c);
        var submitted = formatSubmitted(p.submittedAt);
        var people = [{ name: p.primaryName + " (primary)", attending: p.attending }]
          .concat((p.guests || []).map(function (g) { return { name: g.name, attending: g.attending }; }));
        var peopleHtml = people.map(function (person) {
          return "<li>" + escapeHtml(person.name) + " — " +
            (person.attending === "yes" ? "attending" : "not attending") + "</li>";
        }).join("");
        return '<article class="party-card">' +
          "<h3>" + escapeHtml(p.primaryName) + "</h3>" +
          '<p class="party-meta">' + status + " · " + c.attending + " of " + c.total + " attending" +
          (submitted ? " · replied " + escapeHtml(submitted) : "") + "</p>" +
          "<ul style=\"margin:0 0 8px;padding-left:20px;color:var(--ink-soft)\">" + peopleHtml + "</ul>" +
          (p.dietary ? '<p class="party-diet"><strong>Dietary:</strong> ' + escapeHtml(p.dietary) + "</p>" : "") +
          "</article>";
      }).join("");

      if (list.length > 0 && visible.length === 0) {
        listEl.innerHTML = '<div class="empty-state">No parties match that search or filter.</div>';
      }
    }

    searchInput.addEventListener("input", render);
    $all(".filter-pill").forEach(function (btn) {
      btn.addEventListener("click", function () {
        $all(".filter-pill").forEach(function (b) { b.classList.remove("active"); });
        btn.classList.add("active");
        filter = btn.getAttribute("data-filter");
        render();
      });
    });

    $("#export-csv").addEventListener("click", function () {
      var csv = buildCSV(loadRSVPs());
      var blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
      var url = URL.createObjectURL(blob);
      var a = document.createElement("a");
      a.href = url;
      a.download = "guest-list.csv";
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
    });

    $("#copy-summary").addEventListener("click", function () {
      var text = buildSummary(loadRSVPs());
      var btn = this;
      function done(ok) {
        if (ok) {
          btn.textContent = "Copied!";
          setTimeout(function () { btn.textContent = "Copy summary"; }, 2000);
        } else {

          var box = $("#copy-fallback");
          $("#summary-text").value = text;
          box.style.display = "";
          $("#summary-text").focus();
          $("#summary-text").select();
          btn.textContent = "Copy summary";
        }
      }
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(function () { done(true); }, function () { done(false); });
      } else {
        var ta = document.createElement("textarea");
        ta.value = text;
        document.body.appendChild(ta);
        ta.select();
        var ok = false;
        try { ok = document.execCommand("copy"); } catch (e) { ok = false; }
        ta.remove();
        done(ok);
      }
    });

    $("#clear-data").addEventListener("click", function () {
      if (loadRSVPs().length === 0) { return; }
      if (!window.confirm("Clear every RSVP stored on this device? This cannot be undone.")) { return; }
      saveRSVPs([]);
      render();
    });

    render();
  }

  /*Photo slide deck (story.html) */
  function initDeck() {
    var deck = $("#photo-deck");
    if (!deck) { return; }
    var slides = $all(".deck-slide", deck);
    if (slides.length === 0) { return; }
    var prevBtn = $("#deck-prev");
    var nextBtn = $("#deck-next");
    var counter = $("#deck-counter");
    var dotsBox = $("#deck-dots");
    var current = 0;
    var ticking = false;

    var dots = slides.map(function (slide, i) {
      var dot = document.createElement("button");
      dot.type = "button";
      dot.className = "deck-dot";
      dot.setAttribute("role", "tab");
      dot.setAttribute("aria-label", "Photo " + (i + 1) + " of " + slides.length);
      dot.addEventListener("click", function () { goTo(i); });
      dotsBox.appendChild(dot);
      return dot;
    });

    function update(i) {
      current = Math.max(0, Math.min(slides.length - 1, i));
      counter.textContent = (current + 1) + " / " + slides.length;
      dots.forEach(function (dot, j) {
        var active = j === current;
        dot.classList.toggle("active", active);
        dot.setAttribute("aria-selected", active ? "true" : "false");
      });
      prevBtn.disabled = current === 0;
      nextBtn.disabled = current === slides.length - 1;
    }

    function goTo(i) {
      update(i);
      slides[current].scrollIntoView({ behavior: "smooth", inline: "center", block: "nearest" });
    }

    prevBtn.addEventListener("click", function () { goTo(current - 1); });
    nextBtn.addEventListener("click", function () { goTo(current + 1); });
    deck.addEventListener("scroll", function () {
      if (ticking) { return; }
      ticking = true;
      requestAnimationFrame(function () {
        var i = Math.round(deck.scrollLeft / deck.clientWidth);
        update(i);
        ticking = false;
      });
    });
    deck.addEventListener("keydown", function (e) {
      if (e.key === "ArrowLeft") { e.preventDefault(); goTo(current - 1); }
      if (e.key === "ArrowRight") { e.preventDefault(); goTo(current + 1); }
    });
    update(0);
  }

  /* Exposed for testing / debugging in the console. */
  window.Wedding = {
    loadRSVPs: loadRSVPs,
    saveRSVPs: saveRSVPs,
    getStats: getStats,
    buildCSV: buildCSV,
    buildSummary: buildSummary,
    partyCounts: partyCounts
  };

  document.addEventListener("DOMContentLoaded", function () {
    initRSVP();
    initGuestList();
    initDeck();
  });
})();
