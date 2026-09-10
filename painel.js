window.HRC_ESTATICO = true;
/* Painel Hard Rock · comportamento mínimo (abas, ordenação de tabela, anotação).
   Sem biblioteca: a CSP é script-src 'self' e a página abre inteira sem JS.

   O mesmo arquivo serve as duas versões:
   - servidor (FastAPI): roda `init()` ao carregar;
   - estática (GitHub Pages, cifrada): `window.HRC_ESTATICO = true` antes deste código,
     e a casca chama `window.HRC_init()` a cada vez que injeta um mês decifrado. */
(function () {
  "use strict";
  function init() {

  // ----- abas -----
  var tabs = Array.prototype.slice.call(document.querySelectorAll("[data-tab]"));
  var panes = Array.prototype.slice.call(document.querySelectorAll("section.tab"));
  function show(id) {
    if (!document.getElementById("tab-" + id)) { id = tabs.length ? tabs[0].getAttribute("data-tab") : id; }
    panes.forEach(function (p) { p.classList.toggle("show", p.id === "tab-" + id); });
    tabs.forEach(function (t) { t.classList.toggle("active", t.getAttribute("data-tab") === id); });
    try { window.localStorage.setItem("hrc_tab", id); } catch (e) { /* sem storage */ }
  }
  window.__go = function (id) { show(id); window.scrollTo(0, 0); };
  tabs.forEach(function (t) {
    t.addEventListener("click", function (ev) {
      var a = t.querySelector("a");
      var id = t.getAttribute("data-tab");
      if (a) { ev.preventDefault(); }
      show(id);
      // preserva o estado da entrada (a versão publicada guarda nele o mês exibido)
      if (history.replaceState) { history.replaceState(history.state, "", "#" + id); }
      window.scrollTo(0, 0);
    });
  });
  var inicial = (location.hash || "").replace("#", "");
  if (!inicial) { try { inicial = window.localStorage.getItem("hrc_tab") || ""; } catch (e) { inicial = ""; } }
  if (inicial && document.getElementById("tab-" + inicial)) { show(inicial); }
  document.querySelectorAll("[data-go]").forEach(function (el) {
    el.addEventListener("click", function (ev) { ev.preventDefault(); window.__go(el.getAttribute("data-go")); });
  });

  // ----- ordenação de tabelas (th.sortable) -----
  function valor(td) {
    var raw = td.getAttribute("data-v");
    if (raw !== null) { return parseFloat(raw); }
    var t = td.textContent.trim().replace(/R\$\s?/, "").replace(/\./g, "").replace(",", ".").replace("%", "");
    var n = parseFloat(t);
    return isNaN(n) ? td.textContent.trim().toLowerCase() : n;
  }
  document.querySelectorAll("table.sortable").forEach(function (tbl) {
    var ths = tbl.querySelectorAll("thead th");
    ths.forEach(function (th, idx) {
      th.classList.add("sortable");
      th.addEventListener("click", function () {
        var asc = !th.classList.contains("sort-asc");
        ths.forEach(function (o) { o.classList.remove("sort-asc", "sort-desc"); });
        th.classList.add(asc ? "sort-asc" : "sort-desc");
        var body = tbl.querySelector("tbody");
        var rows = Array.prototype.slice.call(body.querySelectorAll("tr"));
        rows.sort(function (a, b) {
          var va = valor(a.children[idx]), vb = valor(b.children[idx]);
          if (typeof va === "number" && typeof vb === "number") { return asc ? va - vb : vb - va; }
          va = String(va); vb = String(vb);
          return asc ? va.localeCompare(vb) : vb.localeCompare(va);
        });
        rows.forEach(function (r) { body.appendChild(r); });
      });
    });
  });

  // ----- anotações (salvas no servidor) -----
  document.querySelectorAll("form.anota").forEach(function (f) {
    f.addEventListener("submit", function (ev) {
      ev.preventDefault();
      var ref = f.getAttribute("data-ref");
      var txt = f.querySelector("textarea").value;
      var msg = f.querySelector(".wf-msg");
      var body = new URLSearchParams(); body.append("texto", txt);
      fetch("/anotacao/" + encodeURIComponent(ref), { method: "POST", body: body, credentials: "same-origin" })
        .then(function (r) { if (!r.ok) { throw new Error(r.status); } msg.textContent = "salvo"; msg.className = "wf-msg ok"; })
        .catch(function () { msg.textContent = "não salvou"; msg.className = "wf-msg err"; });
    });
  });

  // ----- expandir/recolher grupos -----
  document.querySelectorAll("[data-toggle]").forEach(function (el) {
    el.addEventListener("click", function () {
      var alvo = document.querySelectorAll('[data-grp="' + el.getAttribute("data-toggle") + '"]');
      alvo.forEach(function (r) { r.classList.toggle("open"); });
      el.classList.toggle("aberto");
    });
  });
  }  // fim de init()

  window.HRC_init = init;
  if (!window.HRC_ESTATICO) { init(); }
})();


