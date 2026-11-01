(function () {
  "use strict";
  var LIVE = document.documentElement.hasAttribute("data-live");
  var SHOW = {
    spotify: "https://open.spotify.com/show/6es7fmFIA78NqTLom4aF7y",
    spotifyEmbed: "https://open.spotify.com/embed/show/6es7fmFIA78NqTLom4aF7y?utm_source=generator",
    apple: "https://podcasts.apple.com/us/podcast/thats-just-good/id1610464170",
    youtube: "https://www.youtube.com/channel/UCpWWwSa9jsb53tngJoJ1HcA",
    total: 39
  };
  var APPLE_EP = "https://podcasts.apple.com/us/podcast/thats-just-good/id1610464170?i=";

  // Fallback list. The live site replaces this with the feed from /api/episodes on every visit.
  var SEED = [
    ["Lynn McBee - Leading Where You're Needed", "2026-10-01", 39, "1000792557730", ""],
    ["Laura Harris - More Than a Story", "2026-08-28", 48, "1000786509218", "Nick sits down with Emmy Award-winning journalist and NBC 5 Today co-anchor Laura Harris on how great stories connect us and remind us what's possible."],
    ["Rami Rassas - When Passion Becomes the Plan", "2026-08-21", 39, "1000784838564", "What happens when the career you've built is successful, but you know you're meant to be doing something else? Nick talks with North Texas entrepreneur Rami Rassas."],
    ["Carson Gibbons - Turning Connections into Community", "2026-08-12", 38, "1000782956536", "What if the most valuable thing you could build in your career was relationships?"],
    ["LaDondra Wilson - Full Court Purpose", "2026-07-31", 45, "1000779299095", ""],
    ["Charlie Welch - Turning Music Into a Movement for Good", "2026-06-18", 28, "1000773319519", ""],
    ["The New Tax Rules for Businesses That Give Back", "2026-06-03", 14, "1000771022846", ""],
    ["Gene Mance Jr. - Leadership, Culture, and the Power of Connection", "2026-05-27", 27, "1000769859172", ""],
    ["Jennifer Haworth - Where Brand Strategy Meets Community Impact", "2026-05-20", 34, "1000768821818", ""],
    ["Making Impact Cool Again", "2026-05-13", 12, "1000767572417", ""],
    ["Misaki Collins - The Assist Behind Community Change", "2026-05-08", 25, "1000766796705", ""],
    ["Ryan Wood: Shaping Impact Through Media and Influence", "2026-04-22", 36, "1000763060216", ""]
  ].map(function (r) {
    return { title: r[0], date: r[1] + "T12:00:00", minutes: r[2], link: APPLE_EP + r[3], desc: r[4], audio: "" };
  });

  function $(s, root) { return (root || document).querySelector(s); }
  function $$(s, root) { return Array.prototype.slice.call((root || document).querySelectorAll(s)); }
  function el(tag, cls, text) { var e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }

  /* ---------- Navigation ---------- */
  var menuBtn = $(".menu-btn"), nav = $(".nav");
  if (menuBtn && nav) {
    menuBtn.addEventListener("click", function () {
      var open = nav.classList.toggle("open");
      menuBtn.setAttribute("aria-expanded", open ? "true" : "false");
      menuBtn.textContent = open ? "Close" : "Menu";
    });
    $$("a", nav).forEach(function (a) { a.addEventListener("click", function () { nav.classList.remove("open"); menuBtn.setAttribute("aria-expanded", "false"); menuBtn.textContent = "Menu"; }); });
  }

  // Single-file preview: one page at a time, routed by #hash
  var spa = document.querySelector("[data-spa]");
  if (spa) {
    var pages = $$("[data-page]", spa);
    var names = pages.map(function (p) { return p.getAttribute("data-page"); });
    var show = function () {
      var h = (location.hash || "").replace("#", "");
      var anchor = null, name = "home";
      if (names.indexOf(h) > -1) name = h;
      else if (h && (anchor = document.getElementById(h)) && anchor.closest("[data-page]")) name = anchor.closest("[data-page]").getAttribute("data-page");
      var current = spa.querySelector("[data-page].active");
      if (anchor && current && current.getAttribute("data-page") === name) return;
      pages.forEach(function (p) { p.classList.toggle("active", p.getAttribute("data-page") === name); });
      $$(".nav a").forEach(function (a) {
        var target = (a.getAttribute("href") || "").replace("#", "") || "home";
        if (target === name) a.setAttribute("aria-current", "page"); else a.removeAttribute("aria-current");
      });
      var t = { home: "That's Just Good", "team-building": "Team Building", community: "Community Events", kids: "Kids Events", podcast: "Podcast", about: "About", contact: "Contact" }[name];
      if (t && name !== "home") document.title = t + " | That's Just Good"; else document.title = "That's Just Good";
      if (anchor) anchor.scrollIntoView();
      else if (h && names.indexOf(h) > -1) window.scrollTo(0, 0);
    };
    window.addEventListener("hashchange", show);
    show();
  }

  $$("[data-year]").forEach(function (n) { n.textContent = new Date().getFullYear(); });
  if (!LIVE) $$("[data-live-only]").forEach(function (n) { n.hidden = true; });

  /* ---------- Copy email ---------- */
  $$("[data-copy]").forEach(function (b) {
    b.addEventListener("click", function () {
      var text = b.getAttribute("data-copy");
      var done = function () { var o = b.textContent; b.textContent = "Copied"; setTimeout(function () { b.textContent = o; }, 1600); };
      var fallback = function () {
        var code = b.parentNode.querySelector("code");
        if (code) { var r = document.createRange(); r.selectNodeContents(code); var s = window.getSelection(); s.removeAllRanges(); s.addRange(r); }
      };
      try { navigator.clipboard.writeText(text).then(done, fallback); } catch (e) { fallback(); }
    });
  });

  /* ---------- Forms (Netlify Forms on the live site) ---------- */
  $$("form[data-form]").forEach(function (form) {
    var status = $(".form-status", form) || form.nextElementSibling;
    form.addEventListener("submit", function (ev) {
      ev.preventDefault();
      if (!form.checkValidity()) { form.reportValidity(); return; }
      if (!LIVE) {
        status.textContent = "This is a preview. On thatsjustgood.com, this form goes straight to your inbox.";
        return;
      }
      var btn = $("button[type=submit]", form); if (btn) btn.disabled = true;
      fetch("/", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams(new FormData(form)).toString() })
        .then(function (r) { if (!r.ok) throw new Error(r.status); form.reset(); status.textContent = form.getAttribute("data-thanks") || "Thanks! We got your message and will be in touch soon."; })
        .catch(function () { status.textContent = "That didn't send. Please email us at dogood@thatsjustgood.com instead."; })
        .then(function () { if (btn) btn.disabled = false; });
    });
  });

  /* ---------- Podcast ---------- */
  function split(title) {
    var m = title.match(/^(.{3,40}?)(?:\s[-–—]\s|:\s)(.+)$/);
    return m ? { guest: m[1].trim(), topic: m[2].trim() } : { guest: "", topic: title };
  }
  function fmt(d) {
    var dt = new Date(d); if (isNaN(dt)) return "";
    return dt.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  }
  function listenLink(ep, label, cls) {
    var a = el("a", "btn small " + (cls || "ghost"), label);
    a.href = ep.link || SHOW.spotify; a.target = "_blank"; a.rel = "noopener";
    return a;
  }
  function playButton(ep, holder) {
    if (!LIVE || !ep.audio) return null;
    var b = el("button", "btn small", "Play");
    b.type = "button";
    b.addEventListener("click", function () {
      $$("audio").forEach(function (x) { x.pause(); });
      var au = holder.querySelector("audio");
      if (!au) { au = el("audio"); au.controls = true; au.preload = "none"; au.src = ep.audio; holder.appendChild(au); }
      au.play();
    });
    return b;
  }
  function findVideo(ep, videos) {
    var g = split(ep.title).guest.toLowerCase();
    if (!g || !videos) return null;
    var last = g.split(" ").slice(-1)[0];
    for (var i = 0; i < videos.length; i++) if (videos[i].title.toLowerCase().indexOf(last) > -1) return videos[i];
    return null;
  }

  function render(data) {
    var eps = data.episodes, videos = data.videos || [];
    if (!eps || !eps.length) return;
    $$("[data-ep-count]").forEach(function (n) { n.textContent = Math.max(eps.length, data.total || 0); });

    // Feature: latest episode
    $$("[data-episodes=feature]").forEach(function (box) {
      var ep = eps[0], s = split(ep.title);
      box.textContent = "";
      var body = el("div", "stack");
      body.appendChild(el("div", "ep-meta", "Latest episode" + (ep.minutes ? " · " + ep.minutes + " min" : "")));
      body.appendChild(el("h3", "", s.guest || s.topic));
      if (s.guest) body.appendChild(el("p", "topic", s.topic));
      if (ep.desc) body.appendChild(el("p", "muted", ep.desc));
      var row = el("div", "btn-row");
      var holder = el("div");
      var play = playButton(ep, holder); if (play) row.appendChild(play);
      row.appendChild(listenLink(ep, LIVE && ep.audio ? "Episode page" : "Listen now", play ? "ghost" : ""));
      var vid = findVideo(ep, videos);
      if (vid) { var y = el("a", "btn small ghost", "Watch on YouTube"); y.href = "https://www.youtube.com/watch?v=" + vid.id; y.target = "_blank"; y.rel = "noopener"; row.appendChild(y); }
      body.appendChild(row); body.appendChild(holder);
      box.appendChild(body);
    });

    // Full list
    $$("[data-episodes=list]").forEach(function (list) {
      var limit = 8, shown = 0;
      list.textContent = "";
      var more = $("[data-more]");
      function add(n) {
        eps.slice(1 + shown, 1 + shown + n).forEach(function (ep) {
          var s = split(ep.title);
          var li = el("li", "ep");
          var t = el("div", "ep-title");
          t.appendChild(el("b", "", s.guest || s.topic));
          t.appendChild(el("span", "", (s.guest ? s.topic : "Solo episode") + (ep.minutes ? " · " + ep.minutes + " min" : "")));
          li.appendChild(t);
          var act = el("div", "ep-actions");
          var holder = el("div");
          var play = playButton(ep, holder); if (play) act.appendChild(play);
          act.appendChild(listenLink(ep, "Listen"));
          li.appendChild(act);
          if (play) { holder.style.gridColumn = "1 / -1"; li.appendChild(holder); }
          list.appendChild(li);
        });
        shown += n;
        if (more) more.hidden = shown >= eps.length - 1;
      }
      add(limit);
      if (more) more.onclick = function () { add(10); };
    });

    // Home teaser: three latest
    $$("[data-episodes=mini]").forEach(function (box) {
      box.textContent = "";
      eps.slice(0, 3).forEach(function (ep) {
        var s = split(ep.title);
        var a = el("a", "mini-ep"); a.href = ep.link || SHOW.spotify; a.target = "_blank"; a.rel = "noopener";
        a.appendChild(el("span", "ep-meta", "New episode" + (ep.minutes ? " · " + ep.minutes + " min" : "")));
        a.appendChild(el("b", "", s.guest || s.topic));
        if (s.guest) a.appendChild(el("span", "", s.topic));
        box.appendChild(a);
      });
    });

    // Live embeds (only on the real site; the preview frame blocks them)
    if (LIVE) {
      $$("[data-embed=spotify]").forEach(function (box) {
        if (box.querySelector("iframe")) return;
        var f = document.createElement("iframe");
        f.src = SHOW.spotifyEmbed; f.height = 352; f.loading = "lazy"; f.title = "That's Just Good on Spotify";
        f.allow = "autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture";
        box.appendChild(f);
      });
    }
  }

  if ($("[data-episodes]") || $("[data-ep-count]")) {
    render({ episodes: SEED, total: SHOW.total });
    if (LIVE) {
      fetch("/api/episodes").then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); })
        .then(function (d) { if (d && d.episodes && d.episodes.length) render(d); })
        .catch(function () { /* keep the fallback list */ });
    }
  }
})();
