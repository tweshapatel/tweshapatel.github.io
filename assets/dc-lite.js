/* dc-lite: a tiny runtime that renders the page template with its Component logic.
   Holes {{a.b}}, <sc-if value>, <sc-for list as>, onClick handlers, state + re-render. */
(function () {
  var tplEl = document.getElementById('dc-tpl');
  var root = document.getElementById('dc-root');
  var src = document.getElementById('dc-logic').textContent;
  var pending = null, callbacks = [];

  function DCLogic() { this.state = {}; this.props = {}; }
  DCLogic.prototype.set = function (o) { Object.assign(this.state, o); schedule(); };
  DCLogic.prototype.setState = function (o, cb) { Object.assign(this.state, o); schedule(cb); };
  window.DCLogic = DCLogic;

  var Component = new Function(src + '\nreturn Component;')();
  var comp = new Component();

  function get(scope, path) {
    var parts = path.trim().split('.'), o = scope;
    for (var i = 0; i < parts.length; i++) { if (o == null) return undefined; o = o[parts[i]]; }
    return o;
  }
  function holeOf(str) { var m = /^\s*\{\{([^}]+)\}\}\s*$/.exec(str || ''); return m ? m[1] : null; }
  function sub(str, scope) {
    return str.replace(/\{\{([^}]+)\}\}/g, function (_, p) {
      var v = get(scope, p); return (v == null || typeof v === 'function') ? '' : String(v);
    });
  }
  function truthy(v) { return Array.isArray(v) ? v.length > 0 : !!v; }

  function walk(node, scope) {
    var kids = Array.prototype.slice.call(node.childNodes);
    for (var i = 0; i < kids.length; i++) {
      var ch = kids[i];
      if (ch.nodeType === 3) { if (ch.nodeValue.indexOf('{{') > -1) ch.nodeValue = sub(ch.nodeValue, scope); continue; }
      if (ch.nodeType !== 1) continue;
      var tag = ch.tagName.toLowerCase();
      if (tag === 'sc-if') {
        var hv = holeOf(ch.getAttribute('value'));
        if (hv && truthy(get(scope, hv))) { walk(ch, scope); unwrap(ch); } else ch.parentNode.removeChild(ch);
        continue;
      }
      if (tag === 'sc-for') {
        var list = get(scope, holeOf(ch.getAttribute('list')) || '') || [];
        var as = ch.getAttribute('as') || 'item', frag = document.createDocumentFragment();
        for (var j = 0; j < list.length; j++) {
          var s = Object.create(scope); s[as] = list[j]; s.index = j;
          var box = ch.cloneNode(true); walk(box, s);
          while (box.firstChild) frag.appendChild(box.firstChild);
        }
        ch.parentNode.replaceChild(frag, ch);
        continue;
      }
      var attrs = Array.prototype.slice.call(ch.attributes);
      for (var k = 0; k < attrs.length; k++) {
        var a = attrs[k];
        if (/^on[a-z]/i.test(a.name)) {
          var fn = get(scope, holeOf(a.value) || '');
          if (typeof fn === 'function') ch.__h = fn;
          ch.removeAttribute(a.name);
        } else if (/^hint-/.test(a.name)) {
          ch.removeAttribute(a.name);
        } else if (a.value.indexOf('{{') > -1) {
          ch.setAttribute(a.name, sub(a.value, scope));
        }
      }
      walk(ch, scope);
    }
  }
  function unwrap(el) { var p = el.parentNode; while (el.firstChild) p.insertBefore(el.firstChild, el); p.removeChild(el); }

  function morph(a, b) {
    if (a.nodeType !== b.nodeType || a.nodeName !== b.nodeName) { a.parentNode.replaceChild(b, a); return; }
    if (a.nodeType !== 1) { if (a.nodeValue !== b.nodeValue) a.nodeValue = b.nodeValue; return; }
    var i, at;
    for (i = a.attributes.length - 1; i >= 0; i--) { at = a.attributes[i]; if (!b.hasAttribute(at.name)) a.removeAttribute(at.name); }
    for (i = 0; i < b.attributes.length; i++) { at = b.attributes[i]; if (a.getAttribute(at.name) !== at.value) a.setAttribute(at.name, at.value); }
    a.__h = b.__h;
    morphKids(a, b);
  }
  function morphKids(a, b) {
    var ac = Array.prototype.slice.call(a.childNodes), bc = Array.prototype.slice.call(b.childNodes), i;
    for (i = 0; i < bc.length; i++) { if (i < ac.length) morph(ac[i], bc[i]); else a.appendChild(bc[i]); }
    for (i = bc.length; i < ac.length; i++) a.removeChild(ac[i]);
  }

  function render() {
    pending = null;
    var vals = comp.renderVals();
    var box = document.createElement('div');
    box.appendChild(document.importNode(tplEl.content, true));
    walk(box, vals);
    morphKids(root, box);
    var cbs = callbacks; callbacks = [];
    cbs.forEach(function (cb) { try { cb(); } catch (e) {} });
  }
  function schedule(cb) {
    if (typeof cb === 'function') callbacks.push(cb);
    if (!pending) pending = (window.requestAnimationFrame || setTimeout)(render);
  }

  root.addEventListener('click', function (e) {
    var el = e.target;
    while (el && el !== root) {
      if (el.__h) { if (el.tagName === 'A' && (el.getAttribute('href') || '#') === '#') e.preventDefault(); el.__h.call(el, e); return; }
      el = el.parentNode;
    }
  });

  render();
})();