/* ---------- casca da versão publicada: decifra no navegador ---------- */
(function () {
  "use strict";
  // O GitHub Pages não deixa mandar X-Frame-Options nem frame-ancestors:
  // a página se recusa a abrir dentro de moldura de outro site.
  if (window.top !== window.self) { document.documentElement.innerHTML = ""; return; }

  var trava = document.getElementById("trava");
  var app = document.getElementById("app");
  var form = document.getElementById("form-senha");
  var campo = document.getElementById("senha");
  var botao = document.getElementById("entrar");
  var erro = document.getElementById("erro");
  var payload = null, estilo = null, atual = null;

  function b64(s) { var x = atob(s), u = new Uint8Array(x.length); for (var i = 0; i < x.length; i++) { u[i] = x.charCodeAt(i); } return u; }

  async function decifra(senha) {
    var E = window.HRC_ENC;
    if (!E) { throw new Error("sem-dados"); }
    var base = await crypto.subtle.importKey("raw", new TextEncoder().encode(senha), "PBKDF2", false, ["deriveKey"]);
    var chave = await crypto.subtle.deriveKey({ name: "PBKDF2", salt: b64(E.s), iterations: E.it, hash: "SHA-256" },
                                              base, { name: "AES-GCM", length: 256 }, false, ["decrypt"]);
    var claro = await crypto.subtle.decrypt({ name: "AES-GCM", iv: b64(E.iv) }, chave, b64(E.d));
    var fluxo = new Blob([claro]).stream().pipeThrough(new DecompressionStream("gzip"));
    return JSON.parse(await new Response(fluxo).text());
  }

  function abaAtual() { var a = app.querySelector(".site-nav li.active"); return a ? a.getAttribute("data-tab") : ""; }

  // Cada troca de mês vira uma entrada de histórico: o Voltar do navegador (e o gesto
  // de voltar do celular) volta ao mês anterior em vez de sair do painel.
  function mostra(chaveMes, empilha) {
    if (!payload.paginas[chaveMes]) { chaveMes = payload.padrao; }
    var aba = abaAtual();
    var estado = { mes: chaveMes };
    if (empilha) { history.pushState(estado, "", aba ? "#" + aba : location.hash || location.pathname); }
    else if (aba) { history.replaceState(estado, "", "#" + aba); }
    else { history.replaceState(estado, ""); }
    app.innerHTML = payload.paginas[chaveMes];
    atual = chaveMes;
    window.HRC_init();
  }

  window.addEventListener("popstate", function (ev) {
    if (!payload || !ev.state || !ev.state.mes) { return; }
    if (ev.state.mes !== atual) {
      app.innerHTML = payload.paginas[ev.state.mes] || payload.paginas[payload.padrao];
      atual = ev.state.mes;
      window.HRC_init();          // lê o #aba da URL que o navegador acabou de restaurar
    }
  });

  function bloqueia() {
    payload = null; atual = null;
    app.innerHTML = ""; app.hidden = true;
    // init() exporta window.__go, que fecha sobre os nós do mês exibido: sem zerar,
    // a página do último mês continua viva na memória depois de bloquear.
    window.__go = null;
    if (estilo) { estilo.remove(); estilo = null; }
    trava.hidden = false; campo.value = ""; erro.textContent = ""; botao.disabled = false;
    history.replaceState(null, "", location.pathname);
    campo.focus();
  }

  app.addEventListener("click", function (ev) {
    var m = ev.target.closest("[data-mes]");
    if (m) { ev.preventDefault(); if (m.getAttribute("data-mes") !== atual) { mostra(m.getAttribute("data-mes"), true); } window.scrollTo(0, 0); return; }
    if (ev.target.closest("[data-bloquear]")) { ev.preventDefault(); bloqueia(); }
  });

  form.addEventListener("submit", async function (ev) {
    ev.preventDefault();
    if (!window.crypto || !crypto.subtle || typeof DecompressionStream === "undefined") {
      erro.textContent = "Este navegador não decifra o painel. Atualize-o (no iPhone, iOS 16.4 ou mais novo) ou use Chrome, Edge ou Firefox atualizados.";
      return;
    }
    var senha = campo.value;
    if (!senha || botao.disabled) { return; }
    botao.disabled = true; erro.textContent = "Decifrando…";
    try {
      payload = await decifra(senha);
    } catch (e) {
      payload = null; botao.disabled = false; campo.value = ""; campo.focus();
      erro.textContent = (e && e.message === "sem-dados") ? "Os dados do painel não carregaram. Recarregue a página." : "Senha incorreta.";
      return;
    }
    senha = null; campo.value = "";
    estilo = document.createElement("style");
    estilo.textContent = payload.css;
    document.head.appendChild(estilo);
    trava.hidden = true; app.hidden = false; erro.textContent = "";
    mostra(payload.padrao, false);
  });
})();
