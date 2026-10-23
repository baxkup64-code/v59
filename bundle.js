/******/ (() => { // webpackBootstrap
/******/ 	"use strict";
var __webpack_exports__ = {};
// This entry needs to be wrapped in an IIFE because it uses a non-standard name for the exports (exports).
(() => {
var exports = __webpack_exports__;
/*!*********************************!*\
  !*** ./src/custom/debug_ios.ts ***!
  \*********************************/
var __webpack_unused_export__;

__webpack_unused_export__ = ({ value: true });
// ============================================================
//  Debug-Button  –  iOS-Port (arm64, Binary "laser")
//  Offsets sind RVAs (Adresse in IDA/Ghidra minus Image-Base 0x100000000)
//  NICHT auf dem Geraet getestet!
// ============================================================
const O = {
    StringConstructor: 0xdcfacc, // String(this, const char*)
    LoadAsset: 0x8ab4, // GameMain::loadAsset(String*, bool) - laedt .sc/.csv/.ogg (geprueft: wird mit sc/ui.sc, csv_client/..., sfx/... aufgerufen)
    GetMovieClip: 0xb88b54, // iOS: nur 2 Argumente (sc-Datei, Name)
    GotoAndStop: 0xbc3ee8,
    GetTextFieldByName: 0xbc4f04,
    SetText: 0xbef364,
    SetFontSize: 0xbef314,
    SetMultiline: 0xbef78c, // am wenigsten sicher (Kandidat 2: 0xbef76c)
    SetXY: 0xbbfc7c,
    SetWidth: 0xbc02c0,
    SetHeight: 0xbc0274,
    GetWidth: 0xbc0188,
    GetHeight: 0xbc01f8,
    SpriteAddChild: 0xbd2bec,
    GameButtonCtor: 0x09b900,
    ButtonPressed: 0x09be7c, // vtable-Slot 0x188 der GameButton-Klasse
    TouchBegan: 0x09bde8,
    TouchMoved: 0x09be64,
    TouchEnded: 0x09be50,
    InitVtableOff: 0x160, // btn->vtable[0x160](btn, movieclip, init)
    ButtonText: 0x60, // btn+0x60 -> MovieClip
    ParentOff: 0x38, // child+0x38 -> Parent
};
const log = (...a) => console.log("[DEBUG-iOS]", ...a);
const base = Process.mainModule.base;
function gexport(name) {
    try {
        const m = Module;
        if (typeof m.getGlobalExportByName === "function")
            return m.getGlobalExportByName(name);
    }
    catch (_) { /* fallback */ }
    return Module.findExportByName(null, name);
}
const F = (off) => base.add(off);
const calloc = new NativeFunction(gexport("calloc"), "pointer", ["ulong", "ulong"]);
const stringCtor = new NativeFunction(F(O.StringConstructor), "pointer", ["pointer", "pointer"]);
const loadAsset = new NativeFunction(F(O.LoadAsset), "pointer", ["pointer", "bool"]);
const getMovieClip = new NativeFunction(F(O.GetMovieClip), "pointer", ["pointer", "pointer"]);
const getTF = new NativeFunction(F(O.GetTextFieldByName), "pointer", ["pointer", "pointer"]);
const setText = new NativeFunction(F(O.SetText), "void", ["pointer", "pointer"]);
const setMultiline = new NativeFunction(F(O.SetMultiline), "void", ["pointer", "bool"]);
const getWidth = new NativeFunction(F(O.GetWidth), "float", ["pointer"]);
const getHeight = new NativeFunction(F(O.GetHeight), "float", ["pointer"]);
const setXYraw = new NativeFunction(F(O.SetXY), "void", ["pointer", "float", "float"]);
const setWidth = new NativeFunction(F(O.SetWidth), "void", ["pointer", "float"]);
const setHeight = new NativeFunction(F(O.SetHeight), "void", ["pointer", "float"]);
const addChild = new NativeFunction(F(O.SpriteAddChild), "void", ["pointer", "pointer"]);
const gbCtor = new NativeFunction(F(O.GameButtonCtor), "pointer", ["pointer"]);
const gotoAndStop = new NativeFunction(F(O.GotoAndStop), "void", ["pointer", "int"]); // MovieClip::gotoAndStopFrameIndex (strh [this+0x92])
const setFontSize = new NativeFunction(F(O.SetFontSize), "void", ["pointer", "int"]);
const OWN = new Map();
function ownReg(o, parent) {
    try {
        let par = null;
        if (parent) { // Parent-Check nur, wenn +0x38 nach addChild wirklich auf den Parent zeigt
            const pp = o.add(O.ParentOff).readPointer();
            par = pp.equals(parent) ? parent.toString() : null;
        }
        OWN.set(o.toString(), { vt: o.readPointer().toString(), parent: par, dead: false });
    }
    catch (_) { /* nicht lesbar -> nicht registriert */ }
}
function ownAlive(o) {
    const r = OWN.get(o.toString());
    if (!r)
        return true; // nie registriert (Spiel-Objekt) -> hier nicht zustaendig
    if (r.dead)
        return false;
    try {
        if (o.readPointer().toString() !== r.vt) {
            r.dead = true;
            return false;
        }
        if (r.parent !== null && o.add(O.ParentOff).readPointer().toString() !== r.parent) {
            r.dead = true;
            return false;
        }
        return true;
    }
    catch (_) {
        r.dead = true;
        return false;
    }
}
// Alle setXY-Aufrufe des Scripts laufen hier durch: tote Objekte werden nie mehr angefasst.
function setXY(o, x, y) {
    if (!ownAlive(o))
        return;
    setXYraw(o, x, y);
}
// ---------- Layout ----------
const CFG = {
    // Unten links (Root-Koordinaten). Mit dbg.move(x, y) live verschieben und hier eintragen.
    toggleX: 20, toggleY: 577, toggleW: 110, toggleH: 50, toggleText: "Debug",
    menuX: 1025, menuY: 0,
    itemX: -165, itemW: 265, itemH: 50, start: 82, step: 55,
    // So viele fremde Buttons muessen in einen Container kommen, bevor wir dort andocken.
    // Hoch genug, damit nur die Lobby (viele Buttons) trifft und nicht Login/Popups.
    // Wenn nichts erscheint: 10, 12 ... probieren (dbg.counts() zeigt die Zaehler).
    minAdds: 8,
    // Diagnose-Modus: beim ersten Touch wird in JEDER Ebene der Parent-Kette ein kleiner Button
    // (Text "L0", "L1", ...) angelegt, damit man sieht, in welcher Ebene er sichtbar ist.
    probe: false,
    // Ab dieser Kettenlaenge (Container -> ... -> Root) gilt ein Container als an die Szene
    // angehaengt. Beim Probe-Test waren die Ebenen L2..L5 sichtbar, der Root war also Ebene 5
    // (Kette mit 6 Eintraegen). Wenn der Button nicht von selbst erscheint, im Log nach
    // "Kettenlaenge" schauen und den Wert anpassen.
    rootDepth: 6,
    // Root-Auswahl ueber setXY-Tick: ein Container gilt erst als stabiler Root, wenn er oft genug (rootVotes) und lange
    // genug (rootMinAgeMs) als oberster Container gesehen wurde und die meisten tiefen Ketten dort enden.
    rootVotes: 30, rootMinAgeMs: 1500,
    // Touch-Fallback (Parent des beruehrten Buttons) erst nach so vielen ms, damit der Tick zuerst den Root findet.
    fallbackAfterMs: 8000,
};
let creatingOwn = false;
const foreign = new Set(); // Zeiger fremder GameButtons
const addCounts = new Map(); // Parent -> Anzahl hinzugefuegter fremder Buttons
const handlers = [];
let pending = null; // Parent, in dem beim naechsten Touch das Menue entsteht
let rootMenu = null; // Menue im obersten Container (bleibt dauerhaft)
const lastLen = new Map(); // Parent -> zuletzt geloggte Kettenlaenge
let probed = false; // Probe-Buttons wurden schon angelegt
let current = null; // zuletzt erstelltes Menue
const menus = []; // alle erstellten Menues (eins pro Container)
let armedAt = Date.now(); // wann die Root-Suche (neu) gestartet wurde
let tick = null; // setXY-Hook fuer die Root-Suche
const votes = new Map(); // oberster Container -> Stimmen
let totalVotes = 0;
function str(text) {
    const p = calloc(1, 128);
    stringCtor(p, Memory.allocUtf8String(text));
    return p;
}
// Wie str(), aber gecached: Regler-Labels erzeugen beim Ziehen staendig dieselben Texte. Ohne Cache wuerde bei jedem
// Update ein neues 128-Byte-String-Objekt angelegt und nie freigegeben. setText() kopiert den Text, Wiederverwenden ist sicher.
const strCache = new Map();
function strC(text) {
    const hit = strCache.get(text);
    if (hit)
        return hit;
    const p = str(text);
    if (strCache.size < 4096)
        strCache.set(text, p);
    return p;
}
// sc/debug.sc wird vom Spiel nicht von selbst geladen (das Original-Repo laedt sie ueber
// loadAsset). Ohne das ist das SWF-Objekt NULL und getMovieClip greift auf 0x100 zu.
let debugScTried = false;
let failures = 0;
const MAX_FAILURES = 3;
function ensureDebugSc() {
    if (debugScTried)
        return;
    debugScTried = true;
    try {
        loadAsset(str("sc/debug.sc"), 0);
        log("sc/debug.sc geladen");
    }
    catch (e) {
        log("!!! sc/debug.sc konnte nicht geladen werden:", e);
    }
}
function createButton(parent, sc, item, x, y, w, h, quiet, frame) {
    if (!ownAlive(parent))
        return null; // Container wurde schon vom Spiel abgebaut
    const btn = calloc(1, 1024);
    OWN.delete(btn.toString()); // Adresse kann von einem toten Objekt stammen
    creatingOwn = true;
    try {
        gbCtor(btn);
    }
    finally {
        creatingOwn = false;
    }
    ensureDebugSc();
    let mc;
    try {
        mc = getMovieClip(Memory.allocUtf8String(sc), Memory.allocUtf8String(item));
    }
    catch (e) {
        if (quiet)
            return null;
        failures++;
        log("!!! getMovieClip Fehler (" + failures + "/" + MAX_FAILURES + "):", sc, item, e);
        return null;
    }
    if (mc.isNull()) {
        if (quiet)
            return null; // Fallback-Clip existiert nicht -> still weiter zum naechsten
        log("!!! MovieClip nicht gefunden:", sc, item);
        failures++;
        return null;
    }
    // Frame 0 ist gueltig (z.B. Haekchen "an") -> nur auf undefined pruefen. Ohne Stop spielt der Clip seine Animation ab (Flackern).
    if (frame !== undefined && frame !== null)
        gotoAndStop(mc, frame | 0);
    new NativeFunction(btn.readPointer().add(O.InitVtableOff).readPointer(), "void", ["pointer", "pointer", "bool"])(btn, mc, 1);
    setXY(btn, x, y);
    if (w)
        setWidth(btn, w);
    if (h)
        setHeight(btn, h);
    addChild(parent, btn);
    ownReg(btn, parent);
    return btn;
}
function setBtnText(btn, field, text, multiline) {
    if (!ownAlive(btn))
        return;
    const tf = getTF(btn.add(O.ButtonText).readPointer(), Memory.allocUtf8String(field));
    if (tf.isNull()) {
        log("!!! TextField nicht gefunden:", field);
        return;
    }
    setText(tf, str(text));
    if (multiline)
        setMultiline(tf, 1);
}
const onPress = (btn, fn) => {
    handlers.push({ ptr: btn, fn });
};
// ---------- Menue ----------
class DebugMenu {
    constructor(parent, x = CFG.toggleX, y = CFG.toggleY) {
        this.visible = false;
        this.rows = [];
        this.menu = null;
        this.parent = parent;
        this.toggle = createButton(parent, "sc/debug.sc", "debug_button", x, y);
        if (!this.toggle) {
            this.ok = false;
            return;
        }
        setBtnText(this.toggle, "txt", "D");
        this.menu = createButton(parent, "sc/debug.sc", "debug_menu", CFG.menuX, CFG.menuY);
        if (this.menu) {
            setBtnText(this.menu, "title", "Debug (iOS)");
            setBtnText(this.menu, "version", "iOS port");
            setBtnText(this.menu, "search_help", "");
            this.hide();
        }
        onPress(this.toggle, () => uiToggle(this.parent)); // D oeffnet das Hauptmenue (altes Seitenmenue: Other > Old menu)
        this.ok = true;
        // ---- Eintraege hier hinzufuegen ----
        this.add("Log Test", () => log("Log Test ok"));
        this.add("Schliessen", () => this.hide());
    }
    add(text, fn) {
        if (!this.menu)
            return;
        const y = CFG.start + this.rows.length * CFG.step;
        const b = createButton(this.menu, "sc/debug.sc", "debug_menu_item", CFG.itemX, y, CFG.itemW, CFG.itemH);
        if (!b)
            return;
        setBtnText(b, "Text", text);
        onPress(b, fn);
        this.rows.push(b);
    }
    show() { this.visible = true; if (this.menu)
        setXY(this.menu, CFG.menuX, CFG.menuY); }
    hide() { this.visible = false; if (this.menu)
        setXY(this.menu, NaN, NaN); }
}
function describe(m) {
    if (!m.toggle)
        return "(kein Toggle)";
    try {
        const x = m.toggle.add(0x20).readFloat();
        const y = m.toggle.add(0x24).readFloat();
        const w = getWidth(m.toggle);
        const h = getHeight(m.toggle);
        return "toggle=" + m.toggle + " x=" + x.toFixed(1) + " y=" + y.toFixed(1) + " w=" + w.toFixed(1) + " h=" + h.toFixed(1);
    }
    catch (e) {
        return "toggle=" + m.toggle + " (Info-Fehler: " + e + ")";
    }
}
const UI = {
    cx: 640, cy: 360, // Mitte des Panels (Root-Koordinaten) -> dbg.ui.move(x, y)
    W: 700, H: 470, colW: 196, pad: 24,
    anchor: "center", // Ursprung der Buttons: Mitte oder oben links -> dbg.ui.anchor("tl")
    bgTL: true, // Hintergrund-Clip: Ursprung oben links -> dbg.ui.bgAnchor(false)
    open: false,
    built: false,
    container: ptr(0),
    els: [],
    cur: 0,
    building: -1, // Seite, die gerade gebaut wird (-1 = Rahmen)
    done: new Set(),
    tabs: [],
    title: null,
    live: [], // Aktualisierer (Labels, Checkboxen, Kacheln)
    btnRes: -1,
    fails: 0,
    // ---- Regler / Haekchen (wie im Android-Script) ----
    knob: 22, trackH: 3,
    sliders: [],
    drag: null,
    scale: 1.0, // Finger-Koordinate pro Bildschirm-Einheit (kalibriert sich selbst; dbg.ui.scale(n) erzwingt einen Wert)
    cal: [],
    touchLog: false,
    cx0: 640, cy0: 360, // Standard-Mitte, falls sich nichts Besseres ermitteln laesst
    manualPos: false, // true = Panel wurde per Edit Controls verschoben -> keine Auto-Mitte mehr
    calibrated: false, // Touch-Skalierung ist verlaesslich bestimmt
    rootW: 0, rootH: 0,
    lblOx: -165.5, lblOy: 108.5, // fester Versatz des TextFields im privacy_switch_item-Clip (gleiche .sc wie Android)
    frames: { off: 1, on: 0 }, // privacy_switch_item: Frame 0 = Haekchen (an), Frame 1 = leer (aus)
    knobRes: -1, checkRes: -1,
};
const UI_KNOB_CLIPS = [["sc/ui.sc", "movement_dot"], ["sc/ui.sc", "virtuastick_move_stick"]];
const UI_TF_NAMES = ["Text", "txt", "title", "name", "label", "text"];
const TOUCH = { xOff: 0x34, yOff: 0x38, idOff: 0x50 }; // Touch-Event (in laser geprueft: x/y als Float-Paar bei 0x34, id bei 0x50)
const UI_BTN_CLIPS = [["sc/ui.sc", "map_editor_exit_button"], ["sc/debug.sc", "debug_menu_item"]];
const UI_BG_CLIPS = [["sc/debug.sc", "debug_menu_wide"], ["sc/ui.sc", "gray_rectangle"]];
const UI_TEXT_FIELDS = ["txt", "Text", "title", "name", "label", "text"];
const KTABS = ["Combat", "Render", "Chat", "Team", "Other"];
// ---------- Platzhalter-Zustand (nur Speicher) ----------
const PH = { on: {}, val: {}, idx: {} };
const phLog = (...a) => log("[Placeholder]", ...a);
const phOn = (k) => !!PH.on[k];
const phTog = (k) => () => { PH.on[k] = !PH.on[k]; phLog(k, PH.on[k] ? "ON" : "OFF"); };
const phGet = (k, d) => (k in PH.val ? PH.val[k] : d);
const phSl = (k, min, max, step, d) => ({ min, max, step, get: () => phGet(k, d), set: (v) => { PH.val[k] = v; } });
const phAct = (name) => () => phLog("Action:", name, "- noch keine Funktion");
const phCk = (label, k) => [label, () => phOn(k), phTog(k)];
const phPair = (p, a, b, da, db, lo, hi, step) => [
    { min: lo, max: hi, step, get: () => phGet(p + a, da), set: (v) => { PH.val[p + a] = Math.min(v, phGet(p + b, db)); } },
    { min: lo, max: hi, step, get: () => phGet(p + b, db), set: (v) => { PH.val[p + b] = Math.max(v, phGet(p + a, da)); } },
];
const phPairFmt = (p, a, b, da, db, u) => () => phGet(p + a, da) + "-" + phGet(p + b, db) + u;
// ---------- Bausteine ----------
function uiSetText(btn, text) {
    if (!ownAlive(btn))
        return false;
    let mcp;
    try {
        mcp = btn.add(O.ButtonText).readPointer();
    }
    catch (_) {
        return false;
    }
    if (mcp.isNull())
        return false;
    for (const n of UI_TEXT_FIELDS) { // Feldname unterscheidet sich je Clip -> ohne Fehler-Log durchprobieren
        try {
            const tf = getTF(mcp, Memory.allocUtf8String(n));
            if (!tf.isNull()) {
                setText(tf, strC(text));
                try {
                    setMultiline(tf, 0);
                }
                catch (_) { /* egal */ }
                return true;
            }
        }
        catch (_) { /* naechster Name */ }
    }
    return false;
}
function uiAdd(o, rx, ry, w, h) {
    const e = { o, rx, ry, page: UI.building, shown: false, w, h };
    UI.els.push(e);
    setXY(o, NaN, NaN); // erst versteckt, uiApply() zeigt nur die aktuelle Seite
    return e;
}
const uiVisible = (e) => UI.open && !e.hide && (e.page < 0 || e.page === UI.cur);
function uiApplyEl(e) {
    if (uiVisible(e)) {
        setXY(e.o, UI.cx + e.rx, UI.cy + e.ry);
        e.shown = true;
    }
    else if (e.shown) {
        setXY(e.o, NaN, NaN);
        e.shown = false;
    }
}
function uiApply() { for (const e of UI.els)
    uiApplyEl(e); }
function uiKnobPos(s) {
    const d = s.d;
    let v = Number(d.get());
    if (!isFinite(v))
        v = d.min;
    const f = Math.max(0, Math.min(1, (v - d.min) / ((d.max - d.min) || 1)));
    s.kx = s.x0 + f * (s.x1 - s.x0);
    s.el.rx = s.kx;
    s.el.ry = s.y;
    if (uiVisible(s.el))
        setXY(s.el.o, UI.cx + s.el.rx, UI.cy + s.el.ry);
}
function uiRefresh() {
    for (const l of UI.live)
        if (l.page < 0 || l.page === UI.cur) {
            try {
                l.fn();
            }
            catch (_) { /* ignorieren */ }
        }
    for (const sl of UI.sliders)
        if (sl.page === UI.cur) {
            try {
                uiKnobPos(sl);
            }
            catch (_) { /* ignorieren */ }
        }
    try {
        qaLabels();
    }
    catch (_) { /* ignorieren */ }
}
// Button; wird er breiter als maxW, wird er GLEICHMAESSIG verkleinert (Text bleibt unverzerrt).
// box = feste Groesse (fuer kleine "-"/"+"-Buttons, dort ist leichte Verzerrung egal).
function uiBtn(label, x, y, maxW, fn, box) {
    let b = null;
    const order = UI.btnRes >= 0 ? [UI.btnRes] : UI_BTN_CLIPS.map((_, i) => i);
    for (const i of order) {
        const c = UI_BTN_CLIPS[i];
        b = createButton(UI.container, c[0], c[1], NaN, NaN, undefined, undefined, true);
        if (b) {
            if (UI.btnRes !== i) {
                UI.btnRes = i;
                log("[UI] Button-Clip:", c[0], c[1]);
            }
            break;
        }
    }
    if (!b) {
        UI.fails++;
        return null;
    }
    let w = 200, h = 50;
    try {
        if (box) {
            w = box[0];
            h = box[1];
            setWidth(b, w);
            setHeight(b, h);
        }
        else {
            const w0 = getWidth(b), h0 = getHeight(b);
            if (w0 > 1 && h0 > 1) {
                w = w0;
                h = h0;
                if (maxW && w0 > maxW) {
                    const f = maxW / w0;
                    w = w0 * f;
                    h = h0 * f;
                    setWidth(b, w);
                    setHeight(b, h);
                }
            }
        }
    }
    catch (_) { /* Groesse bleibt */ }
    uiSetText(b, label);
    const e = uiAdd(b, UI.anchor === "center" ? x : x - w / 2, UI.anchor === "center" ? y : y - h / 2, w, h);
    onPress(b, fn);
    return e;
}
// reiner Text (kein Button -> keine Touch-Flaeche): TextField des debug_menu_item-Clips
const uiLabelW = (text, size) => Math.ceil(text.length * size * 0.6) + 14;
function uiLabel(text, x, y, size = 18) {
    try {
        const mc = getMovieClip(Memory.allocUtf8String("sc/debug.sc"), Memory.allocUtf8String("debug_menu_item"));
        if (mc.isNull())
            return null;
        const tf = getTF(mc, Memory.allocUtf8String("Text"));
        if (tf.isNull())
            return null;
        setText(tf, str(text));
        setWidth(tf, uiLabelW(text, size));
        setHeight(tf, size + 10);
        addChild(UI.container, tf);
        return { el: uiAdd(tf, x, y, uiLabelW(text, size), size + 10), tf, size };
    }
    catch (e) {
        log("[UI] Label fehlgeschlagen:", e);
        return null;
    }
}
function uiLabelSet(l, text) {
    try {
        setText(l.tf, strC(text));
        if (!l.plain)
            setWidth(l.tf, uiLabelW(text, l.size));
    }
    catch (_) { /* ignorieren */ }
}
// Android-Stil: nur das TextField des Haekchen-Clips (gleiche Schrift wie die Haekchen-Beschriftung, keine Verzerrung).
// x = linke Textkante, y = Textmitte (der clip-interne Versatz lblOx/lblOy wird hier ausgeglichen).
function uiLabelP(text, x, y, size = 20) {
    try {
        const mc = getMovieClip(Memory.allocUtf8String("sc/ui.sc"), Memory.allocUtf8String("privacy_switch_item"));
        if (!mc.isNull()) {
            for (const n of UI_TF_NAMES) {
                let tf = ptr(0);
                try {
                    tf = getTF(mc, Memory.allocUtf8String(n));
                }
                catch (_) { /* naechster Name */ }
                if (tf.isNull())
                    continue;
                setText(tf, strC(text));
                setMultiline(tf, 0);
                if (size > 22)
                    setFontSize(tf, size);
                addChild(UI.container, tf);
                return { el: uiAdd(tf, x + UI.lblOx, y + UI.lblOy, 0, 0), tf, size, plain: true };
            }
        }
    }
    catch (e) {
        log("[UI] Label (privacy) fehlgeschlagen:", e);
    }
    return uiLabel(text, x, y - size / 2 - 4, size); // Fallback: alter Weg
}
// Clip als reines Anzeigeobjekt (kein Button)
function uiPlain(clips, w, h, quiet, frame) {
    for (const c of clips) {
        let mc;
        try {
            mc = getMovieClip(Memory.allocUtf8String(c[0]), Memory.allocUtf8String(c[1]));
        }
        catch (_) {
            continue;
        }
        if (mc.isNull())
            continue;
        if (frame !== undefined)
            gotoAndStop(mc, frame | 0); // auf festem Frame anhalten (wie kpPlain im Android-Script)
        if (w)
            setWidth(mc, w);
        if (h)
            setHeight(mc, h);
        addChild(UI.container, mc);
        if (!quiet)
            log("[UI] Clip:", c[0], c[1]);
        return mc;
    }
    return null;
}
function uiLine(x, y, w) {
    const mc = uiPlain([["sc/ui.sc", "gray_rectangle"]], w, 2, true, 0);
    if (mc)
        uiAdd(mc, x, y, w, 2);
}
// Schalter mit Haekchen (wie Android): zwei Instanzen von privacy_switch_item (Frame AUS / Frame AN), je nach Zustand ist eine sichtbar.
function uiMkCheck(frame) {
    if (UI.checkRes === -2)
        return null;
    const b = createButton(UI.container, "sc/ui.sc", "privacy_switch_item", NaN, NaN, undefined, undefined, true, frame);
    if (!b) {
        UI.checkRes = -2;
        log("[UI] privacy_switch_item nicht gefunden - Text-Checkboxen als Fallback");
        return null;
    }
    UI.checkRes = 0;
    return b;
}
function uiCheck(x, y, label, get, set) {
    const off = uiMkCheck(UI.frames.off), on = uiMkCheck(UI.frames.on);
    if (!off || !on) {
        uiCheckText(x, y, label, get, set);
        return;
    }
    if (!uiSetText(off, label))
        uiLabelP(label, x + 48, y - 12, 20);
    uiSetText(on, label);
    const eOff = uiAdd(off, x + 22, y, 44, 30), eOn = uiAdd(on, x + 22, y, 44, 30);
    const refresh = () => {
        const v = !!get();
        eOff.hide = v;
        eOn.hide = !v;
        uiApplyEl(eOff);
        uiApplyEl(eOn);
    };
    const flip = () => { try {
        set();
    }
    catch (err) {
        log("[UI] Fehler:", err);
    } refresh(); };
    onPress(off, flip);
    onPress(on, flip);
    refresh();
    UI.live.push({ page: UI.building, fn: refresh });
}
// Fallback ohne Clip: Text-Button "[x] / [ ]"
function uiCheckText(x, y, label, get, set) {
    const text = () => (get() ? "[x] " : "[ ] ") + label;
    let e = null;
    e = uiBtn(text(), x + 105, y, 210, () => {
        try {
            set();
        }
        catch (err) {
            log("[UI] Fehler:", err);
        }
        if (e)
            uiSetText(e.o, text());
    });
    if (e) {
        const el = e;
        UI.live.push({ page: UI.building, fn: () => { uiSetText(el.o, text()); } });
    }
}
function uiChecks(col, y0, list) {
    let y = y0;
    for (const [label, get, set] of list) {
        uiCheck(uiColX(col), y, label, get, set);
        y += 40;
    }
    return y;
}
// Knopf (GameButton, damit er Touches bekommt); Frame 0 festhalten wie im Android-Script
function uiMkKnob() {
    const order = UI.knobRes >= 0 ? [UI.knobRes] : UI_KNOB_CLIPS.map((_, i) => i);
    for (const i of order) {
        const c = UI_KNOB_CLIPS[i];
        const b = createButton(UI.container, c[0], c[1], NaN, NaN, UI.knob, UI.knob, true, 0);
        if (b) {
            if (UI.knobRes !== i) {
                UI.knobRes = i;
                log("[UI] Knopf-Clip:", c[0], c[1]);
            }
            return b;
        }
    }
    return null;
}
// Slider-Gruppe: Titel + Wert, darunter je Regler eine Linie mit ziehbarem Knopf. Gibt das naechste freie y zurueck.
function uiGroup(x, y, title, fmt, defs) {
    const page = UI.building;
    const lbl = uiLabelP(title + ": " + fmt(), x, y + 8, 20); // y = Textmitte
    if (lbl)
        UI.live.push({ page, fn: () => uiLabelSet(lbl, title + ": " + fmt()) });
    let ty = y + 28;
    for (const d of defs) {
        const tr = uiPlain([["sc/ui.sc", "gray_rectangle"]], UI.colW, UI.trackH, true, 0); // Linie, kein Button -> keine Animation
        const kn = uiMkKnob();
        if (!tr || !kn) {
            UI.fails++;
            continue;
        }
        uiAdd(tr, x, ty - UI.trackH / 2, UI.colW, UI.trackH); // gray_rectangle: Ursprung oben links
        const el = uiAdd(kn, x + UI.knob / 2, ty, UI.knob, UI.knob);
        onPress(kn, () => { });
        const sl = { d, k: kn, el, x0: x + UI.knob / 2, x1: x + UI.colW - UI.knob / 2, y: ty, kx: 0, page };
        UI.sliders.push(sl);
        uiKnobPos(sl);
        ty += 26;
    }
    return ty + 2;
}
// Button, der bei Druck durch Werte schaltet (Text wird danach neu gesetzt)
function uiCycle(x, y, maxW, text, next) {
    let e = null;
    e = uiBtn(text(), x, y, maxW, () => { next(); if (e)
        uiSetText(e.o, text()); });
}
const uiColX = (i) => -UI.W / 2 + [24, 250, 476][i];
const uiTop = () => -UI.H / 2;
const uiY0 = () => uiTop() + 110;
const idxNext = (k, n) => () => { PH.idx[k] = ((PH.idx[k] | 0) + 1) % n; phLog(k, PH.idx[k]); };
// ---------- Seiten (Platzhalter, Werte wie in neuerdodge.js) ----------
function aimPage(p, withLos) {
    return () => {
        const X = uiColX, y0 = uiY0();
        const g = (k, d) => phGet(p + k, d);
        let y = y0;
        y = uiGroup(X(0), y, "Range", () => (g("RANGE", 3000) / 300).toFixed(1) + "t", [phSl(p + "RANGE", 900, 6000, 100, 3000)]);
        y = uiGroup(X(0), y, "Strength", phPairFmt(p, "STR_MIN", "STR_MAX", 60, 100, "%"), phPair(p, "STR_MIN", "STR_MAX", 60, 100, 0, 100, 1));
        let y2 = y0;
        y2 = uiGroup(X(1), y2, "Opposite dir.", () => g("OPP_CHANCE", 0) + "%", [phSl(p + "OPP_CHANCE", 0, 100, 1, 0)]);
        y2 = uiGroup(X(1), y2, "Max angle", () => g("MAXANGLE", 90) + "\u00b0", [phSl(p + "MAXANGLE", 10, 360, 5, 90)]);
        y2 = uiGroup(X(1), y2, "Max radius", () => g("MAXRADIUS", 3).toFixed(2) + "t", [phSl(p + "MAXRADIUS", 0, 10, 0.25, 3)]);
        // zweite Spalte passt nicht alles auf eine Seite -> Rest in Spalte 0 unter Strength
        if (y < y0 + 230)
            y = uiGroup(X(0), y, "Opp. strength", phPairFmt(p, "OPP_MIN", "OPP_MAX", 20, 60, "%"), phPair(p, "OPP_MIN", "OPP_MAX", 20, 60, 0, 100, 1));
        const list = [];
        if (withLos) {
            list.push(phCk("Line of sight", p + "LOS"));
            list.push(phCk("Fixed lead time", p + "MODE"));
            list.push(phCk("Ignore Spawn Shield", p + "SKIPSHIELD"));
        }
        list.push(phCk("Allow Super", p + "SUPER"));
        if (!withLos)
            list.push(phCk("Allow Aim (drag)", p + "ALLOWAIM"));
        list.push(qaCk(p));
        list.push(phCk("Enabled", p + "ON"));
        uiChecks(2, y0 + 8, list);
    };
}
function dodgePage1() {
    const X = uiColX, y0 = uiY0(), p = "dodge_";
    const unit = (k, d, u) => () => phGet(p + k, d) + u;
    let y = y0;
    y = uiGroup(X(0), y, "Acceleration", phPairFmt(p, "ACC_MIN", "ACC_MAX", 10, 10, ""), phPair(p, "ACC_MIN", "ACC_MAX", 10, 10, 1, 10, 1));
    y = uiGroup(X(0), y, "Deceleration", phPairFmt(p, "DEC_MIN", "DEC_MAX", 10, 10, ""), phPair(p, "DEC_MIN", "DEC_MAX", 10, 10, 1, 10, 1));
    let y2 = y0;
    y2 = uiGroup(X(1), y2, "Reaction", phPairFmt(p, "REACT_MIN", "REACT_MAX", 0, 0, "ms"), phPair(p, "REACT_MIN", "REACT_MAX", 0, 0, 0, 200, 10));
    y2 = uiGroup(X(1), y2, "Shift", unit("SHIFT", 11, "\u00b0"), [phSl(p + "SHIFT", 0, 45, 1, 11)]);
    y2 = uiGroup(X(1), y2, "Vision", unit("VISION", 5, "t"), [phSl(p + "VISION", 2, 15, 1, 5)]);
    uiChecks(2, y0 + 8, [phCk("Enabled", p + "ON"), qaCk(p), phCk("Continuous", p + "CONTINUOUS"),
        phCk("Circular", p + "CIRCULAR"), phCk("Always Dodge", p + "ALWAYS"), phCk("Input Guard", p + "GUARD"),
        phCk("Guard Steers", p + "GUARD_STEER")]);
}
function dodgePage2() {
    const X = uiColX, y0 = uiY0(), p = "dodge_";
    const unit = (k, d, u) => () => phGet(p + k, d) + u;
    let y = y0;
    y = uiGroup(X(0), y, "Shift delay", unit("SHIFT_DELAY", 50, "ms"), [phSl(p + "SHIFT_DELAY", 0, 250, 5, 50)]);
    y = uiGroup(X(0), y, "Change delay", unit("CHANGE_DELAY", 0, "ms"), [phSl(p + "CHANGE_DELAY", 0, 400, 10, 0)]);
    y = uiGroup(X(0), y, "Return delay", unit("RETURN_DELAY", 100, "ms"), [phSl(p + "RETURN_DELAY", 0, 600, 10, 100)]);
    let y2 = y0;
    y2 = uiGroup(X(1), y2, "Cooldown", unit("COOLDOWN", 0, "ms"), [phSl(p + "COOLDOWN", 0, 2000, 50, 0)]);
    y2 = uiGroup(X(1), y2, "Chance", unit("CHANCE", 100, "%"), [phSl(p + "CHANCE", 0, 100, 5, 100)]);
    y2 = uiGroup(X(1), y2, "Max angle", unit("MAX_ANGLE", 360, "\u00b0"), [phSl(p + "MAX_ANGLE", 10, 360, 5, 360)]);
    let y3 = y0;
    y3 = uiGroup(X(2), y3, "Input lag", unit("LAG_MS", 100, "ms"), [phSl(p + "LAG_MS", 0, 300, 10, 100)]);
    y3 = uiGroup(X(2), y3, "Damage", phPairFmt(p, "DMG_MIN", "DMG_MAX", 0, 4350, ""), phPair(p, "DMG_MIN", "DMG_MAX", 0, 4350, 0, 10000, 100));
    uiBtn("Dodge Reset", X(2) + 100, y3 + 10, 200, () => { for (const k of Object.keys(PH.val))
        if (k.indexOf(p) === 0)
            delete PH.val[k]; Dodge.resetDefaults(); uiRefresh(); });
}
function farmPage() {
    const X = uiColX, y0 = uiY0(), p = "farm_";
    const g = (k, d) => phGet(p + k, d);
    let y = y0;
    y = uiGroup(X(0), y, "Enemy distance", () => String(g("ENEMY_DIST", 700)), [phSl(p + "ENEMY_DIST", 150, 1300, 50, 700)]);
    y = uiGroup(X(0), y, "Mate distance", () => String(g("MATE_DIST", 500)), [phSl(p + "MATE_DIST", 150, 1200, 50, 500)]);
    y = uiGroup(X(0), y, "Mate leash", () => String(g("LEASH", 2500)), [phSl(p + "LEASH", 1500, 4000, 100, 2500)]);
    const lr = () => (phOn("learnReady") ? "Learn Ready: PRESS READY" : "Learn Ready (idx 0)");
    const lp = () => (phOn("learnPost") ? "Learn Continue: ON (0)" : "Learn Continue (0)");
    uiCycle(X(1) + 100, y0 + 30, 210, lr, phTog("learnReady"));
    uiCycle(X(1) + 100, y0 + 90, 210, lp, phTog("learnPost"));
    uiChecks(2, y0 + 8, [phCk("Enabled", p + "ON"), phCk("Follow enemies", p + "ENEMIES"), phCk("Follow mates", p + "MATES")]);
}
function hudPage() {
    uiChecks(0, uiY0() + 8, [["HUD", () => phOn("hud"), () => {
                phTog("hud")();
                try {
                    hudEnsure();
                }
                catch (e) {
                    HUD.fails++;
                    log("[HUD] Fehler:", e);
                } // sofort ein-/ausblenden (Button-Handler laeuft auf dem Game-Thread)
            }]]);
}
function gradPage() {
    const X = uiColX, y0 = uiY0();
    uiChecks(0, y0 + 8, [phCk("Name gradient", "gradient")]);
    const gn = () => Math.max(1, Grad.count() || 8);
    uiCycle(X(1) + 100, y0 + 24, 200, () => "Gradient: #" + (((PH.idx.grad | 0) % gn()) + 1) + "/" + gn(), () => { PH.idx.grad = ((PH.idx.grad | 0) + 1) % gn(); phLog("Gradient", PH.idx.grad); });
}
function espPage() {
    const X = uiColX, y0 = uiY0(), COLORS = ["Red", "Green", "Blue", "Yellow", "White"];
    uiChecks(0, y0 + 8, [phCk("ESP Tracers", "esp_on"), phCk("Lines", "esp_lines"), phCk("Boxes", "esp_boxes"), phCk("Wall check", "esp_los")]);
    uiGroup(X(1), y0, "Thickness", () => String(phGet("esp_thick", 2)), [phSl("esp_thick", 1, 8, 1, 2)]);
    uiCycle(X(1) + 100, y0 + 110, 200, () => "Color: " + COLORS[(PH.idx.espColor | 0) % COLORS.length], idxNext("espColor", COLORS.length));
}
function ammoPage() { uiChecks(0, uiY0() + 8, [phCk("Show enemy ammo", "ammo")]); }
function chatPage() {
    const X = uiColX, y0 = uiY0();
    uiChecks(0, y0 + 8, [phCk("Spam", "spam")]);
    // Spam-Text: Button druecken, dann die gewuenschte Nachricht in den Team-Chat schreiben -> wird zum Spam-Text
    const lab = () => ChatSpam.state.waiting ? "Text jetzt in Chat schreiben" : "Text: " + String(ChatSpam.state.text).slice(0, 14);
    const tb = uiBtn(lab(), X(0) + 100, y0 + 70, 210, () => { ChatSpam.askText(); uiRefresh(); });
    if (tb) {
        const el = tb;
        UI.live.push({ page: UI.building, fn: () => { uiSetText(el.o, lab()); } });
    }
    uiBtn("Send once", X(0) + 100, y0 + 130, 210, () => { ChatSpam.say(); });
    uiGroup(X(1), y0, "Speed", () => phGet("spam_ms", 100) + "ms", [phSl("spam_ms", 10, 600, 10, 100)]);
}
function teamPage() {
    const X = uiColX, y0 = uiY0();
    uiBtn("Join team", X(0) + 100, y0 + 24, 200, phAct("Join team"));
    uiBtn("Leave team", X(0) + 100, y0 + 84, 200, phAct("Leave team"));
    uiBtn("Code: -", X(0) + 100, y0 + 144, 200, phAct("Set team code"));
    uiChecks(1, y0 + 8, [phCk("Auto-Join", "tj_auto"), phCk("Join + Leave", "tj_jl")]);
    uiGroup(X(2), y0, "Join-Speed", () => phGet("tj_ms", 200) + "ms", [phSl("tj_ms", 50, 1000, 50, 200)]);
}
function spinnerPage() {
    const X = uiColX, y0 = uiY0(), p = "spin_";
    let y = y0;
    y = uiGroup(X(0), y, "Tempo", () => String(phGet(p + "SPEED", 30)), [phSl(p + "SPEED", 0, 100, 1, 30)]);
    y = uiGroup(X(0), y, "Radius", () => String(phGet(p + "RADIUS", 100)), [phSl(p + "RADIUS", 20, 400, 10, 100)]);
    y = uiGroup(X(0), y, "Steps", () => String(phGet(p + "STEPS", 4)), [phSl(p + "STEPS", 1, 8, 1, 4)]);
    uiChecks(2, y0 + 8, [phCk("Enabled", p + "ON"), qaCk(p), phCk("While moving", p + "MOVE")]);
}
function cameraPage() {
    const X = uiColX, y0 = uiY0(), p = "cam_", MODES = ["Off", "Corner", "Top", "Free"];
    const sl = (k, min, max, step, d) => phSl(p + k, min, max, step, d);
    const num = (k, d) => () => String(phGet(p + k, d));
    uiCycle(X(0) + 100, y0 + 24, 200, () => "Mode: " + MODES[(PH.idx.camMode | 0) % MODES.length], idxNext("camMode", MODES.length));
    uiBtn("Reset", X(0) + 100, y0 + 84, 200, () => { for (const k of Object.keys(PH.val))
        if (k.indexOf(p) === 0)
            delete PH.val[k]; uiRefresh(); });
    let y = y0 + 130;
    y = uiGroup(X(0), y, "Corner side", num("cornerSide", 3000), [sl("cornerSide", 0, 12000, 100, 3000)]);
    let y1 = y0;
    y1 = uiGroup(X(1), y1, "Eye X", num("eyeX", 0), [sl("eyeX", -12000, 12000, 100, 0)]);
    y1 = uiGroup(X(1), y1, "Eye Y", num("eyeY", 0), [sl("eyeY", -12000, 12000, 100, 0)]);
    y1 = uiGroup(X(1), y1, "Eye Z", num("eyeZ", 5000), [sl("eyeZ", -12000, 12000, 100, 5000)]);
    let y2 = y0;
    y2 = uiGroup(X(2), y2, "Look X", num("lookX", 0), [sl("lookX", -12000, 12000, 100, 0)]);
    y2 = uiGroup(X(2), y2, "Look Y", num("lookY", 0), [sl("lookY", -12000, 12000, 100, 0)]);
    y2 = uiGroup(X(2), y2, "Look Z", num("lookZ", 0), [sl("lookZ", -12000, 12000, 100, 0)]);
    uiGroup(X(2), y2, "Map size %", num("mapPct", 100), [sl("mapPct", 50, 300, 5, 100)]);
}
function spectatorPage() {
    const X = uiColX, y0 = uiY0();
    uiChecks(0, y0 + 8, [phCk("Spectator", "spec_on")]);
    uiGroup(X(1), y0, "Count", () => String(phGet("spec_count", 0)), [phSl("spec_count", 0, 1000, 10, 0)]);
}
function editPage() {
    const X = uiColX, y0 = uiY0();
    uiChecks(0, y0 + 8, [["Edit Controls (drag buttons)", () => EDIT.on, () => editOn(!EDIT.on)]]);
    uiBtn("Reset all positions", X(1) + 100, y0 + 24, 220, () => editReset());
    uiGroup(X(0), y0 + 70, "Drag scale (x0.1)", () => String(phGet("edit_scale", 20)), [phSl("edit_scale", 5, 80, 1, 20)]);
}
function hidePage() { uiChecks(0, uiY0() + 8, [phCk("Hide Battle Status", "hide")]); }
function streamerPage() {
    const X = uiColX, y0 = uiY0(), CENS = ["Stars", "Blur", "Hide"];
    uiChecks(0, y0 + 8, [phCk("Streamer Mode (censor names)", "streamer")]);
    uiCycle(X(1) + 100, y0 + 24, 200, () => "Censor: " + CENS[(PH.idx.censor | 0) % CENS.length], idxNext("censor", CENS.length));
}
// ============================================================
//  Spectate by Tag / Profile by Tag  (iOS-Port aus combined_mod_merged.js, Android v59)
//  Alle Offsets sind RVAs und wurden statisch in der iOS-Binary "laser" ermittelt:
//
//  AllianceManager::getInstance  0x6f54    Singleton im Global 0x11827d8, legt sich bei null selbst an (new(0x138) + ctor 0xb55b0)
//                                          -> auf Android musste man den Slot selbst fuellen, hier nicht noetig.
//  AllianceManager::doStartSpectate 0xb8c78  (x0 = Manager, x1 = LogicLong*)   gefunden ueber "TID_ERROR_SPECTATE_WAITING"
//                                          (String-Ref 0xb8c9c/0xb8ca0). Baut StartSpectateMessage (ctor 0x41e2cc, brawlTV = 0),
//                                          sendet ueber MessageManager (Global 0x11828d8, vtable[0x18]). Laeuft schon ein Request
//                                          (mgr+0xb5) -> Fehlertext. Das LogicLong wird von der Funktion selbst freigegeben
//                                          (operator delete 0xe00944) -> mit operator new(8) anlegen, NICHT selbst freigeben.
//  PlayerInfo::PlayerInfo        0xc4b30   (this, LogicLong*, type, NULL, 0)   (Thunk 0xc6018 springt hierhin). Gefunden ueber
//                                          "other_players_profile" (String-Ref 0xc4c6c/0xc4c70). type 2 = Profil eines anderen Spielers.
//                                          Objektgroesse 0x230 (wie Android). Speichert den LogicLong-Zeiger selbst -> nie freigeben.
//  showPopup(PlayerInfo*)        0xb8e58   (x0 = Objekt) -> intern GUI-Popup (0xe9a2c). Original-Aufrufer: 0xc4a1c.
//  LogicLong: int @+0 = hi, int @+4 = lo  (ctor 0xc07100 speichert (w1, w2) so), Tag-Alphabet "0289PYLQGRJCUV",
//             id = lo*256 + hi.
//  Original-Ablauf im Spiel (0xc49e4..0xc4a1c): obj = new(0x230); ll = new(8); LogicLong(ll, hi, lo); ctor(obj, ll, 2, 0, 0); showPopup(obj)
//
//  Tag-Eingabe: nur per Team-Chat (Button druecken, dann den Tag #... in den Team-Chat schreiben). Kein Einfuegen/Zwischenablage mehr.
//  Die Buttons im Menue laufen auf dem Game-Thread (Button-Handler). Aus der Konsole wird der Job vorgemerkt und beim
//  naechsten Touch auf dem Game-Thread ausgefuehrt.
//  Konsole:  dbg.spectate.setTag("#2PP"); dbg.spectate.now();   dbg.profile.setTag("#2PP"); dbg.profile.now();
//            dbg.chat.arm("spectate")  (Tag per Team-Chat)   dbg.spectate.byId(hi, lo) / dbg.profile.byId(hi, lo)
//  Profil oeffnet nur im Menue (nicht im Kampf).
// ============================================================
const TAG_O = {
    OperatorNew: 0xe0095c, // PLT-Stub operator new(size_t)
    AllianceGetInstance: 0x6f54, // () -> AllianceManager*
    DoStartSpectate: 0xb8c78, // (mgr, LogicLong*) -> bool
    PlayerInfoCtor: 0xc4b30, // (this, LogicLong*, type, ptr, int) -> this
    ShowPopup: 0xb8e58, // (PlayerInfo*)
    ObjSize: 0x230,
};
// ============================================================
//  Copy-Tag-Button  (iOS-Port, Android: Gene Brawl "copy tag button" im Spielerprofil) - Offsets statisch aus "laser"
//
//  PlayerInfo::refreshPlayerHeader  0xc8c40   (String-Ref "tag_txt" 0xc8ccc/0xc8d20; this = PlayerInfo)
//    Tag = toCode( *(*(this+0x1e0)+0x90) )  - LogicLong: int @+0 = hi (getHi 0xc071ec), int @+4 = lo (getLo 0xc071f4);
//    bei this+0x1b8 == 7 ist hi um 100 groesser (wie im Spiel, 0xc8c68..0xc8c8c). id = lo*256 + hi, Alphabet "0289PYLQGRJCUV".
//    this+0xc0 = GUI-Container (Objekt mit MovieClip @+0x70: ldr x8,[this,#0xc0]; ldr x0,[x8,#0x70]) - wie Android ContainerOff 0xc0.
//  addGameButton(container, const char* name, bool)  0x9c6b8   (liefert den Button; Overload mit String* = 0x9c76c)
//  copyString(gameString*)          0xdd8100   (UIPasteboard; Aufruf im Original mit TID_DEVICE_LINK_CODE_COPIED bei 0x1b088)
//  GUI::getInstance                 0x987e8    (liest Global 0x11827d0)
//  showFloaterText(gui, gameString*, color, float)  0x98f00   (Original: color -1, s0 = 0.0, siehe 0x1b0a4..0x1b0b8)
// ============================================================
const COPYTAG_O = {
    RefreshHeader: 0xc8c40,
    AddGameButton: 0x9c6b8,
    CopyString: 0xdd8100,
    GuiGetInstance: 0x987e8,
    ShowFloater: 0x98f00,
    AvatarPtr: 0x1e0,
    LogicLongOff: 0x90,
    TypeOff: 0x1b8,
    ContainerOff: 0xc0,
};
const TagTools = (() => {
    const CHARS = "0289PYLQGRJCUV";
    const B14 = BigInt(14), B256 = BigInt(256);
    const st = { tag: "", pending: null, ready: false, specSent: 0, profSent: 0 };
    let newMem = null, getMgr = null, doSpectate = null, piCtor = null, showPopup = null;
    const tlog = (...a) => log("[Tag]", ...a);
    try {
        newMem = new NativeFunction(F(TAG_O.OperatorNew), "pointer", ["size_t"]);
        getMgr = new NativeFunction(F(TAG_O.AllianceGetInstance), "pointer", []);
        doSpectate = new NativeFunction(F(TAG_O.DoStartSpectate), "int", ["pointer", "pointer"]);
        piCtor = new NativeFunction(F(TAG_O.PlayerInfoCtor), "pointer", ["pointer", "pointer", "int", "pointer", "int"]);
        showPopup = new NativeFunction(F(TAG_O.ShowPopup), "void", ["pointer"]);
        st.ready = true;
    }
    catch (e) {
        tlog("init fehlgeschlagen:", e);
    }
    // "#2pp" / "2PP" / "#2OO" -> "#2PP" / "#2PP" / "#200"  (wie im Spiel: O = 0)
    function normalize(t) {
        let s = String(t || "").trim().toUpperCase().replace(/O/g, "0");
        if (s && s[0] !== "#")
            s = "#" + s;
        return s;
    }
    // Tag -> { hi, lo } oder null (Port von HashTagCodeGenerator.toId)
    function toId(tag) {
        const t = normalize(tag);
        if (t.length < 2 || t.length > 15)
            return null;
        let id = BigInt(0);
        for (const ch of t.slice(1)) {
            const i = CHARS.indexOf(ch);
            if (i < 0)
                return null;
            id = id * B14 + BigInt(i);
        }
        const hi = Number(id % B256), lo = Number(id / B256);
        if (lo > 0x7fffffff || (hi === 0 && lo === 0))
            return null;
        return { hi, lo };
    }
    function spectate(hi, lo) {
        const mgr = getMgr();
        if (mgr.isNull()) {
            tlog("[Spectate] AllianceManager nicht verfuegbar");
            return false;
        }
        const ll = newMem(8); // das Spiel gibt es selbst frei (operator delete)
        if (ll.isNull()) {
            tlog("[Spectate] Speicher fuer LogicLong fehlgeschlagen");
            return false;
        }
        ll.writeS32(hi);
        ll.add(4).writeS32(lo);
        const r = doSpectate(mgr, ll);
        st.specSent++;
        tlog("[Spectate] gesendet hi=" + hi + " lo=" + lo + " (" + (st.tag || "-") + ")" + (r ? "" : " - Anfrage laeuft schon (SPECTATE_WAITING)"));
        return true;
    }
    function openProfile(hi, lo) {
        const ll = newMem(8); // PlayerInfo behaelt den Zeiger -> hier NICHT freigeben
        const obj = newMem(TAG_O.ObjSize);
        if (ll.isNull() || obj.isNull()) {
            tlog("[Profile] Speicher fehlgeschlagen");
            return false;
        }
        ll.writeS32(hi);
        ll.add(4).writeS32(lo);
        piCtor(obj, ll, 2, NULL, 0); // type 2 = Profil eines anderen Spielers
        showPopup(obj);
        st.profSent++;
        tlog("[Profile] geoeffnet hi=" + hi + " lo=" + lo + " (" + (st.tag || "-") + ")");
        return true;
    }
    let onChange = null;
    const notify = () => { if (onChange) {
        try {
            onChange();
        }
        catch (_) { /* egal */ }
    } };
    function setTag(t) {
        const n = normalize(t);
        if (n && !toId(n)) {
            tlog("Tag \"" + n + "\" ungueltig (erlaubt: 0 2 8 9 P Y L Q G R J C U V)");
            return false;
        }
        st.tag = n;
        tlog("Tag =", st.tag || "-");
        notify();
        return true;
    }
    function run(job) {
        if (!st.ready) {
            tlog("nicht bereit (init fehlgeschlagen)");
            return false;
        }
        let id = job.id || null;
        if (!id) {
            if (!st.tag) {
                tlog("kein Tag -> Chat-Button druecken und Tag in den Team-Chat schreiben oder dbg.spectate.setTag('#ABC')");
                return false;
            }
            id = toId(st.tag);
            if (!id) {
                tlog("Tag \"" + st.tag + "\" ungueltig");
                return false;
            }
        }
        try {
            return job.kind === "spectate" ? spectate(id.hi, id.lo) : openProfile(id.hi, id.lo);
        }
        catch (e) {
            tlog("Fehler:", String((e && e.stack) || e));
            return false;
        }
    }
    // Konsole (Frida-Thread): Job vormerken, beim naechsten Touch auf dem Game-Thread ausfuehren
    Interceptor.attach(F(O.TouchBegan), {
        onEnter() {
            if (!st.pending)
                return;
            const job = st.pending;
            st.pending = null;
            run(job);
        },
    });
    // ---------- Tag aus dem Team-Chat uebernehmen ----------
    //  Hook im echten Team-Chat-Sender (GameRoom-Klasse, dieselbe wie Team-Leave 0xd1078; Text kommt aus dem Eingabefeld,
    //  Funktion 0xd231c, "mute_chat_button" / TID_FREE_TEXT_CHAT_MUTED_LFG). Dort wird die Nachricht gebaut:
    //    msg = new(0xa0); TeamChatMessage ctor 0x3fb28c; String::operator=(msg+0x90, text)  <- Hook davor (0xd246c, x1 = Text-String)
    //    sendMessage = (*MessageManager)[0x18]  (MessageManager-Global 0x11828d8)
    //  Game-String: Laenge @+4, Daten inline @+8 (len < 8) sonst Zeiger @+8  (wie Android).
    //  Die Nachricht wird trotzdem normal gesendet (wie auf Android).
    const CHAT_O = { SenderHook: 0xd246c, MsgSize: 0xa0, MsgTextOff: 0x90, TeamChatCtor: 0x3fb28c, MsgMgrGlobal: 0x11828d8 };
    const cap = { armed: false, mode: "spectate", hooked: false, captured: 0, last: "", textCb: null };
    function readGameStr(sp) {
        try {
            const len = sp.add(4).readS32();
            if (len < 1 || len > 512)
                return "";
            const data = len < 8 ? sp.add(8) : sp.add(8).readPointer();
            return data.readUtf8String(len) || "";
        }
        catch (_) {
            return "";
        }
    }
    function toast(text) {
        try {
            const gui = new NativeFunction(F(COPYTAG_O.GuiGetInstance), "pointer", [])();
            if (gui.isNull())
                return;
            new NativeFunction(F(COPYTAG_O.ShowFloater), "void", ["pointer", "pointer", "int", "float"])(gui, str(text), -1, 0.0);
        }
        catch (e) {
            tlog("Toast fehlgeschlagen:", e);
        }
    }
    try {
        Interceptor.attach(F(CHAT_O.SenderHook), {
            onEnter() {
                if (!cap.armed && !cap.textCb)
                    return;
                try {
                    const text = readGameStr(this.context.x1);
                    if (!text)
                        return;
                    if (cap.textCb) {
                        const cb = cap.textCb;
                        cap.textCb = null;
                        cb(text);
                        return;
                    } // Spam-Text: naechste Chat-Nachricht uebernehmen
                    const m = text.match(/#?[0-9A-Za-z]{2,14}/);
                    if (!m || !toId(normalize(m[0]))) {
                        tlog("Chat-Text ist kein gueltiger Tag:", text.slice(0, 30));
                        toast("Kein gueltiger Tag: " + text.slice(0, 20));
                        return;
                    }
                    cap.armed = false;
                    cap.captured++;
                    cap.last = text;
                    setTag(m[0]);
                    toast((cap.mode === "profile" ? "Profil" : "Spectate") + " Tag: " + st.tag);
                }
                catch (e) {
                    tlog("ChatCapture Fehler:", e);
                }
            },
        });
        cap.hooked = true;
    }
    catch (e) {
        tlog("ChatCapture Hook fehlgeschlagen:", e);
    }
    function armChat(mode) {
        if (!cap.hooked) {
            tlog("Chat-Hook nicht verfuegbar");
            return false;
        }
        cap.armed = !cap.armed;
        cap.mode = mode;
        tlog(cap.armed ? "Schreib jetzt den Tag (#...) in den Team-Chat -> wird uebernommen" : "Chat-Capture aus");
        if (cap.armed)
            toast("Tag in den Team-Chat schreiben");
        notify();
        return cap.armed;
    }
    const queue = (job) => { if (!st.ready)
        return false; st.pending = job; tlog("vorgemerkt - wird beim naechsten Touch ausgefuehrt"); return true; };
    const api = (kind) => ({
        state: st,
        setTag, toId, normalize,
        setOnChange(fn) { onChange = fn; },
        now: () => queue({ kind }), // aus der Konsole
        nowHere: () => run({ kind }), // nur auf dem Game-Thread (Button-Handler)
        byId: (hi, lo) => queue({ kind, id: { hi: hi | 0, lo: lo | 0 } }),
    });
    onChange = () => { try {
        uiRefresh();
    }
    catch (_) { /* Menue evtl. zu */ } };
    tlog("bereit (dbg.spectate / dbg.profile: setTag | now | byId | dbg.chat.arm)");
    return { spectate: api("spectate"), profile: api("profile"), state: st, setTag, tagText: () => (st.tag ? st.tag.slice(0, 12) : "-"),
        chat: { state: cap, arm: armChat, toast, askText: (cb, hint) => { cap.textCb = cb; if (cb)
                toast(hint || "Spam-Text in den Team-Chat schreiben"); } } };
})();
const CopyTag = (() => {
    const C = COPYTAG_O;
    const CHARS = "0289PYLQGRJCUV";
    const st = { ready: false, copied: 0, attached: 0 };
    const btnByInfo = new Map(); // PlayerInfo -> Button (damit sich keine Handler stapeln)
    const keep = []; // haelt Game-Strings kurz am Leben
    let addBtn = null, copyFn = null;
    const clog = (...a) => log("[CopyTag]", ...a);
    if (PH.on.copytag === undefined)
        PH.on.copytag = true; // wie Android: standardmaessig an
    try {
        addBtn = new NativeFunction(F(C.AddGameButton), "pointer", ["pointer", "pointer", "bool"]);
        copyFn = new NativeFunction(F(C.CopyString), "void", ["pointer"]);
        st.ready = true;
    }
    catch (e) {
        clog("init fehlgeschlagen:", e);
    }
    function gameString(text) {
        const s = str(text);
        keep.push(s);
        while (keep.length > 16)
            keep.shift();
        return s;
    }
    function toCode(hi, lo) {
        let v = lo * 256 + hi;
        if (v <= 0)
            return "";
        let out = "";
        while (v > 0 && out.length < 15) {
            out = CHARS[v % 14] + out;
            v = Math.floor(v / 14);
        }
        return out;
    }
    function tagOf(info) {
        const av = info.add(C.AvatarPtr).readPointer();
        if (av.isNull())
            return "";
        const ll = av.add(C.LogicLongOff).readPointer();
        if (ll.isNull())
            return "";
        let hi = ll.readS32();
        const lo = ll.add(4).readS32();
        if (info.add(C.TypeOff).readS32() === 7)
            hi += 100;
        const code = toCode(hi, lo);
        return code ? "#" + code : "";
    }
    function onTap(tag) {
        try {
            copyFn(gameString(tag));
            st.copied++;
            clog("kopiert " + tag);
            TagTools.chat.toast("Tag kopiert: " + tag);
        }
        catch (e) {
            clog("Kopieren fehlgeschlagen:", e);
        }
    }
    function attachButton(info) {
        const tag = tagOf(info); // jetzt lesen (nach dem Refresh), nicht erst beim Tippen -> kein Zugriff auf evtl. freigegebenes PlayerInfo
        if (!tag)
            return;
        const container = info.add(C.ContainerOff).readPointer();
        if (container.isNull())
            return;
        const key = info.toString();
        const old = btnByInfo.get(key);
        if (old) {
            const i = handlers.findIndex((h) => h.ptr.equals(old));
            if (i >= 0)
                handlers.splice(i, 1);
        }
        creatingOwn = true;
        let btn;
        try {
            btn = addBtn(container, Memory.allocUtf8String("tag_txt"), 1);
        }
        finally {
            creatingOwn = false;
        }
        if (btn.isNull())
            return;
        ownReg(btn, null); // Vtable-Check: tote Buttons (Adresse vom Spiel neu vergeben) loesen nichts mehr aus
        btnByInfo.set(key, btn);
        if (btnByInfo.size > 50)
            btnByInfo.delete(btnByInfo.keys().next().value);
        onPress(btn, () => onTap(tag));
        st.attached++;
    }
    if (st.ready) {
        try {
            Interceptor.attach(F(C.RefreshHeader), {
                onEnter(args) { this.info = args[0]; },
                onLeave() {
                    if (!phOn("copytag"))
                        return;
                    try {
                        attachButton(this.info);
                    }
                    catch (e) {
                        clog("Button anlegen fehlgeschlagen:", e);
                    }
                },
            });
        }
        catch (e) {
            st.ready = false;
            clog("Hook fehlgeschlagen:", e);
        }
    }
    clog("bereit (Tag im Spielerprofil antippen = kopieren; dbg.copyTag.toggle)");
    return { state: st, tagOf, toggle: () => { PH.on.copytag = !PH.on.copytag; clog(PH.on.copytag ? "AN" : "AUS"); return !!PH.on.copytag; } };
})();
function tagPage(kind) {
    return () => {
        const X = uiColX, y0 = uiY0();
        const T = kind === "spectate" ? TagTools.spectate : TagTools.profile;
        uiBtn(kind === "spectate" ? "Spectate" : "Open profile", X(0) + 100, y0 + 24, 200, () => { T.nowHere(); });
        // Einzige Tag-Eingabe: Team-Chat. Button druecken, danach den Tag (#...) in den Team-Chat schreiben.
        const ctxt = () => {
            if (TagTools.chat.state.armed)
                return "Chat: Tag jetzt schreiben";
            const t = TagTools.tagText();
            return t !== "-" ? "Chat: " + t : "Tag per Chat";
        };
        const c = uiBtn(ctxt(), X(0) + 100, y0 + 84, 200, () => { TagTools.chat.arm(kind); uiRefresh(); });
        if (c) {
            const el = c;
            UI.live.push({ page: UI.building, fn: () => { uiSetText(el.o, ctxt()); } });
        }
    };
}
function copyTagPage() { uiChecks(0, uiY0() + 8, [phCk("Copy tag button", "copytag")]); }
function themePage() {
    const X = uiColX, y0 = uiY0();
    let mid = null;
    const upd = () => { try {
        if (mid)
            uiSetText(mid.o, Theme.label());
    }
    catch (_) { /* egal */ } };
    uiBtn("<  Prev", X(0) + 100, y0 + 24, 200, () => { Theme.step(-1); upd(); });
    mid = uiBtn(Theme.label(), X(1) + 100, y0 + 24, 200, () => { Theme.reapply(); upd(); });
    uiBtn("Next  >", X(2) + 100, y0 + 24, 200, () => { Theme.step(1); upd(); });
    uiBtn("-5", X(0) + 100, y0 + 90, 200, () => { Theme.step(-5); upd(); });
    uiBtn("Server theme", X(1) + 100, y0 + 90, 200, () => { Theme.server(); upd(); });
    uiBtn("+5", X(2) + 100, y0 + 90, 200, () => { Theme.step(5); upd(); });
}
function extrasPage() {
    const X = uiColX, y0 = uiY0();
    uiBtn("Add: Custom", X(0) + 100, y0 + 24, 200, phAct("Add: Custom"));
}
// Name Changer (nur visuell): "Original" = dein echter Name, "Name" = der Name, den nur du siehst. Jeweils Button druecken, dann in den Team-Chat schreiben.
function namePage() {
    const X = uiColX, y0 = uiY0();
    const labReal = () => NameChanger.waiting() ? "Namen jetzt in Chat schreiben" : (NameChanger.state.real ? "Original: gesetzt" : "Original per Chat");
    const labFake = () => NameChanger.waiting() ? "Namen jetzt in Chat schreiben" : (NameChanger.state.fake ? "Name: " + NameChanger.state.fake.slice(0, 14) : "Name per Chat setzen");
    uiChecks(0, y0 + 8, [phCk("Name Changer (visual)", "namechg")]);
    const rb = uiBtn(labReal(), X(0) + 100, y0 + 70, 210, () => { NameChanger.ask("real"); uiRefresh(); });
    if (rb) {
        const el = rb;
        UI.live.push({ page: UI.building, fn: () => { uiSetText(el.o, labReal()); } });
    }
    const fb = uiBtn(labFake(), X(1) + 100, y0 + 70, 210, () => { NameChanger.ask("fake"); uiRefresh(); });
    if (fb) {
        const el = fb;
        UI.live.push({ page: UI.building, fn: () => { uiSetText(el.o, labFake()); } });
    }
}
const uiOldMenu = () => { uiClose(); if (current)
    current.show(); };
// Kacheln pro Tab; "pages" = Konfigurationsseiten (mehrere -> "-->"), "action" = direkte Aktion
const KFEATS = {
    Combat: [
        { name: "Kill Aura", on: () => phOn("aura_ON"), pages: [aimPage("aura_", true)] },
        { name: "Aimbot", on: () => phOn("aimbot_ON"), pages: [aimPage("aimbot_", false)] },
        { name: "Autododge", on: () => phOn("dodge_ON"), pages: [dodgePage1, dodgePage2] },
        { name: "Auto Farm", on: () => phOn("farm_ON"), pages: [farmPage] },
    ],
    Render: [
        { name: "HUD", on: () => phOn("hud"), pages: [hudPage] },
        { name: "Name gradient", on: () => phOn("gradient"), pages: [gradPage] },
        { name: "ESP", on: () => phOn("esp_on"), pages: [espPage] },
        { name: "Show Ammo", on: () => phOn("ammo"), pages: [ammoPage] },
    ],
    Chat: [
        { name: "Spam", on: () => phOn("spam"), pages: [chatPage] },
    ],
    Team: [
        { name: "Team Join", on: () => phOn("tj_auto"), pages: [teamPage] },
    ],
    Other: [
        { name: "Spinner", on: () => phOn("spin_ON"), pages: [spinnerPage] },
        { name: "Camera", on: () => (PH.idx.camMode | 0) > 0, pages: [cameraPage] },
        { name: "Spectator", on: () => phOn("spec_on"), pages: [spectatorPage] },
        { name: "Hide Status", on: () => phOn("hide"), pages: [hidePage] },
        { name: "Streamer Mode", on: () => phOn("streamer"), pages: [streamerPage] },
        { name: "Edit Controls", on: () => EDIT.on, pages: [editPage] },
        { name: "Unlock All", action: phAct("Unlock All") },
        { name: "Spectate Tag", pages: [tagPage("spectate")] },
        { name: "Profile Tag", pages: [tagPage("profile")] },
        { name: "Copy Tag", on: () => phOn("copytag"), pages: [copyTagPage] },
        { name: "Name Changer", on: () => phOn("namechg"), pages: [namePage] },
        { name: "Theme", on: () => !!THEME_SAVED.name, pages: [themePage] },
        { name: "Extras", pages: [extrasPage] },
        { name: "Log Test", action: () => log("Log Test, PH =", JSON.stringify(PH)) },
        { name: "Old menu", action: uiOldMenu },
    ],
};
const kpTileText = (f) => f.name + (f.on && f.on() ? "  [ON]" : "");
// Seitenliste: pro Tab eine Startseite (Kachelraster) + die Konfigurationsseiten der Features
const KPAGES = [];
for (const tab of KTABS) {
    KPAGES.push({ tab, feat: null, home: true, n: 0, of: 1, build: () => uiHomePage(tab) });
    for (const f of KFEATS[tab]) {
        if (!f.pages)
            continue;
        f.first = KPAGES.length;
        f.pages.forEach((b, n) => KPAGES.push({ tab, feat: f.name, home: false, n, of: f.pages.length, build: b }));
    }
}
const uiHomeIdx = (tab) => KPAGES.findIndex((pg) => pg.tab === tab && pg.home);
function uiHomePage(tab) {
    const T = uiTop();
    KFEATS[tab].forEach((f, i) => {
        const col = i % 3, row = (i / 3) | 0;
        const e = uiBtn(kpTileText(f), uiColX(col) + 100, T + 124 + row * 66, 200, () => {
            if (f.pages)
                uiGo(f.first);
            else if (f.action)
                f.action();
        });
        if (e)
            UI.live.push({ page: UI.building, fn: () => { uiSetText(e.o, kpTileText(f)); } });
    });
}
// ---------- Rahmen, Tabs, Seitenwechsel ----------
function uiTabsRefresh() {
    const pg = KPAGES[UI.cur];
    for (const t of UI.tabs)
        uiSetText(t.e.o, t.name === pg.tab ? "[" + t.name + "]" : t.name);
    if (UI.title) {
        uiLabelSet(UI.title, "PSC v1.0  -  " + pg.tab +
            (pg.feat ? " / " + pg.feat + (pg.of > 1 ? "  (" + (pg.n + 1) + "/" + pg.of + ")" : "") : ""));
    }
}
// Unten auf jeder Konfigurationsseite: "<- Back" und bei mehreren Seiten "<--" / "-->"
function uiNav(i) {
    const pg = KPAGES[i], L = -UI.W / 2, by = uiTop() + UI.H - 24, home = uiHomeIdx(pg.tab);
    uiBtn("<- Back", L + 24 + 75, by, 150, () => uiGo(home));
    if (pg.of > 1) {
        if (pg.n > 0)
            uiBtn("<--", L + UI.W - 24 - 150, by, 90, () => uiGo(i - 1));
        if (pg.n < pg.of - 1)
            uiBtn("-->", L + UI.W - 24 - 50, by, 90, () => uiGo(i + 1));
    }
}
function uiBuildPage(i) {
    const pg = KPAGES[i];
    UI.done.add(i);
    UI.building = i;
    try {
        pg.build();
        if (!pg.home)
            uiNav(i);
    }
    catch (e) {
        log("[UI] Seite fehlgeschlagen:", pg.tab, pg.feat, e, e.stack);
    }
    UI.building = -1;
}
function uiGo(i) {
    if (!UI.open || i < 0 || i >= KPAGES.length)
        return;
    UI.cur = i;
    if (!UI.done.has(i))
        uiBuildPage(i);
    uiApply();
    uiTabsRefresh();
    uiRefresh();
}
function uiBuild(container) {
    if (UI.fails >= 6) {
        log("[UI] zu viele Fehler - dbg.ui.rebuild() setzt zurueck");
        return false;
    }
    UI.container = container;
    UI.building = -1;
    ensureDebugSc();
    const L = -UI.W / 2, T = uiTop(), pad = UI.pad, bw = UI.W + 2 * pad, bh = UI.H + 2 * pad;
    try {
        UI.rootW = getWidth(container);
        UI.rootH = getHeight(container);
        log("[UI] Root-Groesse (getWidth/getHeight):", UI.rootW.toFixed(1), UI.rootH.toFixed(1));
    }
    catch (_) { /* nur Info */ }
    // Touch-Blocker hinter dem Hintergrund (Taps sollen nicht ins Spiel durchgehen)
    const hit = createButton(container, "sc/debug.sc", "debug_menu_text", NaN, NaN, bw, bh, true);
    if (hit) {
        uiSetText(hit, "");
        uiAdd(hit, UI.anchor === "center" ? 0 : -bw / 2, UI.anchor === "center" ? 0 : -bh / 2, bw, bh);
        onPress(hit, () => { });
    }
    // Hintergrund: reines Bild; sonst als Button-Fallback
    const bg = uiPlain(UI_BG_CLIPS, bw, bh, false, 0);
    if (bg) {
        uiAdd(bg, UI.bgTL ? -bw / 2 : 0, UI.bgTL ? -bh / 2 : 0, bw, bh);
    }
    else {
        const b = uiBtn("", 0, 0, 0, () => { }, [bw, bh]);
        if (!b) {
            UI.fails++;
            log("[UI] kein Hintergrund-Clip gefunden");
            return false;
        }
    }
    UI.title = uiLabelP("PSC v1.0", L + 24, T + 24, 28); // y = Textmitte (wie Android)
    uiLine(L + 24, T + 44, UI.W - 48);
    const tw = (UI.W - 48) / KTABS.length;
    UI.tabs = [];
    KTABS.forEach((name, n) => {
        const e = uiBtn(name, L + 24 + tw * (n + 0.5), T + 66, tw - 10, () => uiGo(uiHomeIdx(name)));
        if (e)
            UI.tabs.push({ name, e });
    });
    uiLine(L + 24, T + 86, UI.W - 48);
    uiBtn("Close", 0, T + UI.H - 24, 160, () => uiClose());
    UI.built = true;
    uiBuildPage(UI.cur);
    log("[UI] gebaut: Seite", UI.cur, "Elemente", UI.els.length, "Fehler", UI.fails);
    return true;
}
// Alte Elemente vergessen. hide=true: vorher verstecken (nur wenn der Container noch lebt).
function uiDrop(hide) {
    if (hide)
        for (const e of UI.els) {
            try {
                setXY(e.o, NaN, NaN);
            }
            catch (_) { /* ignorieren */ }
        }
    UI.els = [];
    UI.tabs = [];
    UI.title = null;
    UI.live = [];
    UI.done = new Set();
    UI.sliders = [];
    UI.drag = null;
    UI.built = false;
    UI.open = false;
    UI.btnRes = -1;
    UI.knobRes = -1;
    UI.checkRes = -1;
    UI.fails = 0;
}
function uiOpen(container) {
    if (!ownAlive(container)) {
        if (rootMenu && !rootHealthy())
            teardown("uiOpen");
        return;
    }
    try {
        if (UI.built && !container.equals(UI.container))
            uiDrop(false); // anderer Container -> alte Elemente sind weg
        if (!UI.built && !uiBuild(container)) {
            log("[UI] Aufbau fehlgeschlagen - siehe Log");
            return;
        }
        UI.open = true;
        uiAutoCenter();
        uiApply();
        uiTabsRefresh();
        uiRefresh();
    }
    catch (e) {
        log("[UI] Fehler beim Oeffnen:", e, e.stack);
        UI.open = false;
    }
}
function uiClose() { UI.open = false; UI.drag = null; uiApply(); }
function uiToggle(container) { if (UI.open)
    uiClose();
else
    uiOpen(container); }
// ============================================================
//  Automatische Mitte
//  Bildschirmgroesse (UIScreen) / Touch-Skalierung -> Groesse des UI-Raums in Einheiten -> Panel-Mitte.
//  Greift erst, wenn die Touch-Skalierung kalibriert ist (nach ein paar Taps im Menue) bzw. beim naechsten Oeffnen.
//  Wurde das Panel per Edit Controls verschoben, bleibt seine Position (dbg.ui.center() setzt sie zurueck).
// ============================================================
// UIScreen ueber die ObjC-Runtime direkt (C-Funktionen) - unabhaengig davon, ob die ObjC-Bridge im Frida-Build steckt.
const SCREEN = (() => {
    try {
        const getClass = new NativeFunction(gexport("objc_getClass"), "pointer", ["pointer"]);
        const selReg = new NativeFunction(gexport("sel_registerName"), "pointer", ["pointer"]);
        const msgP = new NativeFunction(gexport("objc_msgSend"), "pointer", ["pointer", "pointer"]);
        const msgRect = new NativeFunction(gexport("objc_msgSend"), ["double", "double", "double", "double"], ["pointer", "pointer"]);
        const msgD = new NativeFunction(gexport("objc_msgSend"), "double", ["pointer", "pointer"]);
        const scr = msgP(getClass(Memory.allocUtf8String("UIScreen")), selReg(Memory.allocUtf8String("mainScreen")));
        if (scr.isNull())
            return null;
        const r = msgRect(scr, selReg(Memory.allocUtf8String("bounds")));
        const w = Number(r[2]), h = Number(r[3]);
        let sc = 1;
        try {
            sc = Number(msgD(scr, selReg(Memory.allocUtf8String("scale"))));
        }
        catch (_) { /* egal */ }
        if (!(w > 0 && h > 0))
            return null;
        return { w: Math.max(w, h), h: Math.min(w, h), scale: sc > 0 ? sc : 1 };
    }
    catch (_) {
        return null;
    }
})();
function uiAutoCenter(force) {
    if (UI.manualPos && !force)
        return false;
    let cx = 0, cy = 0, src = "";
    if (SCREEN && UI.calibrated && UI.scale > 0) {
        // Touch in Punkten oder Pixeln? Nur eine Variante ergibt einen plausiblen UI-Raum (~900-1700 breit)
        for (const k of [1, SCREEN.scale]) {
            const wu = SCREEN.w * k / UI.scale, hu = SCREEN.h * k / UI.scale;
            if (wu > 900 && wu < 1700 && hu > 500 && hu < 800) {
                cx = wu / 2;
                cy = hu / 2;
                src = "Bildschirm " + SCREEN.w + "x" + SCREEN.h + " x" + k + " / Skalierung " + UI.scale.toFixed(2);
                break;
            }
        }
    }
    if (!cx && UI.rootW > 600 && UI.rootH > 300) {
        const okAspect = !SCREEN || Math.abs(UI.rootW / UI.rootH - SCREEN.w / SCREEN.h) < 0.12 * (SCREEN.w / SCREEN.h);
        if (okAspect) {
            cx = UI.rootW / 2;
            cy = UI.rootH / 2;
            src = "Root-Groesse " + UI.rootW.toFixed(0) + "x" + UI.rootH.toFixed(0);
        }
    }
    if (!cx) {
        if (force) {
            UI.cx = UI.cx0;
            UI.cy = UI.cy0;
            if (UI.open)
                uiApply();
            try {
                qaEnsure();
            }
            catch (_) { /* egal */ }
        }
        return false;
    }
    cx = Math.round(cx);
    cy = Math.round(cy);
    if (Math.abs(cx - UI.cx) < 6 && Math.abs(cy - UI.cy) < 6)
        return false;
    UI.cx = cx;
    UI.cy = cy;
    log("[UI] Mitte gesetzt:", cx, cy, "(" + src + ")");
    if (UI.open)
        uiApply();
    try {
        qaEnsure();
    }
    catch (_) { /* egal */ }
    return true;
}
log("[UI] Bildschirm:", SCREEN ? SCREEN.w + "x" + SCREEN.h + " @" + SCREEN.scale + "x" : "unbekannt (Root-Groesse wird als Ersatz genutzt)");
// ============================================================
//  HUD  (Port aus neuerdodge.js, Textzeile oben links, Schalter im Menue: HUD)
//  Reiner Text (TextField des Clips debug_menu_item, kein Button -> keine Touch-Flaeche). Haengt im Root-Container
//  (derselbe wie D-Button / Quick Access) und wird bei Container-Wechsel neu angelegt. Aufbau/Pflege nur auf dem Game-Thread
//  (aus qaEnsure heraus, also nach Button-Druck, Menue-Aufbau und Root-Wiederherstellung).
//  Konsole: dbg.hud.toggle() | dbg.hud.text("...") | dbg.hud.pos(x, y) | dbg.hud.size(n)   (wirkt beim naechsten Button-Druck)
// ============================================================
// Wie Android (neuerdodge.js): EIN Textfeld (reiner Text, multiline, Box 50 hoch), hier eine Zeile, kleine Schrift, ganz links oben.
const HUD = { tf: ptr(0), container: ptr(0), fails: 0, creates: 0, hidden: false, dirty: false,
    text: "", x: 10, y: 30, size: 13, w: 0, h: 50, offX: 45, offY: -11 };
// x/y = Position im Bildschirm (linker Rand, Mitte der Zeile); offX/offY gleichen den Versatz des Root-Containers aus (aus Screenshots gemessen).
if (PH.on.hud === undefined)
    PH.on.hud = true; // wie Android: standardmaessig an
// iOS-Infos fuer die HUD-Zeile: iOS-Version (UIDevice), Geraetemodell (sysctl hw.machine), CPU-Architektur
function iosInfo() {
    let ver = "", model = "";
    try {
        const getClass = new NativeFunction(gexport("objc_getClass"), "pointer", ["pointer"]);
        const selReg = new NativeFunction(gexport("sel_registerName"), "pointer", ["pointer"]);
        const msgP = new NativeFunction(gexport("objc_msgSend"), "pointer", ["pointer", "pointer"]);
        const sel = (n) => selReg(Memory.allocUtf8String(n));
        const dev = msgP(getClass(Memory.allocUtf8String("UIDevice")), sel("currentDevice"));
        if (!dev.isNull()) {
            const ns = msgP(dev, sel("systemVersion"));
            if (!ns.isNull()) {
                const c = msgP(ns, sel("UTF8String"));
                if (!c.isNull())
                    ver = c.readUtf8String() || "";
            }
        }
    }
    catch (_) { /* egal */ }
    try {
        const sysctlbyname = new NativeFunction(gexport("sysctlbyname"), "int", ["pointer", "pointer", "pointer", "pointer", "ulong"]);
        const buf = Memory.alloc(64), len = Memory.alloc(8);
        len.writeU64(64);
        if (sysctlbyname(Memory.allocUtf8String("hw.machine"), buf, len, NULL, 0) === 0)
            model = buf.readUtf8String() || "";
    }
    catch (_) { /* egal */ }
    return "PSC Brawl (Dev) iOS " + (ver || "?") + " " + (model || "iPhone") + " " + Process.arch;
}
// Standardtext wie Android ("\nPSC Brawl (Dev) arm64-v8a"), hier mit iOS-Infos und gruener Faerbung <cRRGGBB>..</c>
function hudDefault() { return "<c00ff04>" + iosInfo() + "</c>"; }
const hudPlain = (l) => l.replace(/<\/?c[0-9a-fA-F]{0,8}>/g, "");
function hudApply(tf) {
    if (!HUD.text)
        HUD.text = hudDefault();
    // Box-Breite = Textbreite (gemessen: ca. 0.81 x Schriftgroesse je Zeichen, +4% Reserve). Das Spiel zentriert den Text in der Box:
    // so breit wie der Text -> er beginnt am linken Rand; zu knapp -> Umbruch/Stauchung.
    const longest = HUD.text.split("\n").reduce((m, l) => Math.max(m, hudPlain(l).length), 0);
    HUD.w = Math.ceil(longest * HUD.size * 0.84) + 8;
    setText(tf, strC(HUD.text));
    try {
        setMultiline(tf, 1);
    }
    catch (_) { /* egal */ }
    try {
        setFontSize(tf, HUD.size);
    }
    catch (_) { /* egal */ }
    setWidth(tf, HUD.w);
    setHeight(tf, HUD.h);
}
function hudEnsure() {
    if (HUD.fails >= 5)
        return;
    const c = rootContainer();
    if (!c)
        return;
    if (!HUD.tf.isNull() && !c.equals(HUD.container)) {
        HUD.tf = ptr(0);
        HUD.container = ptr(0);
        HUD.hidden = false;
    } // anderer Container: altes Textfeld ist weg
    if (!phOn("hud")) {
        if (!HUD.tf.isNull() && !HUD.hidden && ownAlive(HUD.tf)) {
            setXY(HUD.tf, NaN, NaN);
            HUD.hidden = true;
        }
        return;
    }
    if (HUD.tf.isNull()) {
        if (HUD.creates >= 30)
            return;
        HUD.creates++;
        ensureDebugSc();
        const mc = getMovieClip(Memory.allocUtf8String("sc/debug.sc"), Memory.allocUtf8String("debug_menu_item"));
        if (mc.isNull()) {
            HUD.fails++;
            log("[HUD] MovieClip debug_menu_item nicht gefunden (" + HUD.fails + "/5)");
            return;
        }
        const tf = getTF(mc, Memory.allocUtf8String("Text"));
        if (tf.isNull()) {
            HUD.fails++;
            log("[HUD] TextField 'Text' nicht gefunden (" + HUD.fails + "/5)");
            return;
        }
        hudApply(tf);
        addChild(c, tf);
        ownReg(tf, c);
        HUD.tf = tf;
        HUD.container = c;
        HUD.hidden = false;
        HUD.dirty = false;
        log("[HUD] Text erstellt");
    }
    else if (HUD.hidden) {
        if (!ownAlive(HUD.tf))
            return;
        HUD.hidden = false;
        addChild(c, HUD.tf); // wieder ganz nach vorne
    }
    if (!ownAlive(HUD.tf))
        return;
    if (HUD.dirty) {
        HUD.dirty = false;
        hudApply(HUD.tf);
    }
    setXY(HUD.tf, HUD.x - HUD.offX, HUD.y - HUD.offY - HUD.h / 2);
}
const HudApi = {
    state: HUD,
    toggle: (on) => { PH.on.hud = on === undefined ? !PH.on.hud : !!on; log("[HUD]", PH.on.hud ? "AN" : "AUS", "- wirkt beim naechsten Button-Druck"); },
    text: (t) => { HUD.text = String(t); HUD.dirty = true; log("[HUD] Text =", HUD.text); }, // z.B. "\n<c00ff04>Text</c>" (\n am Anfang = eine Zeile tiefer)
    ios: () => { HUD.text = hudDefault(); HUD.dirty = true; log("[HUD] Text =", HUD.text); },
    pos: (x, y) => { HUD.x = +x; HUD.y = +y; log("[HUD] Pos (linker Rand, Mitte der Zeile) =", HUD.x, HUD.y); },
    off: (x, y) => { HUD.offX = +x; HUD.offY = +y; log("[HUD] Versatz =", HUD.offX, HUD.offY); },
    size: (n) => { HUD.size = Math.max(8, Math.min(60, n | 0)); HUD.dirty = true; log("[HUD] Schrift =", HUD.size); },
};
// ============================================================
//  Quick Access  (Port aus neuerdodge.js)
//  Kleine An/Aus-Buttons oben rechts, je Feature (Dodge / Aura / Aim / Spin). Sichtbar, wenn auf der Feature-Seite
//  "Quick Access" angehakt ist; Antippen schaltet das Feature (hier: den Platzhalter-Zustand) um.
//  Gebaut wird nur auf dem Game-Thread (aus dem Button-Handler heraus).  Konsole: dbg.qa.dump() | dbg.qa.enable("aura", true)
// ============================================================
const QA = {
    step: 52,
    defs: [
        { key: "dodge", label: "Dodge", on: "dodge_ON", flag: "dodge_QA" },
        { key: "aura", label: "Aura", on: "aura_ON", flag: "aura_QA" },
        { key: "aimbot", label: "Aim", on: "aimbot_ON", flag: "aimbot_QA" },
        { key: "spinner", label: "Spin", on: "spin_ON", flag: "spin_QA" },
    ],
    b: {},
    pos: {},
    container: ptr(0),
    fails: 0,
    clips: [["sc/ui.sc", "map_editor_exit_button"], ["sc/debug.sc", "debug_menu_item"]],
};
const qaText = (d) => d.label + " " + (phOn(d.on) ? "ON" : "OFF");
function rootContainer() {
    const m = rootMenu || current;
    return m && ownAlive(m.parent) ? m.parent : null;
}
// Button im Root-Container anlegen (Clip-Fallback wie bei Android)
function qaMakeBtn(c, label, x, y, fn) {
    for (const cl of QA.clips) {
        const b = createButton(c, cl[0], cl[1], x, y, undefined, undefined, true);
        if (!b)
            continue;
        uiSetText(b, label);
        onPress(b, fn);
        return b;
    }
    return null;
}
const qaDefaultPos = (row) => [Math.round(UI.cx * 2 - 49), 100 + row * QA.step];
function qaClick(d) {
    PH.on[d.on] = !PH.on[d.on];
    phLog(d.key, PH.on[d.on] ? "ON" : "OFF", "(Quick Access)");
    qaLabels();
    uiRefresh();
}
function qaLabels() {
    for (const d of QA.defs) {
        const e = QA.b[d.key];
        if (!e || e.hidden)
            continue;
        const t = qaText(d);
        if (t !== e.text) {
            e.text = t;
            uiSetText(e.btn, t);
        }
    }
}
function qaEnsure() {
    try {
        hudEnsure();
    }
    catch (e) {
        HUD.fails++;
        log("[HUD] Fehler:", e);
    }
    if (QA.fails >= 5)
        return;
    const c = rootContainer();
    if (!c)
        return;
    if (!QA.container.isNull() && !c.equals(QA.container)) { // anderer Container: alte Buttons sind weg -> nur vergessen
        for (let i = handlers.length - 1; i >= 0; i--)
            if (Object.values(QA.b).some((e) => e.btn.equals(handlers[i].ptr)))
                handlers.splice(i, 1);
        QA.b = {};
        QA.container = ptr(0);
    }
    let row = 0;
    for (const d of QA.defs) {
        let e = QA.b[d.key];
        if (!phOn(d.flag)) {
            if (e && !e.hidden) {
                setXY(e.btn, NaN, NaN);
                e.hidden = true;
            }
            continue;
        }
        const pos = QA.pos[d.key] || qaDefaultPos(row);
        row++;
        if (!e) {
            const b = qaMakeBtn(c, qaText(d), pos[0], pos[1], () => qaClick(d));
            if (!b) {
                QA.fails++;
                log("[QuickAccess] kein Button-Clip gefunden fuer", d.key, "(" + QA.fails + "/5)");
                continue;
            }
            e = { btn: b, hidden: false, text: qaText(d) };
            QA.b[d.key] = e;
            QA.container = c;
            log("[QuickAccess] Button erstellt:", d.key, "bei", pos[0] + "," + pos[1]);
        }
        else if (e.hidden) {
            if (!ownAlive(e.btn))
                continue;
            e.hidden = false;
            addChild(c, e.btn);
        } // wieder nach ganz vorne
        setXY(e.btn, pos[0], pos[1]);
        qaLabels();
    }
}
// Haekchen "Quick Access" einer Feature-Seite (prefix = "aura_", "aimbot_", "dodge_", "spin_")
const qaCk = (prefix) => ["Quick Access", () => phOn(prefix + "QA"), () => {
        PH.on[prefix + "QA"] = !PH.on[prefix + "QA"];
        phLog("QuickAccess", prefix, PH.on[prefix + "QA"] ? "AN" : "AUS");
        try {
            qaEnsure();
        }
        catch (e) {
            QA.fails++;
            log("[QuickAccess] Fehler:", e);
        }
    }];
// ============================================================
//  Edit Controls  (Port aus neuerdodge.js)
//  Verschiebbar per Finger: Quick-Access-Buttons (je einzeln), der D-Button und das ganze Menue-Panel (an beliebiger Stelle anfassen).
//  Settings > Other > Edit Controls schaltet den Modus ein. Solange er an ist, tun Taps auf unsere Buttons nichts (sie werden nur verschoben);
//  "Edit DONE" / "Edit RESET" (fest, nicht verschiebbar) beenden den Modus bzw. stellen die Standardplaetze wieder her.
//  Positionen werden in <App>/Documents/kitmod_ios_ui.json gespeichert.
//  Konsole: dbg.edit.on(true/false) | dbg.edit.reset() | dbg.edit.dump()
// ============================================================
const EDIT = {
    on: false,
    drag: null,
    ui: null,
    moves: 0,
};
const editScale = () => (PH.val.edit_scale !== undefined ? PH.val.edit_scale / 10 : UI.scale); // Slider "Drag scale" = manuell, sonst automatisch
const editIsUi = (btn) => !!(EDIT.ui && (EDIT.ui.done.equals(btn) || EDIT.ui.rst.equals(btn)));
const rdPos = (o) => ({ x: o.add(0x20).readFloat(), y: o.add(0x24).readFloat() });
function editGroup(btn) {
    for (const m of menus)
        if (m.toggle && m.toggle.equals(btn))
            return "toggle";
    for (const d of QA.defs) {
        const e = QA.b[d.key];
        if (e && !e.hidden && e.btn.equals(btn))
            return "qa:" + d.key;
    }
    if (UI.open)
        for (const e of UI.els)
            if (e.shown && e.o.equals(btn))
                return "panel";
    return null;
}
function editApply(d, nx, ny) {
    if (d.g === "panel") {
        UI.cx = Math.round(nx);
        UI.cy = Math.round(ny);
        UI.manualPos = true;
        uiApply();
    }
    else if (d.g === "toggle") {
        CFG.toggleX = Math.round(nx);
        CFG.toggleY = Math.round(ny);
        setXY(d.btn, nx, ny);
    }
    else {
        QA.pos[d.g.slice(3)] = [Math.round(nx), Math.round(ny)];
        setXY(d.btn, nx, ny);
    }
    EDIT.moves++;
}
function editUiEnsure() {
    const c = rootContainer();
    if (!c)
        return;
    if (EDIT.ui && !EDIT.ui.container.equals(c))
        EDIT.ui = null;
    if (EDIT.ui && (!ownAlive(EDIT.ui.done) || !ownAlive(EDIT.ui.rst)))
        EDIT.ui = null;
    const dx = Math.round(UI.cx), dy = Math.round(UI.cy * 2 - 50); // fest: unten in der Bildschirmmitte
    if (EDIT.on) {
        if (!EDIT.ui) {
            const done = qaMakeBtn(c, "Edit DONE", dx - 100, dy, () => editOn(false));
            const rst = qaMakeBtn(c, "Edit RESET", dx + 100, dy, () => editReset());
            if (!done || !rst) {
                log("[Edit] Done/Reset-Buttons konnten nicht erstellt werden");
                return;
            }
            EDIT.ui = { done, rst, container: c };
        }
        setXY(EDIT.ui.done, dx - 100, dy);
        setXY(EDIT.ui.rst, dx + 100, dy);
        addChild(c, EDIT.ui.done);
        addChild(c, EDIT.ui.rst); // ganz nach vorne
    }
    else if (EDIT.ui) {
        setXY(EDIT.ui.done, NaN, NaN);
        setXY(EDIT.ui.rst, NaN, NaN);
    }
}
function editOn(v) {
    EDIT.on = v;
    EDIT.drag = null;
    PH.on.edit_on = v;
    log("[Edit] Edit Controls", v ? "AN (Buttons / Menue mit dem Finger ziehen, danach 'Edit DONE' tippen)" : "AUS (Positionen bleiben gespeichert)");
    try {
        editUiEnsure();
    }
    catch (e) {
        log("[Edit] UI-Fehler:", e);
    }
    if (!v)
        persistSave();
    uiRefresh();
}
function editReset() {
    QA.pos = {};
    CFG.toggleX = 20;
    CFG.toggleY = 577;
    for (const m of menus) {
        try {
            if (m.toggle)
                setXY(m.toggle, CFG.toggleX, CFG.toggleY);
        }
        catch (_) { /* egal */ }
    }
    UI.manualPos = false;
    UI.cx = UI.cx0;
    UI.cy = UI.cy0;
    uiAutoCenter(true);
    try {
        qaEnsure();
    }
    catch (_) { /* egal */ }
    try {
        editUiEnsure();
    }
    catch (_) { /* egal */ }
    if (UI.open)
        uiApply();
    persistSave();
    log("[Edit] alle Positionen auf Standard zurueckgesetzt");
}
// ---- Speichern / Laden (Frida File-API, Pfad ueber $HOME) ----
function persistPath() {
    try {
        const home = new NativeFunction(gexport("getenv"), "pointer", ["pointer"])(Memory.allocUtf8String("HOME"));
        if (home.isNull())
            return null;
        return home.readUtf8String() + "/Documents/kitmod_ios_ui.json";
    }
    catch (_) {
        return null;
    }
}
// Gespeichert wird: Button-/Menue-Positionen + ALLE Menue-Einstellungen (Haekchen, Regler, Auswahlwerte, Quick-Access-Haken).
// Die Hauptschalter (*_ON) und "Edit Controls" werden bewusst NICHT wiederhergestellt -> Cheats starten nie von selbst.
const PERSIST_SKIP = (k) => /_ON$/.test(k) || k === "edit_on";
let persistLast = "";
const THEME_SAVED = { name: "" }; // gewaehltes Theme (Name; "" = Server-Theme) - wird von Theme Changer gelesen/geschrieben
function persistSnapshot() {
    const on = {}, val = {}, idx = {};
    for (const k of Object.keys(PH.on))
        if (!PERSIST_SKIP(k))
            on[k] = !!PH.on[k];
    for (const k of Object.keys(PH.val))
        if (isFinite(PH.val[k]))
            val[k] = PH.val[k];
    for (const k of Object.keys(PH.idx))
        if (isFinite(PH.idx[k]))
            idx[k] = PH.idx[k];
    return JSON.stringify({ v: 2, qa: QA.pos, toggle: [CFG.toggleX, CFG.toggleY], panel: UI.manualPos ? [UI.cx, UI.cy] : null, on, val, idx, theme: THEME_SAVED.name });
}
function persistSave() {
    try {
        const path = persistPath();
        if (!path)
            return;
        const snap = persistSnapshot();
        const f = new File(path, "w");
        f.write(snap);
        f.flush();
        f.close();
        persistLast = snap;
    }
    catch (e) {
        log("[Edit] Speichern fehlgeschlagen:", e);
    }
}
function persistLoad() {
    try {
        const path = persistPath();
        if (!path)
            return;
        const txt = File.readAllText(path);
        const d = JSON.parse(txt);
        const ok2 = (v) => Array.isArray(v) && v.length === 2 && isFinite(v[0]) && isFinite(v[1]) && Math.abs(v[0]) < 5000 && Math.abs(v[1]) < 5000;
        if (d.qa && typeof d.qa === "object")
            for (const k of Object.keys(d.qa))
                if (ok2(d.qa[k]))
                    QA.pos[k] = [+d.qa[k][0], +d.qa[k][1]];
        if (ok2(d.toggle)) {
            CFG.toggleX = +d.toggle[0];
            CFG.toggleY = +d.toggle[1];
        }
        if (ok2(d.panel)) {
            UI.cx = +d.panel[0];
            UI.cy = +d.panel[1];
            UI.manualPos = true;
        }
        let n = 0;
        if (d.on && typeof d.on === "object")
            for (const k of Object.keys(d.on))
                if (!PERSIST_SKIP(k) && typeof d.on[k] === "boolean") {
                    PH.on[k] = d.on[k];
                    n++;
                }
        if (d.val && typeof d.val === "object")
            for (const k of Object.keys(d.val))
                if (typeof d.val[k] === "number" && isFinite(d.val[k])) {
                    PH.val[k] = d.val[k];
                    n++;
                }
        if (d.idx && typeof d.idx === "object")
            for (const k of Object.keys(d.idx))
                if (typeof d.idx[k] === "number" && isFinite(d.idx[k])) {
                    PH.idx[k] = d.idx[k] | 0;
                    n++;
                }
        if (typeof d.theme === "string")
            THEME_SAVED.name = d.theme;
        persistLast = persistSnapshot();
        log("[Edit] Positionen + " + n + " Einstellungen geladen aus", path);
    }
    catch (_) { /* noch keine Datei */ }
}
persistLoad();
// Autosave: alle 2 s pruefen, ob sich Einstellungen/Positionen geaendert haben (deckt Haekchen, Regler, Quick-Access usw. ab)
setInterval(() => { try {
    if (persistSnapshot() !== persistLast)
        persistSave();
}
catch (_) { /* egal */ } }, 2000);
Interceptor.attach(base.add(O.TouchBegan), {
    onEnter(args) {
        if (!EDIT.on || args[1].isNull())
            return;
        try {
            const g = editGroup(args[0]);
            if (!g)
                return;
            const t = readTouch(args[1]);
            if (!isFinite(t.x) || !isFinite(t.y))
                return;
            const st = g === "panel" ? { x: UI.cx, y: UI.cy } : rdPos(args[0]);
            EDIT.drag = { g, btn: args[0], id: t.id, px0: t.x, py0: t.y, sx: st.x, sy: st.y, moved: false };
            if (g !== "panel")
                uiCalib(st.x, t.x);
        }
        catch (e) {
            log("[Edit] touchBegan Fehler:", e);
            EDIT.drag = null;
        }
    },
});
Interceptor.attach(base.add(O.TouchMoved), {
    onEnter(args) {
        const d = EDIT.drag;
        if (!EDIT.on || !d || args[1].isNull())
            return;
        try {
            const t = readTouch(args[1]);
            if (t.id !== d.id || !isFinite(t.x) || !isFinite(t.y))
                return;
            if (!d.moved && Math.abs(t.x - d.px0) + Math.abs(t.y - d.py0) < 8)
                return; // Zittern = Tap
            d.moved = true;
            const sc = editScale() || 1;
            editApply(d, d.sx + (t.x - d.px0) / sc, d.sy + (t.y - d.py0) / sc);
        }
        catch (e) {
            log("[Edit] touchMoved Fehler:", e);
        }
    },
});
Interceptor.attach(base.add(O.TouchEnded), {
    onEnter(args) {
        const d = EDIT.drag;
        if (!d)
            return;
        try {
            const t = args[1].isNull() ? null : readTouch(args[1]);
            if (t && t.id !== d.id)
                return;
            EDIT.drag = null;
            if (d.moved) {
                log("[Edit] verschoben:", d.g, d.g === "panel" ? [UI.cx, UI.cy] : d.g === "toggle" ? [CFG.toggleX, CFG.toggleY] : QA.pos[d.g.slice(3)], "(Skalierung " + editScale().toFixed(2) + ")");
                persistSave();
            }
        }
        catch (e) {
            log("[Edit] touchEnded Fehler:", e);
            EDIT.drag = null;
        }
    },
});
// ---------- Regler ziehen (Port von "Killaura panel: drag slider knobs" aus neuerdodge.js) ----------
function readTouch(ev) {
    return { id: ev.add(TOUCH.idOff).readS32(), x: ev.add(TOUCH.xOff).readFloat(), y: ev.add(TOUCH.yOff).readFloat() };
}
function uiKnobAt(btn) {
    for (const s of UI.sliders)
        if (uiVisible(s.el) && s.k.equals(btn))
            return s;
    return null;
}
// Skalierung Finger -> Bildschirm-Einheiten per Regressionsgerade aus den Beruehrungspunkten schaetzen
// (lx = Position in Root-Einheiten, px = Touch-x). Zusaetzlich zu den Knoepfen zaehlen auch Taps auf Tabs/Kacheln/Buttons.
function uiCalib(lx, px) {
    UI.cal.push([lx, px]);
    if (UI.cal.length > 16)
        UI.cal.shift();
    const n = UI.cal.length;
    if (n < 2)
        return;
    let mx = 0, my = 0;
    for (const [a, b] of UI.cal) {
        mx += a;
        my += b;
    }
    mx /= n;
    my /= n;
    let sxx = 0, sxy = 0;
    for (const [a, b] of UI.cal) {
        sxx += (a - mx) * (a - mx);
        sxy += (a - mx) * (b - my);
    }
    if (Math.sqrt(sxx / n) < 40)
        return; // Punkte zu dicht beieinander -> ungenau
    const sc = sxy / sxx;
    if (sc > 0.2 && sc < 10 && Math.abs(sc - UI.scale) > 0.02) {
        UI.scale = sc;
        UI.calibrated = true;
        log("[UI] Skalierung kalibriert:", sc.toFixed(2), "(n=" + n + ", Achsenabschnitt " + (my - sc * mx).toFixed(1) + ")");
        uiAutoCenter();
    }
    else if (sc > 0.2 && sc < 10)
        UI.calibrated = true;
}
function uiCalibFromButton(btn, tx) {
    for (const e of UI.els) {
        if (!e.o.equals(btn) || e.w > 300 || e.h > 100 || e.w <= 0)
            continue;
        uiCalib(UI.cx + e.rx + (UI.anchor === "center" ? 0 : e.w / 2), tx);
        return;
    }
}
Interceptor.attach(base.add(O.TouchBegan), {
    onEnter(args) {
        if (!UI.open || args[1].isNull())
            return;
        try {
            const t = readTouch(args[1]);
            if (UI.touchLog)
                log("touch down", t.id, t.x, t.y);
            if (EDIT.on)
                return; // im Edit-Modus wird nur verschoben
            if (!isFinite(t.x))
                return;
            const s = uiKnobAt(args[0]);
            if (!s) {
                uiCalibFromButton(args[0], t.x);
                return;
            }
            UI.drag = { s, id: t.id, px0: t.x, kx0: s.kx, last: null };
            uiCalib(UI.cx + s.kx, t.x);
        }
        catch (e) {
            log("Fehler kp touchBegan:", e);
        }
    },
});
Interceptor.attach(base.add(O.TouchMoved), {
    onEnter(args) {
        const dr = UI.drag;
        if (!UI.open || !dr || args[1].isNull())
            return;
        try {
            const t = readTouch(args[1]);
            if (t.id !== dr.id || !isFinite(t.x))
                return;
            const s = dr.s, d = s.d;
            const kx = Math.max(s.x0, Math.min(s.x1, dr.kx0 + (t.x - dr.px0) / UI.scale));
            let v = d.min + (kx - s.x0) / ((s.x1 - s.x0) || 1) * (d.max - d.min);
            v = d.min + Math.round((v - d.min) / d.step) * d.step;
            v = Math.round(Math.max(d.min, Math.min(d.max, v)) * 1e4) / 1e4;
            if (v === dr.last)
                return;
            dr.last = v;
            d.set(v);
            uiRefresh();
        }
        catch (e) {
            log("Fehler kp touchMoved:", e);
        }
    },
});
Interceptor.attach(base.add(O.TouchEnded), {
    onEnter(args) {
        const dr = UI.drag;
        if (!dr)
            return;
        try {
            const t = args[1].isNull() ? null : readTouch(args[1]);
            if (t && t.id !== dr.id)
                return;
            UI.drag = null;
            if (dr.last !== null)
                uiRefresh();
        }
        catch (e) {
            log("Fehler kp touchEnded:", e);
            UI.drag = null;
        }
    },
});
// ---------- Hooks ----------
Interceptor.attach(base.add(O.GameButtonCtor), {
    onEnter(args) { if (!creatingOwn)
        foreign.add(args[0].toString()); },
});
Interceptor.attach(base.add(O.SpriteAddChild), {
    onEnter(args) {
        this.parent = args[0];
        this.child = args[1];
    },
    onLeave() {
        if (creatingOwn)
            return;
        const parent = this.parent;
        const child = this.child;
        if (!foreign.has(child.toString()))
            return;
        const key = parent.toString();
        const n = (addCounts.get(key) || 0) + 1;
        addCounts.set(key, n);
        if (n < CFG.minAdds)
            return;
        if (rootMenu || probed)
            return;
        // NICHT sofort erstellen: Die Lobby baut danach noch viele Elemente auf (Parent bekam
        // im Log >50 Buttons) und die wuerden unseren Button ueberdecken. Stattdessen vormerken
        // und erst beim ersten Touch auf einen Button anlegen, dann liegt er ganz oben.
        // Zuerst versuchen, direkt im Root-Container (oberster Parent, bleibt zwischen Screens
        // bestehen) anzudocken -> Button ist dann immer da. Klappt das nicht (Parent noch nicht
        // an die Szene gehaengt), wird beim naechsten Touch erneut versucht.
        if (n === CFG.minAdds) {
            pending = parent;
            log("Parent vorgemerkt (Touch-Fallback):", parent);
        }
        if (!CFG.probe)
            ensureRootMenu(parent, true);
    },
});
// Kette der Parents nach oben (Button -> ... -> Root). Bricht ab bei NULL oder ungueltiger Adresse.
function chainOf(p, fast) {
    const chain = [];
    let cur = p;
    for (let i = 0; i < (fast ? 12 : 32); i++) {
        if (cur.isNull())
            break;
        // fast (im setXY-Tick, sehr oft aufgerufen): nur billige Pruefung auf Ausrichtung,
        // ungueltige Adressen fangen try/catch beim readPointer ab. Process.findRangeByAddress
        // ist langsam und hat das Laden der Lobby stark ausgebremst.
        if (fast) {
            if (!cur.and(ptr(7)).isNull())
                break;
        }
        else if (Process.findRangeByAddress(cur) === null)
            break;
        chain.push(cur);
        let next;
        try {
            next = cur.add(O.ParentOff).readPointer();
        }
        catch (_) {
            break;
        }
        if (next.equals(cur))
            break;
        cur = next;
    }
    return chain;
}
// Legt das Menue einmalig im obersten Container an. Gibt true zurueck, wenn es geklappt hat.
function ensureRootMenu(from, quiet) {
    if (rootMenu || probed)
        return true;
    const chain = chainOf(from);
    const key = from.toString();
    if (!quiet || lastLen.get(key) !== chain.length) {
        lastLen.set(key, chain.length);
        log("Kettenlaenge", chain.length, "Parent-Kette:", chain.map((c) => c.toString()).join(" -> "));
    }
    // Automatisch erst bei voller Tiefe (angehaengt), beim Touch reicht eine kuerzere Kette
    if (chain.length < (quiet ? CFG.rootDepth : 2))
        return false;
    if (CFG.probe) {
        probed = true;
        ensureDebugSc();
        chain.forEach((c, i) => {
            const b = createButton(c, "sc/debug.sc", "debug_button", 100 + 150 * i, 300);
            if (b) {
                setBtnText(b, "txt", "L" + i);
                log("Probe L" + i + " in Container", c, "bei x=" + (100 + 150 * i) + " y=300");
            }
        });
        return true;
    }
    const root = chain[chain.length - 1];
    buildMenu(root);
    if (current && current.parent.equals(root)) {
        rootMenu = current;
        log("Menue im Root-Container erstellt:", root);
        try {
            qaEnsure();
            editUiEnsure();
        }
        catch (e) {
            log("[Guard] Wiederherstellung fehlgeschlagen:", e);
        } // nach Neuaufbau Quick-Access/Edit-Buttons wieder anlegen
        return true;
    }
    return false;
}
function buildMenu(parent, x, y) {
    if (failures >= MAX_FAILURES)
        return; // Datei fehlt -> nicht weiter versuchen
    if (menus.some((m) => m.parent.equals(parent)))
        return;
    try {
        ownReg(parent, null); // Root merken (vtable), damit wir sein Verschwinden erkennen
        const m = new DebugMenu(parent, x, y);
        if (m.ok) {
            current = m;
            menus.push(m);
            log("Debug-Button erstellt in Parent", parent, describe(m));
        }
    }
    catch (e) {
        log("Fehler beim Erstellen:", e, e.stack);
    }
}
// Laeuft auf dem Game-Thread (Touch-Verarbeitung) -> sicherer als aus dem Frida-REPL-Thread.
// Der Parent kommt NICHT mehr aus der Zaehl-Heuristik, sondern vom Button, den du gerade
// beruehrt hast: der ist garantiert sichtbar, also ist sein Parent ein sichtbarer Container.
// Unser Toggle wird direkt neben diesem Button platziert (gleiches Koordinatensystem).
Interceptor.attach(base.add(O.TouchBegan), {
    onEnter(args) {
        if (rootMenu) {
            if (!rootHealthy())
                teardown("Touch");
            return;
        } // steht schon -> nur pruefen, ob er noch lebt
        if (probed)
            return;
        if (!pending)
            return;
        if (Date.now() - armedAt < CFG.fallbackAfterMs)
            return; // erst dem Tick Zeit geben, den stabilen Root zu finden
        const fallback = pending;
        pending = null;
        // Erst versuchen, im Root-Container anzudocken (Parent des beruehrten Buttons als Start)
        try {
            const p0 = args[0].add(O.ParentOff).readPointer();
            if (ensureRootMenu(p0))
                return;
        }
        catch (e) {
            log("Root-Suche fehlgeschlagen:", e);
        }
        let parent = fallback;
        let x = CFG.toggleX, y = CFG.toggleY;
        try {
            const touched = args[0];
            const p = touched.add(O.ParentOff).readPointer();
            const bx = touched.add(0x20).readFloat();
            const by = touched.add(0x24).readFloat();
            log("beruehrter Button", touched, "x=" + bx.toFixed(1), "y=" + by.toFixed(1), "parent=" + p, "(vorgemerkt war " + fallback + ")");
            if (!p.isNull() && isFinite(bx) && isFinite(by)) {
                parent = p;
                x = bx + 120;
                y = by;
            }
        }
        catch (e) {
            log("Parent/Position vom Button nicht lesbar, nehme vorgemerkten Parent:", e);
        }
        buildMenu(parent, x, y);
    },
});
Interceptor.attach(base.add(O.ButtonPressed), {
    onEnter(args) {
        const clicked = args[0];
        if (rootMenu && !rootHealthy()) {
            teardown("Button");
            return;
        }
        for (const h of handlers) {
            if (h.ptr.equals(clicked)) {
                if (!ownAlive(clicked)) {
                    handlers.splice(handlers.indexOf(h), 1);
                    return;
                } // Adresse gehoert inzwischen dem Spiel
                if (EDIT.on && !editIsUi(clicked))
                    return; // Edit-Modus: Taps auf unsere Buttons tun nichts (sie werden nur verschoben)
                try {
                    h.fn(clicked);
                }
                catch (e) {
                    log("Handler-Fehler:", e);
                }
                return;
            }
        }
    },
});
// ---------- Tick ueber setXY ----------
// Die Lobby haengt sich erst NACH dem Aufbau an die Szene (Kette beim Aufbau nur 4 lang, das Log
// zeigte, dass die echte Root-Kette erst beim Touch 6 lang war). setXY wird staendig fuer
// Objekte auf dem Bildschirm aufgerufen, also schon angehaengte Objekte. Sobald eins davon eine
// Kette von mind. CFG.rootDepth hat, ist dessen oberster Container der echte Root -> dort
// docken wir an, ganz ohne Touch. Danach wird der Hook wieder entfernt (kein Performance-Verlust).
let building = false;
let tickCount = 0;
function armTick() {
    armedAt = Date.now();
    if (tick)
        return;
    tick = Interceptor.attach(base.add(O.SetXY), {
        onEnter(args) {
            if (rootMenu || probed || building || creatingOwn)
                return;
            if (++tickCount % 25 !== 0)
                return; // nicht bei jedem Aufruf rechnen (Performance)
            let chain;
            try {
                chain = chainOf(args[0], true);
            }
            catch (_) {
                return;
            }
            if (chain.length < CFG.rootDepth)
                return;
            const top = chain[chain.length - 1].toString();
            let v = votes.get(top);
            if (!v) {
                v = { n: 0, t0: Date.now() };
                votes.set(top, v);
            }
            v.n++;
            totalVotes++;
            // Nur der STABILE Root: lange genug gesehen, oft bestaetigt, und die meisten tiefen Ketten enden dort.
            // Kurzlebige Container (Popups, Ladescreens, noch nicht angehaengte Screens) erfuellen das nicht.
            if (v.n < CFG.rootVotes || Date.now() - v.t0 < CFG.rootMinAgeMs || v.n < totalVotes * 0.6)
                return;
            building = true;
            try {
                log("Stabiler Root gefunden, Kettenlaenge", chain.length, "Stimmen", v.n + "/" + totalVotes);
                if (ensureRootMenu(args[0], true)) {
                    const t = tick;
                    tick = null;
                    if (t)
                        setTimeout(() => t.detach(), 0);
                }
            }
            catch (e) {
                log("Fehler im Tick:", e);
            }
            finally {
                building = false;
            }
        },
    });
}
armTick();
// ---------- Guard: Root/Menue verschwunden? ----------
function rootHealthy() {
    if (!rootMenu)
        return true;
    if (!ownAlive(rootMenu.parent))
        return false;
    if (rootMenu.toggle && !ownAlive(rootMenu.toggle))
        return false;
    return true;
}
// Verwirft ALLE gemerkten Zeiger (ohne sie anzufassen) und startet die Root-Suche neu.
function teardown(reason) {
    log("[Guard] Root/Menue nicht mehr gueltig (" + reason + ") - alte Zeiger verworfen, suche neuen Root");
    for (const r of OWN.values())
        r.dead = true;
    handlers.length = 0;
    menus.length = 0;
    current = null;
    rootMenu = null;
    pending = null;
    QA.b = {};
    QA.container = ptr(0);
    EDIT.ui = null;
    EDIT.drag = null;
    try {
        uiDrop(false);
    }
    catch (_) { /* nur Zustand zuruecksetzen */ }
    UI.container = ptr(0);
    foreign.clear();
    addCounts.clear();
    lastLen.clear();
    votes.clear();
    totalVotes = 0;
    armTick();
}
// Zusaetzlich zu den Touch-/Button-Pruefungen: alle 300 ms nur LESEN (kein Aufruf ins Spiel)
setInterval(() => {
    try {
        if (rootMenu && !rootHealthy())
            teardown("Timer");
    }
    catch (e) {
        log("[Guard] Fehler:", e);
    }
}, 300);
// ---- Autododge-Engine (iOS-Port, eigene Datei dodge_ios.ts) – wird ueber PH.on.dodge_ON und die dodge_*-Werte aus dem Menue gesteuert ----
// ============================================================
//  Autododge  (iOS-Port aus neuerdodge.js, Offsets fuer das iOS-Binary "laser")
//  Verifiziert (statisch): FrameHook 0x223ea8 | Battle-Getter 0x310a70 (Logic @+0x28, Input-Manager @+0x58)
//    Input-Ctor 0x40a66c (Typ @+4, x @+8, y @+0xc, Groesse 0x2c) | AddInput 0x1db228 | Predict 0x432508
//    ProjectileData-Vtable 0x10173c8 (Speed +0xb4, Radius +0xc0) | CharacterData Radius +0x1e8, Speed +0x1a8
//    GameObject: gid +8, data +0x10, x +0x30, y +0x34, team +0x40 | TileData: BlocksMovement +0x58, BlocksProjectiles +0x59
//  Automatisch zur Laufzeit gefunden (nicht statisch belegt): Objektliste im Logic-Struct, TileMap-Zeiger und Breite/Hoehe
//  Gesteuert ueber das Menue: PH.on.dodge_ON + die dodge_* Werte.   Konsole: dbg.dodge.dump() | probe() | walls() | verbose(true)
// ============================================================
function createDodge(env) {
    const { PH, base, calloc } = env;
    const LOGCFG = { verbose: false };
    const dodgeDefaults = () => { PH.on.dodge_CONTINUOUS = true; PH.on.dodge_CIRCULAR = false; PH.on.dodge_ALWAYS = false; PH.on.dodge_GUARD = true; PH.on.dodge_GUARD_STEER = false; };
    dodgeDefaults();
    const NOISY = /^\[(Guard|Walls|trace)\]|^\[Autododge\] (TileMap found|Wall map ready|Position|Threat|dodge|object list)/;
    const log = (...args) => {
        if (!LOGCFG.verbose && typeof args[0] === "string" && NOISY.test(args[0]))
            return;
        console.log("[DEBUG-iOS]", ...args);
    };
    const O = {
        // iOS (arm64, Binary "laser") - RVAs, statically verified (see porting notes)
        FrameHook: 0x223ea8, GetInstance: 0x310a70, CtorInput: 0x40a66c, AddInput: 0x1db228,
        Predict: 0x432508, ProjVtable: 0x10173c8,
        BM_logic: 0x28, BM_input: 0x58, // iOS: input manager at Battle+0x58 (Android: +0x48)
        L_mgr: 0x28, M_array: 0x0, M_count: 0xc, // object list: unverified default, auto-detected at runtime (objList())
        Obj_gid: 0x8, Obj_data: 0x10, Obj_x: 0x30, Obj_y: 0x34, Obj_team: 0x40,
        PD_speed: 0xb4, PD_radius: 0xc0, CD_radius: 0x1e8, CD_speed: 0x1a8, // iOS = v59 layout (ProjectileData +8 vs. Android v54)
        CI_size: 0x2c, CI_x: 0x8, CI_y: 0xc, CI_type: 0x4, MOVE_TYPE: 2,
        // TileMap: location in Logic and width/height offset are auto-detected (probeTM); TileData flags verified (strb [x19,#0x58/#0x59] in the CSV loader 0x3ab3a0)
        L_tm: 0xf8, TM_w: 0xa4, TD_bm: 0x58, TD_bp: 0x59, TILE: 300,
    };
    const CFG = {
        AWARE: 3200, TICK_MS: 0, DIR_COUNT: 32, SKIN: 60, LOCK_MS: 90, REACH: 600, HORIZON_S: 1.2,
        LAG_MS: 100, TICK_LOGIC_S: 0.05, USE_DATA_SPEED: 1,
        SEND_MS: 50, // max. 1 move input per logic tick (50 ms) -> prevents over-prediction = 'back teleport'
        RANGE_LEARN: 1, RANGE_MIN_N: 2, RANGE_MARGIN: 150, // Learn the range per shot type (only dodge if the shot really reaches you)
        TRACE: 0,
        GUARD: 1, GUARD_STEER: 0, // Input guard: block/redirect your own move inputs if a shot would hit there (STEER 1 = always steer to the nearest safe direction instead of standing still)   // LAG_MS = delay until your move input takes effect in the game (ping + tick)
        KEEP_BAND: 120, PERP_BONUS: 150, MOMENTUM: 100, ENGAGE: 90, RELEASE_GRACE_MS: 120,
        RANGE_FALLBACK: 2800, PROJ_RADIUS_FALLBACK: 100, TRACK_TTL_MS: 300,
        WALL_STOP: 1, WALL_AVOID: 1, WALL_LOOK: 600, WALL_STEP: 75, WALL_SLICE: 160,
        // ---- Settings in the in-game menu (like the BSRE menu) ----
        ACC_MIN: 10, ACC_MAX: 10, // Acceleration 1-10 (10 = instantly fully accelerated)
        DEC_MIN: 10, DEC_MAX: 10, // Deceleration 1-10 (10 = stop instantly)
        REACT_MIN: 0, REACT_MAX: 0, // Reaction: random delay (ms) before dodging
        SHIFT: 11, SHIFT_DELAY: 50, // Shift: direction is offset by +-SHIFT degrees every SHIFT_DELAY ms
        VISION: 5, // Vision in tiles (1 tile = 300 units)
        CHANGE_DELAY: 0, // min. time (ms) between two direction changes
        RETURN_DELAY: 100, // Time (ms) after the danger until control is given back
        COOLDOWN: 0, // Pause (ms) after a dodge before the next one may start
        DMG_MIN: 0, DMG_MAX: 4350, // only consider projectiles with damage in this range (needs PD_DAMAGE)
        CHANCE: 100, // Probability (%) to dodge at all per threat
        MAX_ANGLE: 360, // Total angle range around the first dodge direction (360 = unlimited)
        CONTINUOUS: 1, // 1 = recalculate direction every tick, 0 = dodge once per threat
        CIRCULAR: 0, // 1 = dodge direction swings in a circular pattern (smooth, human-like swing)
        ALWAYS: 0, // 1 = ALWAYS dodge: also shots that start point-blank (Edgar, melee), ignores Chance + Cooldown
        // 0 = (default) dodge everything EXCEPT shots that start closer than NEAR_DIST
        NEAR_DIST: 450, // units (300 = 1 tile): shots first seen closer than this count as "close combat" (only when ALWAYS = 0)
        PD_DAMAGE: 0, // Offset of the damage in the projectile data (0 = unknown -> damage filter off)
        SAFE: 80, // this much distance (units) must remain at minimum after dodging
        SHORT_BONUS: 120, SPACE_W: 0.25, // short dodge paths + free space behind them are preferred
        MIN_STEP: 120, // shortest dodge distance
        BACK_BONUS: 70, // bonus for retreating away from the shooter (safe directions only)
        WALL_PEN: 0.8, // penalty per unit of missing free space in front of a wall
        WALL_MARGIN: 220, // free distance from which a direction counts as roomy (no penalty)
        OPEN_W: 140, // bonus for open terrain at the target point (avoids dead ends / corners)
        OPEN_LOOK: 450, // look distance of the openness check
        BUDGET_MS: 2, // PERF: hard time budget (ms) for ONE direction search; when it runs out, the best direction found so far is used
        GUARD_BUDGET_MS: 2, // PERF: same for the input guard's steer search
    };
    // ---- menu <-> engine: the menu (PH.val / PH.on, prefix "dodge_") is the single source of truth ----
    const NUMK = { ACC_MIN: 10, ACC_MAX: 10, DEC_MIN: 10, DEC_MAX: 10, REACT_MIN: 0, REACT_MAX: 0, SHIFT: 11, SHIFT_DELAY: 50, VISION: 5,
        CHANGE_DELAY: 0, RETURN_DELAY: 100, COOLDOWN: 0, CHANCE: 100, MAX_ANGLE: 360, LAG_MS: 100, DMG_MIN: 0, DMG_MAX: 4350 };
    const BOOLK = ["CONTINUOUS", "CIRCULAR", "ALWAYS", "GUARD", "GUARD_STEER"];
    function syncCfg() {
        for (const k in NUMK) {
            const v = PH.val["dodge_" + k];
            CFG[k] = v !== undefined ? v : NUMK[k];
        }
        for (const k of BOOLK)
            CFG[k] = PH.on["dodge_" + k] ? 1 : 0;
    }
    const CFG_DEFAULTS = Object.assign({}, CFG);
    const st = { errors: 0, lastError: '', avgMs: 0, enabled: false, hooked: false, ready: false, ticks: 0, moves: 0, threats: 0,
        heading: null, headingIdx: -1, holdUntil: 0, lastDanger: 0, lastTick: 0, lastLog: 0,
        hookChar: null, hookCharAt: 0, ownSrc: '-', lastThreatLog: 0,
        ep: 0, reactAt: 0, cooldownUntil: 0, changeUntil: 0, shiftSign: 1, shiftAt: 0, dodgeStart: 0, sentOnce: false,
        circAng: 0, circSign: 1, anchor: null, accMs: 0, decMs: 0, accAcc: 0, spdK: 1, spdKn: 0, lastSpdLog: 0, jumps: 0, lastSend: 0, lastPos: null, vp: null, v0x: 0, v0y: 0, sending: false, guardHooked: false, guarded: 0, gp: null, gc: null, hz: null, hzAt: 0, searchAt: 0, gMe: null, gR: 60, gSpd: 720, gOwn: null, lastGuardLog: 0, pm: null };
    let getBattle = null, ctorInput = null, addInput = null, predict = null, newMem = null;
    let projVt = ptr(0), ring = [], scoreBuf = [], ringOrder = [];
    const tracks = new Map();
    const dataInfo = new Map(); // projectile data pointer -> { dk, dmg, spd, rad } (constant per shot type, so read only once)
    const rangeMap = new Map(); // Projectile data pointer -> { max: longest observed flight distance, n: count }
    const BASE_TICK_MS = 50; // PERF: max ~30 ticks/s (positions only change at 20 Hz, 65 ticks/s was pure waste); old comment: max ~65 ticks/s (game logic only runs at 20 Hz anyway); throttles itself further if computation time is high
    try {
        getBattle = new NativeFunction(base.add(O.GetInstance), "pointer", []);
        ctorInput = new NativeFunction(base.add(O.CtorInput), "pointer", ["pointer", "int"]);
        addInput = new NativeFunction(base.add(O.AddInput), "void", ["pointer", "pointer"]);
        predict = new NativeFunction(base.add(O.Predict), "void", ["pointer", "int", "int", "int"]);
        newMem = (n) => calloc(1, n); // iOS: operator new == malloc -> calloc is compatible (the game frees with operator delete = free)
        projVt = base.add(O.ProjVtable);
        st.ready = true;
    }
    catch (e) {
        log("[Autododge] init failed:", e);
    }
    function buildRing() {
        ring = [];
        for (let i = 0; i < CFG.DIR_COUNT; i++) {
            const a = Math.PI * 2 * i / CFG.DIR_COUNT;
            ring.push({ x: Math.cos(a), y: Math.sin(a) });
        }
        scoreBuf = new Array(CFG.DIR_COUNT).fill(0);
        st.headingIdx = -1;
        // PERF: evaluation order coarse -> fine (every 16th direction first, then 8th, ...), so an aborted search still covers the whole circle
        ringOrder = [];
        const seen = new Set();
        const N = ring.length;
        for (const stp of [16, 8, 4, 2, 1])
            for (let i = 0; i < N; i += stp)
                if (!seen.has(i)) {
                    seen.add(i);
                    ringOrder.push(i);
                }
    }
    buildRing();
    const rdPtr = (p) => { try {
        return p.readPointer();
    }
    catch (_) {
        return ptr(0);
    } };
    // iOS: reading unmapped memory raises a (slow, deadlock-prone) CPU exception -> only dereference plausible user-space pointers (0x1_0000_0000 .. 0xF_FFFF_FFFF, 8-aligned)
    const safe = (p) => { try {
        if (p.isNull())
            return false;
        const h = p.shr(32).toInt32();
        return h >= 1 && h <= 15 && p.and(7).toInt32() === 0;
    }
    catch (_) {
        return false;
    } };
    const posOf = (o) => ({ x: o.add(O.Obj_x).readS32(), y: o.add(O.Obj_y).readS32() });
    function battleLogic() {
        const b = getBattle();
        if (!b || b.isNull())
            return null;
        const l = rdPtr(b.add(O.BM_logic));
        return l.isNull() ? null : { b, l };
    }
    // Fetch the object list in ONE read; per object address it is cached whether it is a projectile
    // (otherwise hundreds of Frida calls per frame -> stutter). Non-projectiles are only re-checked every few ticks.
    const kindCache = new Map(); // key(address) -> 0 = other object | NativePointer = projectile
    let revalIdx = 0;
    const REVAL_PER_TICK = 8;
    function classify(o) {
        try {
            const data = o.add(O.Obj_data).readPointer();
            if (safe(data) && data.readPointer().equals(projVt))
                return o;
        }
        catch (_) { }
        return 0;
    }
    // ---- object list: default Logic+0x28 -> {array @+0, count @+0xc}; if the own character is NOT in that list, the whole Logic struct is searched ----
    const OL = { found: false, mode: 'A', off: O.L_mgr, last: 0, tries: 0 };
    function olRead(l, mode, off) {
        try {
            let arr, n;
            if (mode === 'A') {
                const mgr = rdPtr(l.add(off));
                if (!safe(mgr))
                    return null;
                arr = rdPtr(mgr.add(O.M_array));
                n = mgr.add(O.M_count).readS32();
            }
            else {
                arr = rdPtr(l.add(off));
                n = l.add(off + O.M_count).readS32();
            }
            if (!safe(arr) || n <= 0 || n > 4096)
                return null;
            return { arr, n };
        }
        catch (_) {
            return null;
        }
    }
    function olHas(r, own) {
        try {
            const dv = new DataView(r.arr.readByteArray(r.n * 8));
            const v = BigInt(own.toString());
            const lo32 = Number(v & 0xffffffffn), hi32 = Number(v >> 32n);
            for (let i = 0; i < r.n; i++)
                if (dv.getUint32(i * 8, true) === lo32 && dv.getUint32(i * 8 + 4, true) === hi32)
                    return true;
        }
        catch (_) { }
        return false;
    }
    function objList(l) {
        if (OL.found) {
            const r0 = olRead(l, OL.mode, OL.off);
            if (r0)
                return r0;
            OL.found = false;
        }
        const own = (st.hookChar && Date.now() - st.hookCharAt < 1000 && validObj(st.hookChar)) ? st.hookChar : null;
        const def = olRead(l, 'A', O.L_mgr);
        if (def && (!own || olHas(def, own))) {
            if (own) {
                OL.found = true;
                OL.mode = 'A';
                OL.off = O.L_mgr;
            }
            return def;
        }
        if (!own)
            return def; // own character not known yet: use the default, verify later
        const now = Date.now();
        if (now - OL.last < 1500 || OL.tries >= 6)
            return def;
        OL.last = now;
        OL.tries++;
        for (const mode of ['A', 'B'])
            for (let off = 0; off < 0x300; off += 8) {
                const r = olRead(l, mode, off);
                if (r && olHas(r, own)) {
                    OL.found = true;
                    OL.mode = mode;
                    OL.off = off;
                    log("[Autododge] object list found: Logic+0x" + off.toString(16) + " mode " + mode + " count " + r.n);
                    return r;
                }
            }
        return def;
    }
    let _scanMemo = null, _scanMemoT = 0, _scanMemoL = null, _prunedAt = 0;
    function scan(l) {
        const _tn = Date.now();
        if (_scanMemo && _tn - _scanMemoT < 30 && _scanMemoL && _scanMemoL.equals(l))
            return _scanMemo; // PERF: Dodge + Aura used to scan all objects twice per frame
        const res = { arr: null, n: 0, projs: [], ownKey: -1 };
        const olr = objList(l);
        if (!olr)
            return res;
        const arr = olr.arr, n = olr.n;
        let dv;
        try {
            dv = new DataView(arr.readByteArray(n * 8));
        }
        catch (_) {
            return res;
        }
        res.arr = arr;
        res.n = n;
        for (let i = 0; i < n; i++) {
            const lo = dv.getUint32(i * 8, true), hi = dv.getUint32(i * 8 + 4, true);
            if (lo === 0 && hi === 0)
                continue;
            const key = lo + hi * 4294967296;
            let k = kindCache.get(key);
            if (k === undefined) {
                const op = arr.add(i * 8).readPointer();
                k = safe(op) ? classify(op) : 0;
                kindCache.set(key, k);
            }
            if (k !== 0)
                res.projs.push({ key, p: k });
        }
        // Rolling re-check (address could have been reused for a new object)
        for (let c = 0; c < REVAL_PER_TICK && c < n; c++) {
            const i = (revalIdx + c) % n;
            const lo = dv.getUint32(i * 8, true), hi = dv.getUint32(i * 8 + 4, true);
            if (lo === 0 && hi === 0)
                continue;
            {
                const op = arr.add(i * 8).readPointer();
                kindCache.set(lo + hi * 4294967296, safe(op) ? classify(op) : 0);
            }
        }
        revalIdx = (revalIdx + REVAL_PER_TICK) % n;
        if (_tn - _prunedAt > 500) { // PERF: clean up dead entries only twice per second (used to be: Set with ALL objects on every scan)
            _prunedAt = _tn;
            const alive = new Set();
            for (let i = 0; i < n; i++) {
                const lo = dv.getUint32(i * 8, true), hi = dv.getUint32(i * 8 + 4, true);
                if (lo || hi)
                    alive.add(lo + hi * 4294967296);
            }
            for (const key of kindCache.keys())
                if (!alive.has(key))
                    kindCache.delete(key);
        }
        _scanMemo = res;
        _scanMemoT = _tn;
        _scanMemoL = l;
        return res;
    }
    // Plausibility check: is this really a GameObject (character) with a sensible position/team?
    function validObj(o) {
        try {
            if (!o || !safe(o))
                return false;
            if (o.readPointer().isNull())
                return false;
            const x = o.add(O.Obj_x).readS32(), y = o.add(O.Obj_y).readS32();
            if (Math.abs(x) > 200000 || Math.abs(y) > 200000)
                return false;
            if (x === 0 && y === 0)
                return false;
            return o.add(O.Obj_team).readU32() < 64;
        }
        catch (_) {
            return false;
        }
    }
    // Own character: 1) argument from updateMovement (x2, otherwise x1) -> exactly the object the game itself controls
    //                    2) fallbacks via Logic (old offsets)
    function ownCharOf(l) {
        const now = Date.now();
        if (st.hookChar && now - st.hookCharAt < 1000 && validObj(st.hookChar)) {
            st.ownSrc = 'hook';
            return st.hookChar;
        }
        st.ownSrc = 'none';
        return null;
    }
    // ==================== Wall map (TileMap) ====================
    // TileMap: +0x00 Tile* array (row by row, index = y*w + x), +0xa4 width, +0xa8 height (in tiles; 1 tile = 300 units)
    // Tile: +0x00 -> TileData*;  TileData: +0x58 BlocksMovement, +0x59 BlocksProjectiles (1 byte each; +0x57 is something else, probably vision block/grass flag)
    // According to the disassembly the TileMap pointer is at Logic+0x70; it is validated and searched for on failure.
    // The map is updated in slices (WALL_SLICE tiles per tick) so that destroyed/new walls are picked up.
    const Walls = { ok: false, bad: false, key: '', w: 0, h: 0, grid: null, cls: new Map(), cursor: 0, cycles: 0,
        from: 'L', off: 0xf8, twOff: -1, found: false, lastFind: 0, findFails: 0, fails: 0, nMove: 0, nProj: 0, warned: false,
        ignoreWater: true, strictWalls: false, sig: new Map(), ignoreNames: [], names: new Map(), water: new Set(), tk: null, types: [], pend: [] }; // ignoreWater: water tiles do NOT block shots (Kill Aura / Dodge)
    // Water detection: TileData contains (like other game data) a string with the tile name. We search the start of the structure for
    // game strings (length @+4, text inline @+8 if length <= 7, otherwise pointer @+8) with readable ASCII and remember them.
    const WATER_RE = /water|wasser|ocean|lake|river|pond|\bsea\b/i;
    function tdNames(d) {
        const out = [];
        return out; // iOS: name probing reads arbitrary pointers (fault-prone) -> disabled; water is only a movement blocker anyway
        // removed by dead control flow
{}
        // removed by dead control flow
{}
        // PERF: read the structure ONCE and only dereference values that look like pointers / string lengths
        // (before: ~190 reads per tile type, most of them throwing exceptions = >1 s freeze when switching on)
        // removed by dead control flow
{}
        // removed by dead control flow
{}
        // removed by dead control flow
{}
        // removed by dead control flow
{}
    }
    // PERF: naming of tile types (water detection) is done lazily, max. 1 type per call, only for blocking types
    function wallsNameStep() {
        const q = Walls.pend;
        if (!q || !q.length)
            return;
        const it = q.shift(), ck = it.ck, d = it.d;
        let nm = [];
        try {
            nm = tdNames(d);
        }
        catch (_) { }
        Walls.names.set(ck, nm);
        try {
            Walls.sig.set(ck, Array.from(new Uint8Array(d.add(0x50).readByteArray(16))).map(x => x.toString(16).padStart(2, '0')).join(''));
        }
        catch (_) { }
        const c = Walls.cls.get(ck);
        if (c && nm.some(t => WATER_RE.test(t) || Walls.ignoreNames.some(n => t.toLowerCase().indexOf(n) >= 0))) {
            Walls.water.add(ck);
            if (Walls.ignoreWater && Walls.tk && Walls.grid) { // patch the already scanned tiles right away
                const tk = Walls.tk, g = Walls.grid, n = tk.length;
                for (let i = 0; i < n; i++)
                    if (tk[i] === ck)
                        g[i] = (c & ~2) | 4;
            }
        }
    }
    function wallsReset() {
        Walls.ok = false;
        Walls.key = '';
        Walls.grid = null;
        Walls.cls.clear();
        Walls.cursor = 0;
        Walls.cycles = 0;
        Walls.found = false;
        Walls.bad = false;
        Walls.pend = [];
        Walls.findFails = 0;
        Walls.twOff = -1;
    }
    const wallsOn = () => Walls.ok && !Walls.bad && Walls.grid !== null;
    function probeTM(c) {
        try {
            if (!c || !safe(c))
                return false;
            let dv;
            try {
                dv = new DataView(c.readByteArray(0x240));
            }
            catch (_) {
                return false;
            }
            const arr = c.readPointer();
            if (!safe(arr))
                return false;
            const offs = Walls.twOff >= 0 ? [Walls.twOff] : [O.TM_w];
            if (Walls.twOff < 0)
                for (let o = 0x20; o <= 0x238; o += 4)
                    if (o !== O.TM_w)
                        offs.push(o);
            for (const o of offs) {
                const w = dv.getInt32(o, true), h = dv.getInt32(o + 4, true);
                if (w < 8 || h < 8 || w > 250 || h > 250)
                    continue;
                const n = w * h, stepN = Math.max(1, Math.floor(n / 48));
                let seen = 0, ok = true, blk = 0;
                for (let i = 0; i < n && seen < 12; i += stepN) {
                    const t = arr.add(i * 8).readPointer();
                    if (t.isNull())
                        continue;
                    if (!safe(t)) {
                        ok = false;
                        break;
                    }
                    const d = t.readPointer();
                    if (!safe(d)) {
                        ok = false;
                        break;
                    }
                    const bm = d.add(O.TD_bm).readU8(), bp = d.add(O.TD_bp).readU8();
                    if (bm > 1 || bp > 1) {
                        ok = false;
                        break;
                    }
                    if (bm || bp)
                        blk++;
                    seen++;
                }
                if (ok && seen >= 4) {
                    Walls.twOff = o;
                    return true;
                }
            }
            return false;
        }
        catch (_) {
            return false;
        }
    }
    function findTileMap(l, b) {
        const tryAt = (bp, tag, off) => {
            const c = rdPtr(bp.add(off));
            if (!probeTM(c))
                return false;
            Walls.from = tag;
            Walls.off = off;
            Walls.found = true;
            log("[Autododge] TileMap found:", tag + "+0x" + off.toString(16), c);
            return true;
        };
        if (tryAt(l, 'L', O.L_tm))
            return true;
        if (Walls.findFails > 0)
            return false; // full scan only on the first attempt
        for (let off = 0; off < 0x300; off += 8)
            if (off !== O.L_tm && tryAt(l, 'L', off))
                return true;
        for (let off = 0; off < 0x200; off += 8)
            if (tryAt(b, 'B', off))
                return true;
        return false;
    }
    function wallTypes() {
        const cnt = new Map(), samp = new Map();
        if (Walls.tk)
            for (let i = 0; i < Walls.tk.length; i++) {
                const k = Walls.tk[i];
                if (!k)
                    continue;
                cnt.set(k, (cnt.get(k) || 0) + 1);
                let sl = samp.get(k);
                if (!sl) {
                    sl = [];
                    samp.set(k, sl);
                }
                if (sl.length < 3)
                    sl.push((i % Walls.w) + "," + ((i / Walls.w) | 0));
            }
        Walls.types = [...cnt.entries()].filter(([k]) => Walls.cls.get(k)).sort((a, b) => b[1] - a[1])
            .map(([k, n], id) => ({ id, key: k, n, cls: Walls.cls.get(k), names: Walls.names.get(k) || [], at: samp.get(k) || [], sig: Walls.sig.get(k) || '' }));
        return Walls.types;
    }
    function wallTypesLog() {
        const t = wallTypes();
        log("[Walls] Blocking tile types (cls 1=movement, 2=projectiles, 3=both) - ignore: dbg.dodge.ignore(no.)\n" + t.map(x => "#" + x.id + " cls=" + x.cls + " n=" + x.n + (Walls.water.has(x.key) ? " [IGNORED]" : "") + " names=" + JSON.stringify(x.names.slice(0, 4)) + " Example tiles=" + x.at.join(" ") + " sig=" + x.sig).join("\n"));
    }
    function wallsUpdate(l, b, now) {
        // Throttle: once the map is ready, only re-read a chunk every 250 ms (before: 160 tiles on EVERY call, Dodge calls this ~every 33 ms)
        wallsNameStep(); // PERF: at most 1 tile type is named per call (spreads the cost over several frames)
        if (Walls.ok && Walls.found && now - (Walls.lastUpd || 0) < 250)
            return;
        Walls.lastUpd = now;
        try {
            if (!Walls.found) {
                if (Walls.findFails >= 4)
                    return; // PERF: after 4 failed attempts, stop probing ~160 offsets every second
                if (now - Walls.lastFind < 1000 * (1 + Walls.findFails * 2))
                    return;
                Walls.lastFind = now;
                if (!findTileMap(l, b)) {
                    Walls.ok = false;
                    Walls.findFails++;
                    if (Walls.findFails === 4)
                        log("[Autododge] TileMap not found -> wall logic OFF (Dodge keeps running without walls)");
                    return;
                }
                Walls.findFails = 0;
            }
            const tm = rdPtr((Walls.from === 'L' ? l : b).add(Walls.off));
            if (!safe(tm)) {
                wallsReset();
                return;
            }
            const w = tm.add(Walls.twOff).readS32(), h = tm.add(Walls.twOff + 4).readS32();
            if (w < 8 || h < 8 || w > 250 || h > 250) {
                wallsReset();
                return;
            }
            const key = tm.toString() + ':' + w + 'x' + h;
            if (key !== Walls.key) {
                Walls.key = key;
                Walls.w = w;
                Walls.h = h;
                Walls.grid = new Uint8Array(w * h);
                Walls.cls.clear();
                Walls.cursor = 0;
                Walls.cycles = 0;
                Walls.ok = false;
                Walls.bad = false;
                Walls.warned = false;
                Walls.names.clear();
                Walls.sig.clear();
                Walls.water.clear();
                Walls.tk = new Array(w * h).fill(null);
                Walls.types = [];
                Walls.pend = [];
            }
            const arr = rdPtr(tm);
            if (!safe(arr))
                return;
            const n = w * h, grid = Walls.grid;
            const cnt0 = Math.min(n, Walls.cycles === 0 ? 200 : CFG.WALL_SLICE);
            let cnt = cnt0;
            const tSl = Date.now(); // PERF: time budget per call, the rest continues in the next call (cursor)
            for (let k = 0; k < cnt0; k++) {
                const i = (Walls.cursor + k) % n;
                let v = 0;
                const t = arr.add(i * 8).readPointer();
                if (safe(t)) {
                    const d = t.readPointer();
                    if (safe(d)) {
                        const ck = d.toString();
                        let c = Walls.cls.get(ck);
                        if (c === undefined) {
                            c = (d.add(O.TD_bm).readU8() ? 1 : 0) | (d.add(O.TD_bp).readU8() ? 2 : 0);
                            Walls.cls.set(ck, c);
                            if (c)
                                Walls.pend.push({ ck, d }); // only blocking types need a name (water check) -> lazily in wallsNameStep()
                            else
                                Walls.names.set(ck, []);
                        }
                        if (Walls.tk)
                            Walls.tk[i] = ck;
                        v = (Walls.ignoreWater && Walls.water.has(ck)) ? ((c & ~2) | 4) : c; // Water: at most blocks movement, never shots (bit 4 = "is water", used by the Kill Aura line of sight)
                    }
                }
                grid[i] = v;
                if ((k & 15) === 15 && Date.now() - tSl > 4) {
                    cnt = k + 1;
                    break;
                }
            }
            const next = Walls.cursor + cnt;
            if (next >= n) {
                Walls.cycles++;
                if (Walls.cycles === 1) {
                    let nm = 0, np = 0;
                    for (let i = 0; i < n; i++) {
                        if (grid[i] & 1)
                            nm++;
                        if (grid[i] & 2)
                            np++;
                    }
                    Walls.nMove = nm;
                    Walls.nProj = np;
                    Walls.ok = true;
                    log("[Autododge] Wall map ready:", w + "x" + h, "Movement blockers:", nm, "Projectile blockers:", np);
                    if (LOGCFG.verbose) {
                        try {
                            wallTypesLog();
                        }
                        catch (_) { }
                    } // dump over the whole grid = hang when enabling -> only with dbg.verbose(true)
                }
            }
            Walls.cursor = next % n;
        }
        catch (e) {
            Walls.fails++;
            Walls.ok = false;
            if (Walls.fails <= 3)
                log("[Autododge] Wall update error:", String(e));
            if (Walls.fails % 10 === 0)
                Walls.found = false;
        }
    }
    // mask: 1 = blocks movement, 2 = blocks projectiles. Outside the map = blocked.
    function blockedAt(x, y, mask) {
        const g = Walls.grid;
        if (!g)
            return false;
        const tx = Math.floor(x / O.TILE), ty = Math.floor(y / O.TILE);
        if (tx < 0 || ty < 0 || tx >= Walls.w || ty >= Walls.h)
            return true;
        return (g[ty * Walls.w + tx] & mask) !== 0;
    }
    // Distance from (x,y) in direction (ux,uy) to the first hit, otherwise maxLen
    function rayHit(x, y, ux, uy, maxLen, mask, start) {
        if (!wallsOn())
            return maxLen;
        for (let s = start; s <= maxLen; s += CFG.WALL_STEP) {
            if (blockedAt(x + ux * s, y + uy * s, mask))
                return s;
        }
        return maxLen;
    }
    // Free distance for my body in direction d (center + two side points)
    function freeDist(me, d, myR) {
        if (!CFG.WALL_AVOID || !wallsOn())
            return CFG.WALL_LOOK;
        const px = -d.y, py = d.x, off = myR * 1.0;
        for (let s = 50; s <= CFG.WALL_LOOK; s += 50) {
            const cx = me.x + d.x * s, cy = me.y + d.y * s;
            if (blockedAt(cx, cy, 1) || blockedAt(cx + px * off, cy + py * off, 1) || blockedAt(cx - px * off, cy - py * off, 1))
                return Math.max(0, s - 80);
        }
        return CFG.WALL_LOOK;
    }
    // Fraction (0..1) of 8 directions that are free for OPEN_LOOK units around (x,y). 0 = standing in a wall / boxed in.
    function openness(x, y, myR) {
        if (!CFG.WALL_AVOID || !wallsOn())
            return 1;
        if (blockedAt(x, y, 1))
            return 0;
        const N = 8;
        let open = 0;
        for (let k = 0; k < N; k++) {
            const a = Math.PI * 2 * k / N, ux = Math.cos(a), uy = Math.sin(a);
            let free = true;
            for (let s = 75; s <= CFG.OPEN_LOOK; s += 75) {
                if (blockedAt(x + ux * s, y + uy * s, 1)) {
                    free = false;
                    break;
                }
            }
            if (free)
                open++;
        }
        return open / N;
    }
    // ---------- Learn range per shot type ----------
    function learnRange(v, me, myR) {
        if (!CFG.RANGE_LEARN || !v.dk || !v.have || v.n < 3)
            return;
        const flown = Math.hypot(v.x - v.sx, v.y - v.sy);
        if (flown < 300)
            return;
        if (Math.hypot(v.x - me.x, v.y - me.y) < myR + 300)
            return; // ended at me (hit) -> says nothing about the range
        if (wallsOn() && rayHit(v.x, v.y, v.ux, v.uy, 250, 2, 0) < 250)
            return; // shattered against a wall
        let e = rangeMap.get(v.dk);
        if (!e) {
            e = { max: 0, n: 0 };
            rangeMap.set(v.dk, e);
        }
        if (flown > e.max)
            e.max = flown;
        e.n++;
    }
    // ---------- Collect threats ----------
    function collect(projs, own, me, myR, now, mySpeed) {
        const myTeam = own.add(O.Obj_team).readU32();
        const bodyR = myR + CFG.SKIN;
        const vis = CFG.VISION * O.TILE;
        const zoneSq = vis * vis;
        const out = [];
        if (dataInfo.size > 600)
            dataInfo.clear();
        for (const pr of projs) {
            const o = pr.p;
            // PERF: ONE native read (0x44 bytes) instead of 6-8 single reads per projectile and tick; data (speed/radius/...) is cached per data pointer
            let dv;
            try {
                dv = new DataView(o.readByteArray(0x44));
            }
            catch (_) {
                continue;
            }
            const dlo = dv.getUint32(O.Obj_data, true), dhi = dv.getUint32(O.Obj_data + 4, true);
            if (dlo === 0 && dhi === 0)
                continue;
            const team = dv.getUint32(O.Obj_team, true);
            if (team === myTeam)
                continue;
            const dkey = dlo + dhi * 4294967296;
            let di = dataInfo.get(dkey);
            if (!di) {
                let data = null;
                try {
                    data = rdPtr(o.add(O.Obj_data));
                }
                catch (_) { }
                if (!data || data.isNull())
                    continue;
                di = { dk: data.toString(), dmg: -1, spd: 0, rad: 0 };
                if (CFG.PD_DAMAGE > 0) {
                    try {
                        di.dmg = data.add(CFG.PD_DAMAGE).readS32();
                    }
                    catch (_) { }
                }
                if (CFG.USE_DATA_SPEED) {
                    try {
                        di.spd = data.add(O.PD_speed).readS32();
                    }
                    catch (_) { }
                    if (!(di.spd >= 100 && di.spd <= 12000))
                        di.spd = 0;
                }
                try {
                    di.rad = data.add(O.PD_radius).readS32();
                }
                catch (_) { }
                dataInfo.set(dkey, di);
            }
            if (CFG.PD_DAMAGE > 0 && di.dmg >= 0 && (di.dmg < CFG.DMG_MIN || di.dmg > CFG.DMG_MAX))
                continue; // Damage filter (only with known offset)
            const gid = dv.getInt32(O.Obj_gid, true);
            const p = { x: dv.getInt32(O.Obj_x, true), y: dv.getInt32(O.Obj_y, true) };
            const dataSpd = CFG.USE_DATA_SPEED ? di.spd : 0;
            let tr = tracks.get(gid);
            if (!tr) {
                tracks.set(gid, { sx: p.x, sy: p.y, x: p.x, y: p.y, t: now, vx: 0, vy: 0, n: 1, seen: now, ev: [{ x: p.x, y: p.y, t: now }], ux: 0, uy: 0, have: false, dk: di.dk, near: Math.hypot(p.x - me.x, p.y - me.y) < CFG.NEAR_DIST });
                continue;
            }
            tr.seen = now;
            // Position only changes in the logic tick (20 Hz) -> only evaluate on a REAL position change (otherwise speed ~0)
            if (p.x !== tr.x || p.y !== tr.y) {
                const ddx = p.x - tr.x, ddy = p.y - tr.y, dl = Math.hypot(ddx, ddy);
                tr.x = p.x;
                tr.y = p.y;
                tr.t = now;
                tr.n++;
                tr.ev.push({ x: p.x, y: p.y, t: now });
                while (tr.ev.length > 6)
                    tr.ev.shift();
                if (dl > 1) {
                    tr.ux = ddx / dl;
                    tr.uy = ddy / dl;
                    tr.have = true;
                }
                // measured speed over the event window (at least 3 events)
                let meas = 0;
                if (tr.ev.length >= 3) {
                    const a = tr.ev[0], z = tr.ev[tr.ev.length - 1], dtw = (z.t - a.t) / 1000;
                    if (dtw > 0.08)
                        meas = Math.hypot(z.x - a.x, z.y - a.y) / dtw;
                }
                let spd;
                if (dataSpd > 0) {
                    // Automatically calibrate the unit of the data speed (measured / data)
                    if (meas > 100) {
                        const k = meas / dataSpd;
                        if (k > 0.2 && k < 5) {
                            st.spdK = st.spdKn < 5 ? (st.spdK * st.spdKn + k) / (st.spdKn + 1) : st.spdK * 0.95 + k * 0.05;
                            st.spdKn++;
                        }
                    }
                    spd = dataSpd * st.spdK;
                    if (st.spdKn === 0)
                        spd = meas > 100 ? meas : dl / CFG.TICK_LOGIC_S; // not calibrated yet: measure first
                }
                else {
                    spd = meas > 100 ? meas : dl / CFG.TICK_LOGIC_S;
                }
                tr.vx = tr.ux * spd;
                tr.vy = tr.uy * spd;
            }
            const spd = Math.hypot(tr.vx, tr.vy);
            if (!tr.have || spd < 50)
                continue;
            const dx = p.x - me.x, dy = p.y - me.y;
            if (dx * dx + dy * dy > zoneSq)
                continue;
            if (!CFG.ALWAYS && tr.near)
                continue; // default: do not dodge shots that started point-blank (Edgar / close combat)
            const ux = tr.vx / spd, uy = tr.vy / spd;
            if ((me.x - p.x) * ux + (me.y - p.y) * uy < -50)
                continue; // flies away
            let shotR = di.rad;
            if (!(shotR > 0 && shotR < 2000))
                shotR = CFG.PROJ_RADIUS_FALLBACK;
            const flown = Math.hypot(p.x - tr.sx, p.y - tr.sy);
            let rng = CFG.RANGE_FALLBACK; // unknown shot type: conservative
            if (CFG.RANGE_LEARN) {
                const e = rangeMap.get(tr.dk);
                if (e && e.n >= CFG.RANGE_MIN_N)
                    rng = Math.max(900, e.max + CFG.RANGE_MARGIN);
            }
            let left = Math.max(0, rng - flown);
            // Wall stop: if the projectile hits a wall before that, it ends there (only check until just behind me)
            if (CFG.WALL_STOP && wallsOn()) {
                const toMe = Math.max(0, (me.x - p.x) * ux + (me.y - p.y) * uy);
                const look = Math.min(left, toMe + bodyR + 150);
                const hit = rayHit(p.x, p.y, ux, uy, look, 2, 60);
                if (hit < look)
                    left = hit;
            }
            if (left <= 10)
                continue;
            // PERF: relevance culling. If this shot can NOT come within (rad + 330) of me, no matter how I move
            // (max. 1.3 x speed incl. drift during input lag), it never changes the result of clearance() (which caps at 300) -> drop it.
            {
                const rad = shotR + bodyR, vm = 1.3 * (mySpeed || 720);
                const tEnd = Math.min(CFG.HORIZON_S, (left + shotR) / spd);
                const slack = (spd + vm) * 0.05; // sampling step 0.1 s -> max. 0.05 s of error on each side
                let rel = false;
                for (let t = 0; t <= tEnd + 0.05; t += 0.1) {
                    const tt = t > tEnd ? tEnd : t;
                    const qx = p.x + ux * spd * tt - me.x, qy = p.y + uy * spd * tt - me.y;
                    if (Math.sqrt(qx * qx + qy * qy) - vm * tt - slack < rad + 330) {
                        rel = true;
                        break;
                    }
                }
                if (!rel)
                    continue;
            }
            out.push({ x: p.x, y: p.y, vx: tr.vx, vy: tr.vy, rad: shotR + bodyR, left, pathLen: left + shotR, _t: Math.max(0, (me.x - p.x) * ux + (me.y - p.y) * uy) / spd });
        }
        for (const [k, v] of tracks)
            if (now - v.seen > CFG.TRACK_TTL_MS) {
                try {
                    learnRange(v, me, myR);
                }
                catch (_) { }
                tracks.delete(k);
            }
        // PERF: the direction evaluation costs (directions x threats) - only the most urgent ones count (smallest distance)
        const maxHz = st.avgMs > 8 ? 6 : 10; // PERF: fewer threats when the tick is already expensive
        if (out.length > maxHz) {
            out.sort((a, b) => a._t - b._t); // most urgent (earliest arrival) first
            out.length = maxHz;
        }
        return out;
    }
    // ---------- Clearance (from REvenge _clearanceFor, extended by movement limit due to walls) ----------
    // Distance (minus radius) projectile <-> me in the time window [T0,T1]; (mx,my) = my position at time T0
    function segClear(t, mx, my, mvx, mvy, T0, T1) {
        const span = T1 - T0;
        if (span < 0)
            return Infinity;
        const relx = (t.x + t.vx * T0) - mx, rely = (t.y + t.vy * T0) - my;
        const vrx = t.vx - mvx, vry = t.vy - mvy;
        const vv = vrx * vrx + vry * vry;
        let cx, cy;
        if (vv < 1e-6) {
            cx = relx;
            cy = rely;
        }
        else {
            let ts = -(relx * vrx + rely * vry) / vv;
            if (ts < 0)
                ts = 0;
            else if (ts > span)
                ts = span;
            cx = relx + vrx * ts;
            cy = rely + vry * ts;
        }
        return Math.sqrt(cx * cx + cy * cy) - t.rad;
    }
    // tm = time (s) I can move before a wall stops me (after that I stand still); undefined = unlimited
    function clearance(hz, mx, my, mvx, mvy, tm) {
        const cap = (tm === undefined) ? Infinity : tm;
        const lag = Math.max(0, CFG.LAG_MS) / 1000; // for this long my new input has no effect yet
        const v0x = st.v0x || 0, v0y = st.v0y || 0; // my current speed: until the input takes effect I keep running like this
        const drift = lag > 0 && (v0x !== 0 || v0y !== 0);
        const still = (mvx === 0 && mvy === 0) && !drift;
        const sx = drift ? mx + v0x * lag : mx, sy = drift ? my + v0y * lag : my; // Position when my input arrives
        let minClear = Infinity;
        for (const t of hz) {
            const spd = Math.hypot(t.vx, t.vy);
            let maxT = CFG.HORIZON_S;
            if (spd > 1) {
                if (t.left > 0)
                    maxT = Math.min(maxT, t.left / spd);
                if (t.pathLen > 0)
                    maxT = Math.min(maxT, t.pathLen / spd);
            }
            let c = Infinity;
            if (!still && lag > 0)
                c = segClear(t, mx, my, v0x, v0y, 0, Math.min(maxT, lag));
            const T0 = still ? 0 : lag;
            if (maxT >= T0) {
                const T1 = Math.min(maxT, T0 + cap);
                const c1 = segClear(t, sx, sy, mvx, mvy, T0, T1);
                if (c1 < c)
                    c = c1;
                if (T0 + cap < maxT) {
                    const c2 = segClear(t, sx + mvx * cap, sy + mvy * cap, 0, 0, T0 + cap, maxT);
                    if (c2 < c)
                        c = c2;
                }
            }
            if (c < minClear)
                minClear = c;
        }
        return minClear;
    }
    // PERF: per-direction (free distance, clearance) cache. Valid for ONE hz array + position; shared by tick() and the input guard,
    // which used to recompute the full 64-direction ring on every single input.
    const dirC = { hz: null, x: 0, y: 0, has: new Uint8Array(0), fd: new Float64Array(0), clr: new Float64Array(0) };
    function dirEval(i, hz, me, myR, mySpeed) {
        const c = dirC;
        if (c.hz !== hz || Math.abs(c.x - me.x) > 60 || Math.abs(c.y - me.y) > 60 || c.has.length !== ring.length) {
            c.hz = hz;
            c.x = me.x;
            c.y = me.y;
            c.has = new Uint8Array(ring.length);
            c.fd = new Float64Array(ring.length);
            c.clr = new Float64Array(ring.length);
        }
        if (c.has[i])
            return;
        const d = ring[i];
        const fd = freeDist(me, d, myR);
        c.fd[i] = fd;
        c.clr[i] = clearance(hz, me.x, me.y, mySpeed * d.x, mySpeed * d.y, fd >= CFG.WALL_LOOK ? undefined : fd / mySpeed);
        c.has[i] = 1;
    }
    function clearHeading() { st.heading = null; st.headingIdx = -1; st.holdUntil = 0; st.anchor = null; }
    function endDodge(now, bl, me) {
        const had = !!st.heading;
        clearHeading();
        st.ep = 0;
        st.sentOnce = false;
        st.circAng = 0;
        if (had && bl && me) {
            try {
                // MOVE-FIX: if the player is still holding the joystick (last real move input was a movement), let their path continue immediately,
                // instead of stopping -> otherwise the character stays still after the dodge until the joystick is moved again
                const pm = st.pm;
                if (pm && pm.l >= 20)
                    sendMove(bl.b, bl.l, Math.round(me.x + pm.dx), Math.round(me.y + pm.dy), true);
                else
                    sendMove(bl.b, bl.l, me.x, me.y, true); // stop cleanly once -> client and server agree
            }
            catch (_) { }
        }
        if (CFG.COOLDOWN > 0)
            st.cooldownUntil = now + CFG.COOLDOWN;
    }
    // smallest run time t (s) in direction d after which I (standing) am at least SAFE away from all projectiles; null = impossible
    function needTime(hz, me, d, mySpeed, myR) {
        const fd = freeDist(me, d, myR);
        const wallT = fd >= CFG.WALL_LOOK ? undefined : fd / mySpeed;
        for (let t = 0.1; t <= CFG.HORIZON_S + 1e-6; t += 0.1) {
            const tm = wallT === undefined ? t : Math.min(t, wallT);
            if (clearance(hz, me.x, me.y, mySpeed * d.x, mySpeed * d.y, tm) >= CFG.SAFE)
                return { t: tm, fd };
            if (wallT !== undefined && t >= wallT)
                break;
        }
        return null;
    }
    const rr = (a, b) => { const lo = Math.min(a, b), hi = Math.max(a, b); return lo + Math.random() * (hi - lo); };
    const rot = (d, a) => { const c = Math.cos(a), s = Math.sin(a); return { x: d.x * c - d.y * s, y: d.x * s + d.y * c }; };
    // only accept direction cand if it is not more dangerous than base
    function dirSafe(base, cand, hz, me, myR, mySpeed) {
        const c0 = clearance(hz, me.x, me.y, mySpeed * base.x, mySpeed * base.y);
        const c1 = clearance(hz, me.x, me.y, mySpeed * cand.x, mySpeed * cand.y);
        if (!(c1 >= 0 || c1 >= c0 - 10))
            return false;
        return freeDist(me, cand, myR) >= Math.min(freeDist(me, base, myR), 250);
    }
    function sendMove(b, l, x, y, force) {
        const now = Date.now();
        if (!force && now - st.lastSend < CFG.SEND_MS)
            return false; // at most 1 input per logic tick
        const cur = getBattle(); // re-check the battle instance right before the native call
        if (!cur || cur.isNull() || !cur.equals(b))
            return false;
        const mgr = rdPtr(b.add(O.BM_input));
        if (mgr.isNull())
            return false;
        const ci = newMem(O.CI_size);
        if (ci.isNull())
            return false;
        ci.writeByteArray(new Uint8Array(O.CI_size).buffer);
        ctorInput(ci, O.MOVE_TYPE);
        ci.add(O.CI_x).writeS32(x | 0);
        ci.add(O.CI_y).writeS32(y | 0);
        if (CFG.TRACE)
            log("[trace] sendMove", x | 0, y | 0);
        st.sending = true; // do not let the input guard touch your own inputs
        try {
            predict(l, x | 0, y | 0, 1);
            addInput(mgr, ci);
        }
        finally {
            st.sending = false;
        }
        st.lastSend = now;
        return true;
    }
    // ---------- Tick (game thread, from BattleScreen::updateMovement) ----------
    function tick() {
        const want = !!PH.on.dodge_ON;
        if (want && !st.enabled && st.ready) {
            st.enabled = true;
            st.errors = 0;
            log("[Autododge] ON");
        }
        else if (!want && st.enabled) {
            st.enabled = false;
            clearHeading();
            st.pm = null;
            tracks.clear();
            try {
                const bl0 = battleLogic();
                const o0 = bl0 && ownCharOf(bl0.l);
                if (o0) {
                    const m0 = posOf(o0);
                    sendMove(bl0.b, bl0.l, m0.x, m0.y, true);
                }
            }
            catch (_) { }
            log("[Autododge] OFF");
        }
        if (!st.enabled || !st.ready)
            return;
        syncCfg();
        const now = Date.now();
        if (now - st.lastTick < CFG.TICK_MS)
            return;
        st.lastTick = now;
        st.ticks++;
        const t0 = Date.now();
        try {
            tickInner(now);
        }
        finally {
            const ms = Date.now() - t0;
            if (st.ticks <= 3)
                console.log("[DEBUG-iOS] [Autododge] tick #" + st.ticks + ": " + ms + " ms");
            if (ms >= 12 && t0 - (st.slowLog || 0) > 1000) {
                st.slowLog = t0;
                log("[Autododge] slow tick:", ms, "ms | threats:", st.threats, "| avg:", st.avgMs.toFixed(1), "| dirs:", ring.length);
            }
            st.avgMs = st.avgMs * 0.9 + ms * 0.1;
            // too expensive -> tick less often (tick time may take at most ~15% of the time)
            CFG.TICK_MS = Math.max(BASE_TICK_MS, Math.min(40, Math.round(st.avgMs * 3)));
            // WATCHDOG: permanently too slow -> disable Dodge before the game freezes/crashes
            if (st.avgMs > 25) {
                if (!st.slowSince)
                    st.slowSince = t0;
                else if (t0 - st.slowSince > 1500) {
                    st.enabled = false;
                    PH.on.dodge_ON = false;
                    st.slowSince = 0;
                    try {
                        clearHeading();
                    }
                    catch (_) { }
                    log("[Autododge] AUTO-OFF: tick too slow (avg " + st.avgMs.toFixed(1) + " ms) -> dbg.dodge.state / dbg.dodge.dump() to check");
                }
            }
            else
                st.slowSince = 0;
        }
    }
    function tickInner(now) {
        const bl = battleLogic();
        if (!bl) {
            tracks.clear();
            clearHeading();
            st.ep = 0;
            st.pm = null;
            wallsReset();
            return;
        }
        wallsUpdate(bl.l, bl.b, now);
        const _p0 = Date.now();
        const sc = scan(bl.l);
        st.pfScan = (st.pfScan || 0) * 0.9 + (Date.now() - _p0) * 0.1;
        const own = ownCharOf(bl.l);
        if (!own || own.isNull()) {
            clearHeading();
            st.ep = 0;
            return;
        }
        const me = posOf(own);
        // Map plausibility check: is my position inside the map? Otherwise the coordinate system is wrong -> ignore walls
        if (Walls.ok) {
            const tx = Math.floor(me.x / O.TILE), ty = Math.floor(me.y / O.TILE);
            const inside = tx >= 0 && ty >= 0 && tx < Walls.w && ty < Walls.h;
            Walls.bad = !inside;
            if (!inside && !Walls.warned) {
                Walls.warned = true;
                log("[Autododge] Position outside the wall map -> wall logic off", JSON.stringify(me), Walls.w + "x" + Walls.h);
            }
        }
        let myR = 60, mySpeed = 720;
        try {
            const od = rdPtr(own.add(O.Obj_data));
            if (!od.isNull()) {
                const r = od.add(O.CD_radius).readS32(), s = od.add(O.CD_speed).readS32();
                if (r > 0 && r < 1000)
                    myR = r;
                if (s >= 300 && s <= 3000)
                    mySpeed = s;
            }
        }
        catch (_) { }
        if (st.lastPos && now - st.lastPos.t < 400) {
            const dtj = (now - st.lastPos.t) / 1000, dj = Math.hypot(me.x - st.lastPos.x, me.y - st.lastPos.y);
            if (dj > 1.8 * mySpeed * dtj + 150) {
                st.jumps++;
                log("[Autododge] Position jump:", Math.round(dj), "in", Math.round(dtj * 1000) + "ms", "dodging:", !!st.heading, "last move before", now - st.lastSend, "ms");
            }
        }
        st.lastPos = { x: me.x, y: me.y, t: now };
        { // estimate own speed (from the last position changes)
            const vp = st.vp;
            if (!vp)
                st.vp = { x: me.x, y: me.y, t: now };
            else if (me.x !== vp.x || me.y !== vp.y) {
                const dtv = (now - vp.t) / 1000;
                if (dtv >= 0.01 && dtv <= 0.3) {
                    let vx = (me.x - vp.x) / dtv, vy = (me.y - vp.y) / dtv;
                    const sp = Math.hypot(vx, vy), lim = mySpeed * 1.3;
                    if (sp > lim) {
                        vx *= lim / sp;
                        vy *= lim / sp;
                    }
                    st.v0x = (st.v0x || 0) * 0.4 + vx * 0.6;
                    st.v0y = (st.v0y || 0) * 0.4 + vy * 0.6;
                    if (Math.hypot(st.v0x, st.v0y) < 80) {
                        st.v0x = 0;
                        st.v0y = 0;
                    }
                }
                else {
                    st.v0x = 0;
                    st.v0y = 0;
                }
                st.vp = { x: me.x, y: me.y, t: now };
            }
            else if (now - vp.t > 120) {
                st.v0x = 0;
                st.v0y = 0;
            }
        }
        const _p1 = Date.now();
        const hz = collect(sc.projs, own, me, myR, now, mySpeed);
        st.pfCollect = (st.pfCollect || 0) * 0.9 + (Date.now() - _p1) * 0.1;
        st.nProj = sc.projs.length;
        st.threats = hz.length;
        st.hz = hz;
        st.hzAt = now;
        st.gMe = me;
        st.gR = myR;
        st.gSpd = mySpeed;
        st.gOwn = own; // for the input guard
        if (LOGCFG.verbose && hz.length > 0 && now - st.lastThreatLog > 500) {
            st.lastThreatLog = now;
            log("[Autododge] Threat detected:", hz.length, "own:", own, "src:", st.ownSrc, JSON.stringify(me));
        }
        if (hz.length === 0) {
            st.searchAt = 0;
            if (st.heading && now - st.lastDanger > CFG.RETURN_DELAY)
                endDodge(now, bl, me);
            else if (!st.heading && now - st.lastDanger > CFG.RETURN_DELAY)
                st.ep = 0;
            return;
        }
        const v0l = Math.hypot(st.v0x || 0, st.v0y || 0);
        let stay;
        if (!st.heading && v0l > 80) { // you are running yourself: evaluate keeping your course (not "stand still")
            const vd = { x: st.v0x / v0l, y: st.v0y / v0l }, fdv = freeDist(me, vd, myR);
            stay = clearance(hz, me.x, me.y, st.v0x, st.v0y, fdv >= CFG.WALL_LOOK ? undefined : fdv / mySpeed);
        }
        else
            stay = clearance(hz, me.x, me.y, 0, 0);
        const inDanger = stay < CFG.ENGAGE;
        if (inDanger)
            st.lastDanger = now;
        if (!inDanger && (!st.heading || now - st.lastDanger > CFG.RETURN_DELAY)) {
            if (st.heading)
                endDodge(now, bl, me);
            else if (now - st.lastDanger > CFG.RETURN_DELAY)
                st.ep = 0;
            return;
        }
        // ---- new threat: cooldown, chance, reaction ----
        if (st.ep === 0) {
            if (!CFG.ALWAYS && now < st.cooldownUntil)
                return;
            if (!CFG.ALWAYS && Math.random() * 100 >= CFG.CHANCE) {
                st.ep = 3;
                return;
            } // do not dodge this time
            st.ep = 1;
            st.reactAt = now + rr(CFG.REACT_MIN, CFG.REACT_MAX);
            st.accMs = (10 - Math.round(rr(CFG.ACC_MIN, CFG.ACC_MAX))) * 60;
            st.decMs = (10 - Math.round(rr(CFG.DEC_MIN, CFG.DEC_MAX))) * 60;
        }
        if (st.ep === 3)
            return;
        if (st.ep === 1) {
            if (now < st.reactAt)
                return;
            st.ep = 2;
            st.dodgeStart = now;
            st.sentOnce = false;
            st.accAcc = 0;
            st.circAng = 0;
            st.circSign = Math.random() < 0.5 ? 1 : -1;
            // Circular (legit): random phase / speed / amplitude per dodge -> no two dodges look the same
            st.circPh = Math.random() * Math.PI * 2;
            st.circW = st.circSign * rr(4.2, 7.0); // rad/s -> one full swing ~0.9-1.5 s
            st.circAmp = rr(0.38, 0.62);
            st.circAmpT = st.circAmp;
            st.circJ = 0;
            st.circT = now;
            st.circNext = now + rr(350, 900);
        }
        // Danger over, return delay running: coast out with deceleration
        if (!inDanger && st.heading && st.decMs > 0) {
            const f = 1 - (now - st.lastDanger) / st.decMs;
            if (f > 0)
                moveFactor(bl, me, st.heading, f, st.lastDist || CFG.REACH);
            else
                sendMove(bl.b, bl.l, me.x, me.y);
            return;
        }
        if (!inDanger && st.heading)
            return; // out of danger: target stays still, do not keep running
        if (!CFG.CONTINUOUS && st.sentOnce)
            return; // Continuous off: dodge only once per threat
        // PERF: sendMove() is limited to 1 input per SEND_MS anyway -> a full direction search in between would be thrown away
        if (now < st.searchAt)
            return;
        st.searchAt = now + Math.max(16, CFG.SEND_MS - 8);
        const prevIdx = st.headingIdx >= 0 && st.headingIdx < ring.length ? st.headingIdx : -1;
        const prev = prevIdx >= 0 ? ring[prevIdx] : null;
        // determine the next projectile -> prefer sideways dodging (instead of just running away)
        let nu = null, nd = Infinity;
        for (const h of hz) {
            const dd = Math.hypot(h.x - me.x, h.y - me.y), sp = Math.hypot(h.vx, h.vy);
            if (dd < nd && sp > 1) {
                nd = dd;
                nu = { x: h.vx / sp, y: h.vy / sp };
            }
        }
        const _p2 = Date.now();
        const cosMax = CFG.MAX_ANGLE >= 360 ? -2 : Math.cos(CFG.MAX_ANGLE * Math.PI / 360); // half of the total angle
        let best = 0, bestScore = -Infinity, chosen = -1;
        const tS = Date.now();
        let budgetHit = false;
        // PERF: HOLD FAST PATH - the direction chosen a moment ago is still clearly safe -> keep it, no search at all (re-evaluated when LOCK_MS runs out)
        let fastHold = false;
        const ntMemo = new Map();
        if (prevIdx >= 0 && now < st.holdUntil) {
            dirEval(prevIdx, hz, me, myR, mySpeed);
            if (dirC.clr[prevIdx] >= CFG.SAFE + 60) {
                fastHold = true;
                chosen = prevIdx;
                scoreBuf[prevIdx] = 1000 + Math.min(dirC.clr[prevIdx], 300) * 0.3;
            }
        }
        if (!fastHold) {
            scoreBuf.fill(-1e9);
            // PERF: under load only every 2nd direction (+ the current one) is evaluated; needTime (20 x clearance per direction!) only for the best safe ones
            const stride = st.avgMs > 12 ? 4 : st.avgMs > 6 ? 2 : 1;
            const safeIdx = [];
            for (let oi = 0; oi < ringOrder.length; oi++) {
                const i = ringOrder[oi];
                if ((oi & 7) === 7 && Date.now() - tS > CFG.BUDGET_MS) {
                    budgetHit = true;
                    break;
                } // out of time: use what we have
                const d = ring[i];
                if (stride > 1 && (i % stride) !== 0 && i !== prevIdx) {
                    scoreBuf[i] = -1e9;
                    continue;
                }
                if (st.anchor && cosMax > -2 && (d.x * st.anchor.x + d.y * st.anchor.y) < cosMax) {
                    scoreBuf[i] = -1e9;
                    continue;
                }
                dirEval(i, hz, me, myR, mySpeed);
                const fd = dirC.fd[i];
                let s = dirC.clr[i];
                const safeDir = s >= CFG.SAFE;
                // wall pressure now also applies to SAFE directions (before it was overwritten by the 1000+ bonus)
                const wallPen = fd < CFG.WALL_MARGIN ? (CFG.WALL_MARGIN - fd) * CFG.WALL_PEN : 0;
                if (safeDir)
                    s = 1000 + Math.min(s, 300) * 0.3 - wallPen;
                else if (fd < CFG.WALL_LOOK)
                    s -= (CFG.WALL_LOOK - fd) * 0.15;
                const bw = safeDir ? 1 : 0.15; // for unsafe directions almost only the real distance counts
                const roomK = CFG.WALL_MARGIN > 0 ? Math.min(1, fd / CFG.WALL_MARGIN) : 1; // 0 = wall right in front, 1 = plenty of room
                if (nu) {
                    const cross = Math.abs(d.x * nu.y - d.y * nu.x); // sideways relative to the shot
                    const along = d.x * nu.x + d.y * nu.y; // > 0 = away from the shooter (backwards)
                    s += bw * CFG.PERP_BONUS * cross * roomK; // sideways dodge only counts if there is room
                    s += bw * CFG.BACK_BONUS * Math.max(0, along) * roomK;
                }
                if (prev)
                    s += bw * CFG.MOMENTUM * (d.x * prev.x + d.y * prev.y);
                scoreBuf[i] = s;
                if (safeDir)
                    safeIdx.push(i);
            }
            if (safeIdx.length) { // short path + lots of space bonus: only for the best 10 safe directions
                safeIdx.sort((a, b) => scoreBuf[b] - scoreBuf[a]);
                const ntTop = st.avgMs > 6 ? 3 : 6;
                const top = safeIdx.length > ntTop ? safeIdx.slice(0, ntTop) : safeIdx;
                if (prevIdx >= 0 && safeIdx.indexOf(prevIdx) >= 0 && top.indexOf(prevIdx) < 0)
                    top.push(prevIdx);
                for (const i of top) {
                    if (Date.now() - tS > CFG.BUDGET_MS * 1.6) {
                        budgetHit = true;
                        break;
                    }
                    const dd = ring[i];
                    const nt = needTime(hz, me, dd, mySpeed, myR);
                    ntMemo.set(i, nt);
                    if (nt) {
                        scoreBuf[i] += CFG.SHORT_BONUS * (1 - nt.t / CFG.HORIZON_S);
                        scoreBuf[i] += Math.min(300, Math.max(0, nt.fd - nt.t * mySpeed)) * CFG.SPACE_W;
                    }
                    if (CFG.OPEN_W > 0 && wallsOn()) { // dead-end check at the point where the dodge ends
                        const fdi = nt ? nt.fd : freeDist(me, dd, myR);
                        const reach = Math.max(40, Math.min(CFG.REACH, fdi, nt ? nt.t * mySpeed + 60 : CFG.REACH));
                        scoreBuf[i] += CFG.OPEN_W * openness(me.x + dd.x * reach, me.y + dd.y * reach, myR);
                    }
                }
            }
            for (let i = 0; i < ring.length; i++)
                if (scoreBuf[i] > bestScore) {
                    bestScore = scoreBuf[i];
                    best = i;
                }
            chosen = best;
        } // end search (!fastHold)
        if (budgetHit)
            st.budgetHits = (st.budgetHits || 0) + 1;
        if (prevIdx >= 0 && now < st.holdUntil && chosen !== prevIdx) {
            if (scoreBuf[prevIdx] + CFG.KEEP_BAND >= scoreBuf[chosen])
                chosen = prevIdx;
            else
                st.holdUntil = now + CFG.LOCK_MS;
        }
        else if (now >= st.holdUntil)
            st.holdUntil = now + CFG.LOCK_MS;
        // Change delay: do not change direction more often than allowed (unless the old direction would be a hit)
        if (prevIdx >= 0 && chosen !== prevIdx && CFG.CHANGE_DELAY > 0 && now < st.changeUntil && scoreBuf[prevIdx] > 0)
            chosen = prevIdx;
        if (chosen !== prevIdx)
            st.changeUntil = now + CFG.CHANGE_DELAY;
        if (scoreBuf[chosen] <= stay) {
            clearHeading();
            return;
        }
        if (!st.anchor)
            st.anchor = ring[chosen];
        let d = ring[chosen];
        // Shift: alternately offset the direction by +-SHIFT degrees (hard zigzag -> only when Circular is OFF)
        if (CFG.SHIFT > 0 && !CFG.CIRCULAR) {
            if (now - st.shiftAt >= CFG.SHIFT_DELAY) {
                st.shiftAt = now;
                st.shiftSign = -st.shiftSign;
            }
            const cand = rot(d, st.shiftSign * CFG.SHIFT * Math.PI / 180);
            if (dirSafe(d, cand, hz, me, myR, mySpeed))
                d = cand;
        }
        // Circular (legit): smooth sine swing instead of fixed +-0.35 rad steps every tick
        if (CFG.CIRCULAR) {
            const dtc = Math.min(0.1, Math.max(0.001, (now - (st.circT || now)) / 1000));
            st.circT = now;
            st.circPh += st.circW * dtc;
            if (now >= st.circNext) { // irregular: sometimes turn around early, change speed + amplitude
                st.circNext = now + rr(350, 900);
                if (Math.random() < 0.35)
                    st.circW = -st.circW;
                st.circW = Math.sign(st.circW || 1) * Math.max(3.8, Math.min(7.4, Math.abs(st.circW) * rr(0.85, 1.15)));
                st.circAmpT = rr(0.35, 0.65);
            }
            st.circAmp += (st.circAmpT - st.circAmp) * Math.min(1, dtc * 4);
            st.circJ = st.circJ * 0.85 + (Math.random() - 0.5) * 0.05; // tiny hand tremor (~+-1.5 deg)
            const tgt = st.circAmp * Math.sin(st.circPh) + st.circJ;
            const ease = 1 - Math.exp(-dtc / 0.06); // low-pass: angle follows the target smoothly
            let a = st.circAng + (tgt - st.circAng) * ease;
            let cand = rot(d, a);
            if (!dirSafe(d, cand, hz, me, myR, mySpeed)) {
                a *= 0.5;
                cand = rot(d, a);
            } // not safe -> try half the swing
            if (dirSafe(d, cand, hz, me, myR, mySpeed)) {
                d = cand;
                st.circAng = a;
            }
            else
                st.circAng *= 0.5; // still not safe -> straight dodge, swing fades out
        }
        st.pfSearch = (st.pfSearch || 0) * 0.8 + (Date.now() - _p2) * 0.2;
        st.headingIdx = chosen;
        st.heading = d;
        // Acceleration: at the start only a fraction of the ticks actually move (stop ticks in between)
        const f = st.accMs > 0 ? 0.3 + 0.7 * Math.min(1, (now - st.dodgeStart) / st.accMs) : 1;
        let dist = CFG.REACH; // Fallback: no safe direction -> full distance
        const ntD = (d === ring[chosen] && ntMemo.has(chosen)) ? ntMemo.get(chosen) : needTime(hz, me, d, mySpeed, myR);
        if (ntD) {
            dist = Math.max(CFG.MIN_STEP, Math.min(CFG.REACH, ntD.t * mySpeed + 60));
            if (ntD.fd < CFG.WALL_LOOK)
                dist = Math.max(40, Math.min(dist, ntD.fd));
        }
        else {
            const fdc = freeDist(me, d, myR);
            if (fdc < CFG.WALL_LOOK)
                dist = Math.max(40, Math.min(dist, fdc));
        } // never target inside a wall, even without a safe direction
        st.lastDist = dist;
        if (moveFactor(bl, me, d, f, dist))
            st.moves++;
        st.sentOnce = true;
        if (chosen !== prevIdx && now - st.lastLog > 250) {
            st.lastLog = now;
            log("[Autododge] dodge ->", Math.round(me.x + d.x * dist), Math.round(me.y + d.y * dist), "Distance:", Math.round(dist), "Threats:", hz.length);
        }
    }
    // f in (0,1]: fraction of ticks in which movement actually happens (otherwise stop input) -> accelerate/brake
    function moveFactor(bl, me, d, f, dist) {
        const go = () => sendMove(bl.b, bl.l, Math.round(me.x + d.x * dist), Math.round(me.y + d.y * dist));
        if (f >= 0.999)
            return go();
        st.accAcc += f;
        if (st.accAcc >= 1) {
            st.accAcc -= 1;
            return go();
        }
        return sendMove(bl.b, bl.l, me.x, me.y);
    }
    // ==================== Input guard ====================
    // The game sends your own move inputs AFTER our tick (every frame). In that case:
    //  1) if a dodge is currently running -> your input would overwrite it (dodge "does not block quite there") -> replaced by the dodge target
    //  2) otherwise: if your path would be a hit -> block the input (stand still, if that is safe) or steer to the nearest safe direction
    function guardCompute(ox, oy, now) {
        if (!st.hz || now - st.hzAt > 150 || !st.gMe)
            return null;
        let me = st.gMe;
        try {
            if (st.gOwn && validObj(st.gOwn))
                me = posOf(st.gOwn);
        }
        catch (_) { }
        const hz = st.hz, myR = st.gR, mySpeed = st.gSpd;
        if (st.heading && now - st.lastDanger <= CFG.RETURN_DELAY + 150) {
            const d = st.heading, dist = st.lastDist || CFG.REACH;
            return { x: Math.round(me.x + d.x * dist), y: Math.round(me.y + d.y * dist), why: "dodge" };
        }
        if (hz.length === 0)
            return null;
        const dx = ox - me.x, dy = oy - me.y, len = Math.hypot(dx, dy);
        if (len < 20)
            return null; // Stop input / you are standing
        const u = { x: dx / len, y: dy / len };
        const fd0 = freeDist(me, u, myR);
        const tm0 = Math.min(len / mySpeed, fd0 >= CFG.WALL_LOOK ? Infinity : fd0 / mySpeed);
        const c = clearance(hz, me.x, me.y, mySpeed * u.x, mySpeed * u.y, tm0);
        if (c >= CFG.SAFE)
            return null; // your path is safe
        const stay = clearance(hz, me.x, me.y, 0, 0);
        if (stay >= CFG.SAFE && !CFG.GUARD_STEER)
            return { x: Math.round(me.x), y: Math.round(me.y), why: "block" };
        let best = null, bs = stay >= CFG.SAFE ? 1000 : Math.min(stay, CFG.SAFE);
        let bestFd = 0;
        const gStride = st.avgMs > 12 ? 4 : st.avgMs > 6 ? 2 : 1; // PERF: under load only every 2nd direction
        const gT0 = Date.now();
        for (let go = 0; go < ringOrder.length; go++) {
            const gi = ringOrder[go];
            if (gStride > 1 && (gi % gStride) !== 0)
                continue;
            if ((go & 7) === 7 && Date.now() - gT0 > CFG.GUARD_BUDGET_MS)
                break; // PERF: bounded time, coarse directions come first
            const d = ring[gi];
            dirEval(gi, hz, me, myR, mySpeed);
            const fd = dirC.fd[gi];
            const sc0 = dirC.clr[gi];
            const dot = d.x * u.x + d.y * u.y;
            const gWallPen = fd < CFG.WALL_MARGIN ? (CFG.WALL_MARGIN - fd) * CFG.WALL_PEN : 0;
            const sc = sc0 >= CFG.SAFE ? 1000 + 300 * dot - gWallPen : Math.min(sc0, CFG.SAFE) + 50 * dot;
            if (sc > bs) {
                bs = sc;
                best = d;
                bestFd = fd;
            }
        }
        if (!best)
            return { x: Math.round(me.x), y: Math.round(me.y), why: "block" };
        const dist = Math.max(40, Math.min(CFG.REACH, bestFd));
        return { x: Math.round(me.x + best.x * dist), y: Math.round(me.y + best.y * dist), why: "steer" };
    }
    function guardDecide(ox, oy) {
        if (!st.enabled || !CFG.GUARD || st.sending)
            return null;
        const now = Date.now(), gc = st.gc;
        try { // MOVE-FIX: remember the original player input (direction relative to me); stop input (length < 20) = joystick released
            const mo = st.gOwn;
            if (mo && validObj(mo)) {
                const m = posOf(mo), dx = ox - m.x, dy = oy - m.y;
                st.pm = { dx, dy, l: Math.hypot(dx, dy), t: now };
            }
        }
        catch (_) { }
        // PERF FIX: the decision is reused for 45 ms as long as no new threat snapshot (st.hzAt) exists, no matter how the joystick
        // position changes. Before, the cache missed on EVERY frame (ox/oy move with the character) -> a full direction search per input.
        if (gc && now - gc.t < 45 && gc.hzAt === st.hzAt)
            return gc.r; // Predict + AddInput get the same decision
        let r = null;
        const gT = Date.now();
        try {
            r = guardCompute(ox, oy, now);
        }
        catch (_) {
            r = null;
        }
        st.guardMs = (st.guardMs || 0) * 0.9 + (Date.now() - gT) * 0.1;
        st.gc = { ox, oy, t: now, r, hzAt: st.hzAt };
        if (r && (r.x !== ox || r.y !== oy)) {
            st.guarded++;
            if (now - st.lastGuardLog > 250) {
                st.lastGuardLog = now;
                log("[Guard] Own move replaced (" + r.why + "):", ox + "," + oy, "->", r.x + "," + r.y);
            }
        }
        return r;
    }
    function installGuard() {
        if (st.guardHooked)
            return;
        Interceptor.attach(base.add(O.Predict), { onEnter(args) {
                try {
                    if (st.sending || !CFG.GUARD || !st.enabled)
                        return;
                    if (args[3].toInt32() !== 1)
                        return;
                    const ox = args[1].toInt32(), oy = args[2].toInt32();
                    const r = guardDecide(ox, oy);
                    if (r && (r.x !== ox || r.y !== oy)) {
                        args[1] = ptr(r.x);
                        args[2] = ptr(r.y);
                        st.gp = { ox, oy, nx: r.x, ny: r.y, t: Date.now() };
                    }
                }
                catch (_) { }
            } });
        Interceptor.attach(base.add(O.AddInput), { onEnter(args) {
                try {
                    if (st.sending || !CFG.GUARD || !st.enabled)
                        return;
                    const ci = args[1];
                    if (ci.add(O.CI_type).readS32() !== O.MOVE_TYPE)
                        return;
                    const ox = ci.add(O.CI_x).readS32(), oy = ci.add(O.CI_y).readS32();
                    let nx, ny;
                    const gp = st.gp;
                    if (gp && gp.ox === ox && gp.oy === oy && Date.now() - gp.t < 80) {
                        nx = gp.nx;
                        ny = gp.ny;
                    }
                    else {
                        const r = guardDecide(ox, oy);
                        if (!r)
                            return;
                        nx = r.x;
                        ny = r.y;
                    }
                    if (nx !== ox || ny !== oy) {
                        ci.add(O.CI_x).writeS32(nx | 0);
                        ci.add(O.CI_y).writeS32(ny | 0);
                    }
                }
                catch (_) { }
            } });
        st.guardHooked = true;
        log("[Guard] Input guard active");
    }
    function installHook() {
        if (st.hooked)
            return true;
        try {
            try {
                installGuard();
            }
            catch (e) {
                log("[Guard] Hook fehlgeschlagen:", e);
            }
            Interceptor.attach(base.add(O.FrameHook), { onEnter(args) {
                    try {
                        const c = args[2].isNull() ? args[1] : args[2];
                        st.hookChar = c;
                        st.hookCharAt = Date.now();
                    }
                    catch (_) { }
                    try {
                        tick();
                    }
                    catch (e) {
                        st.errors++;
                        st.lastError = String(e && e.stack || e);
                        if (st.errors <= 3)
                            log("[Autododge] tick error #" + st.errors + ":", st.lastError);
                        if (st.errors >= 10) {
                            st.enabled = false;
                            PH.on.dodge_ON = false;
                            log("[Autododge] wegen Fehlern abgeschaltet -> dbg.dodge.state.lastError");
                        }
                    }
                } });
            st.hooked = true;
            return true;
        }
        catch (e) {
            log("[Autododge] Hook fehlgeschlagen:", e);
            return false;
        }
    }
    const api = {
        state: st, cfg: CFG, walls: Walls, log: LOGCFG,
        offsets: O,
        x: { st, battleLogic, ownCharOf, objList, validObj, safe, rdPtr, posOf, wallsUpdate, wallsReset, wallsOn, ctorInput, addInput, getBattle, sendMove }, // fuer die Kill-Aura-Engine
        enable() { if (!st.ready || !installHook())
            return false; PH.on.dodge_ON = true; return true; },
        disable() { PH.on.dodge_ON = false; },
        toggle() { PH.on.dodge_ON = !PH.on.dodge_ON; return PH.on.dodge_ON; },
        verbose(on) { LOGCFG.verbose = on === undefined ? !LOGCFG.verbose : !!on; console.log("[DEBUG-iOS] Dodge verbose:", LOGCFG.verbose); },
        setPrecision(n) { CFG.DIR_COUNT = Math.max(8, Math.min(128, n | 0)); buildRing(); log("[Autododge] Richtungen:", CFG.DIR_COUNT); },
        setMargin(m) { CFG.SKIN = Math.max(0, Math.min(120, m)) * 2; log("[Autododge] SKIN:", CFG.SKIN); },
        setReach(r) { CFG.REACH = Math.max(200, Math.min(2000, r | 0)); },
        setEngage(r) { CFG.ENGAGE = Math.max(0, Math.min(400, r | 0)); },
        setLock(ms) { CFG.LOCK_MS = Math.max(30, Math.min(600, ms | 0)); },
        setSend(ms) { CFG.SEND_MS = Math.max(16, Math.min(200, ms | 0)); },
        setWalls(stop, avoid) { CFG.WALL_STOP = stop ? 1 : 0; CFG.WALL_AVOID = (avoid === undefined ? stop : avoid) ? 1 : 0; log("[Autododge] Wand-Stop:", CFG.WALL_STOP, "Wand-Ausweichen:", CFG.WALL_AVOID); },
        setDamageOffset(off) { CFG.PD_DAMAGE = off | 0; log("[Autododge] PD_DAMAGE = 0x" + CFG.PD_DAMAGE.toString(16)); },
        setVtable(off) { projVt = base.add(off); kindCache.clear(); _scanMemo = null; log("[Autododge] ProjVtable:", projVt); },
        trace(on) { CFG.TRACE = on ? 1 : 0; },
        resetDefaults() { dodgeDefaults(); clearHeading(); tracks.clear(); },
        resetCfg() { clearHeading(); tracks.clear(); },
        // Objekte im Kampf auflisten: Vtable-Offset der Daten -> zeigt, welcher Offset zu fliegenden Projektilen gehoert
        probe() {
            const bl = battleLogic();
            if (!bl)
                return log("[Autododge] nicht im Kampf");
            const r = objList(bl.l);
            if (!r)
                return log("[Autododge] Objektliste nicht gefunden");
            const rows = [];
            for (let i = 0; i < r.n && i < 400; i++) {
                const o = rdPtr(r.arr.add(i * 8));
                if (o.isNull())
                    continue;
                try {
                    const d = rdPtr(o.add(O.Obj_data));
                    const dv = d.isNull() ? ptr(0) : rdPtr(d);
                    const p = posOf(o);
                    rows.push("0x" + dv.sub(base).toString(16) + " (" + p.x + "," + p.y + ") team=" + o.add(O.Obj_team).readU32());
                }
                catch (_) { }
            }
            log("[Autododge] probe (erwartet Projektil-Vtable 0x" + projVt.sub(base).toString(16) + "):\n" + rows.join("\n"));
        },
        probeDamage() {
            const bl = battleLogic();
            if (!bl)
                return log("[Autododge] nicht im Kampf");
            const sc = scan(bl.l);
            const own = ownCharOf(bl.l);
            const myTeam = own && !own.isNull() ? own.add(O.Obj_team).readU32() : -1;
            const pr = sc.projs.find((q) => { try {
                return q.p.add(O.Obj_team).readU32() !== myTeam;
            }
            catch (_) {
                return false;
            } });
            if (!pr)
                return log("[Autododge] kein gegnerisches Projektil gefunden - nochmal versuchen, waehrend ein Schuss fliegt");
            const data = rdPtr(pr.p.add(O.Obj_data));
            const rows = [];
            for (let off = 0; off < 0x300; off += 4) {
                try {
                    const v = data.add(off).readS32();
                    if (v >= 1 && v <= 20000)
                        rows.push("0x" + off.toString(16) + "=" + v);
                }
                catch (_) { }
            }
            log("[Autododge] Projektil-Daten (offset=wert):\n" + rows.join("  ") + "\n-> Schadenswert suchen, dann dbg.dodge.setDamageOffset(0x..)");
        },
        ranges() {
            const rows = [];
            for (const [k, e] of rangeMap)
                rows.push(k + "  max=" + Math.round(e.max) + "  n=" + e.n);
            log("[Autododge] gelernte Reichweiten (" + rows.length + "), spdK=" + st.spdK.toFixed(3) + " (n=" + st.spdKn + "), jumps=" + st.jumps + "\n" + rows.join("\n"));
        },
        wallsDump() {
            const bl = battleLogic();
            if (!bl)
                return log("[Autododge] nicht im Kampf");
            log("[Autododge] Waende: ok=" + Walls.ok, "bad=" + Walls.bad, "Groesse=" + Walls.w + "x" + Walls.h, "Zyklen=" + Walls.cycles, "Bewegung-Blocker=" + Walls.nMove, "Projektil-Blocker=" + Walls.nProj, "Quelle=" + Walls.from + "+0x" + Walls.off.toString(16), "w@+0x" + (Walls.twOff >= 0 ? Walls.twOff.toString(16) : "?"));
            const own = ownCharOf(bl.l);
            if (!own || !Walls.grid)
                return;
            const me = posOf(own), mtx = Math.floor(me.x / O.TILE), mty = Math.floor(me.y / O.TILE);
            const rows = [];
            for (let dy = -6; dy <= 6; dy++) {
                let line = "";
                for (let dx = -9; dx <= 9; dx++) {
                    const tx = mtx + dx, ty = mty + dy;
                    if (dx === 0 && dy === 0) {
                        line += "@";
                        continue;
                    }
                    if (tx < 0 || ty < 0 || tx >= Walls.w || ty >= Walls.h) {
                        line += "~";
                        continue;
                    }
                    const v = Walls.grid[ty * Walls.w + tx] & 3;
                    line += v === 3 ? "#" : v === 1 ? "w" : v === 2 ? "p" : ".";
                }
                rows.push(line);
            }
            log("[Autododge] Tile (" + mtx + "," + mty + ") pos " + JSON.stringify(me) + "\n" + rows.join("\n"));
        },
        dump() {
            const bl = battleLogic();
            if (!bl)
                return log("[Autododge] nicht im Kampf");
            const sc = scan(bl.l), own = ownCharOf(bl.l);
            log("[Autododge] logic:", bl.l, "objekte:", sc.n, "projektile:", sc.projs.length, "own:", own, own && !own.isNull() ? JSON.stringify(posOf(own)) + " team=" + own.add(O.Obj_team).readU32() : "(nicht gefunden)", "src:", st.ownSrc, "objektliste:", OL.found ? ("Logic+0x" + OL.off.toString(16) + "/" + OL.mode) : "default", "hook:", st.hooked, "ticks:", st.ticks, "threats:", st.threats, "moves:", st.moves, "errors:", st.errors, "avgMs:", st.avgMs.toFixed(2), "tickMs:", CFG.TICK_MS);
        },
        perf() { log("[Autododge] perf (ms, avg): scan", (st.pfScan || 0).toFixed(2), "| collect", (st.pfCollect || 0).toFixed(2), "| search", (st.pfSearch || 0).toFixed(2), "| tick", st.avgMs.toFixed(2), "| projektile", st.nProj || 0, "| threats", st.threats, "| budget", st.budgetHits || 0); },
    };
    if (st.ready) {
        try {
            installHook();
        }
        catch (e) {
            log("[Autododge] preinstall fehlgeschlagen:", e);
        }
    }
    log("[Autododge] bereit (iOS) - Menue: Combat > Autododge | Konsole: dbg.dodge.dump()");
    return api;
}
const Dodge = createDodge({ PH, base, calloc });
// ============================================================
//  Kill Aura  (iOS-Port aus neuerdodge.js, Binary "laser")
//  Statisch verifiziert (Disassembly):
//    BattleScreen::attack          0x226970   (baut den Input: Ctor 0x40a66c, AddInput 0x1db228 ueber Battle+0x58)
//    Input-Struct (0x2c)           Typ +0x4 | x +0x8 | y +0xc | Ziel-ID +0x10 (u32) | AutoAim-Flag +0x14 | ID-Flag +0x15 (u8)
//    manueller Schuss              Flags 0/0, ID 0, x/y RELATIV zur eigenen Position (0x226c40..0x226c58)
//    Auto-Aim-Schuss               Flags 1/1, ID = Ziel-Objekt-ID, x/y absolut
//    Charakter +0x180 / +0x1d9     gleiche Offsets wie Android (0x1d9 = Aktion gesperrt)
//  Nicht statisch belegt: Spawn-Shield-Byte (Kandidaten 0xdc / 0x134), Input-Typ-Nummern (Standard: 0 = Angriff, 1 = Super)
//  Steuerung ueber das Menue: PH.on.aura_ON + aura_* Werte.   Konsole: dbg.aura.dump() | sniff(true) | probe() | shield()
// ============================================================
function createAura(env) {
    const { PH, base, calloc, Dodge } = env;
    const X = Dodge.x; // Interna der Dodge-Engine (Objektliste, eigener Charakter, Wandkarte, Input-Funktionen)
    const Walls = Dodge.walls;
    const LOGCFG = { verbose: false };
    const NOISY = /^\[KillAura\] (Attack|Super ->|no target|Line of sight)/;
    const log = (...args) => {
        if (!LOGCFG.verbose && typeof args[0] === "string" && NOISY.test(args[0]))
            return;
        console.log("[DEBUG-iOS]", ...args);
    };
    const O = { BM_input: 0x58, Obj_x: 0x30, Obj_y: 0x34, Obj_team: 0x40, CI_size: 0x2c, CI_x: 0x8, CI_y: 0xc, CI_type: 0x4, TILE: 300 };
    const AUTO_AIM_ID = 0x000f4241; // Ziel-ID, die das Spiel beim Auto-Aim mitschickt
    // Werte aus dem Menue (aimPage("aura_")): gleiche Standardwerte wie die Regler dort, damit Anzeige == Engine
    // PFX: Kill Aura liest "aura_*", der Aimbot rechnet seinen Zielpunkt mit "aimbot_*" (gleiche Engine, eigene Menue-Werte)
    let PFX = "aura_";
    const g = (k, d) => ((PFX + k) in PH.val ? PH.val[PFX + k] : d);
    const flag = (k, d) => ((PFX + k) in PH.on ? !!PH.on[PFX + k] : d);
    const CFG = {
        INTERVAL: 250, SCAN_MS: 50, LAG: 120, LEAD: 2200, LEADT: 250, LEADMAX: 350,
        TYPE: 0, SUPER_TYPE: 1, SUPER_INTERVAL: 1500,
        SHIELD_OFF: 0, // 0 = Spawn-Shield-Pruefung aus (Offset auf iOS unbestaetigt) -> dbg.aura.setShieldOffset(0x134)
        WALL_STEP: 75, SHOT_R: 30,
    };
    const rnd = (a, b) => a + Math.random() * (Math.max(a, b) - a);
    const AU = { enabled: false, errors: 0, lastError: "", shots: 0, supers: 0, ticks: 0, lastScan: 0, lastFire: 0, lastSuper: 0,
        target: null, chars: 0, enemies: 0, shielded: 0, lastLog: 0, sending: false, sniff: false,
        pm: null, mvx: 0, mvy: 0, faceX: undefined, faceY: undefined, lastBlock: null, avgMs: 0, adapt: 0, hooked: false, sniffHooked: false };
    // Aimbot: schiesst NICHT selbst, biegt nur DEINEN Schuss (AddInput-Hook) auf den berechneten Zielpunkt
    const AB = { enabled: false, hooked: false, aim: null, target: null, rewrites: 0, lastLog: 0, lastErr: "" };
    const enemyTracks = new Map();
    const charKind = new Map();
    // ---------- Objekttyp (Vtable-Slot +0x28, statisch verifiziert: Charakter = Typ 0, auch bei verschiedenen Vtables) ----------
    const typeCache = new Map();
    const IMG_SIZE = 0x13f8000; // Ende des Mach-O-Images (RVA); Process.mainModule.size meldet auf iOS evtl. nur __TEXT, die Vtables liegen aber in __DATA
    const inImg = (p) => { try {
        return p.compare(base) >= 0 && p.compare(base.add(IMG_SIZE)) < 0;
    }
    catch (_) {
        return false;
    } };
    function typeOfObj(o) {
        try {
            const vt = o.readPointer();
            const key = vt.toString();
            let t = typeCache.get(key);
            if (t === undefined) {
                if (!inImg(vt)) {
                    AU.typeErr = "vtable ausserhalb des Images: " + vt;
                    return -1;
                }
                const fn = vt.add(0x28).readPointer();
                if (!inImg(fn)) {
                    AU.typeErr = "Typ-Funktion ausserhalb des Images: " + fn + " (vtable " + vt + ")";
                    return -1;
                }
                t = new NativeFunction(fn, "int", ["pointer"])(o);
                typeCache.set(key, t);
            }
            return t;
        }
        catch (e) {
            AU.typeErr = String(e);
            return -1;
        }
    }
    // ---------- Gegner scannen (Charakter = gleicher Objekttyp wie der eigene) ----------
    function scanEnemies(l, own, me, now) {
        const out = [];
        const r = X.objList(l);
        if (!r)
            return out;
        let dv;
        try {
            dv = new DataView(r.arr.readByteArray(r.n * 8));
        }
        catch (_) {
            return out;
        }
        let ownVt;
        try {
            ownVt = own.readPointer();
        }
        catch (_) {
            return out;
        }
        const ownT = typeOfObj(own);
        AU.ownType = ownT;
        let ownKey = -1;
        try {
            ownKey = Number(BigInt(own.toString()));
        }
        catch (_) { }
        let myTeam = 0;
        try {
            myTeam = own.add(O.Obj_team).readU32();
        }
        catch (_) {
            return out;
        }
        const seen = new Set();
        let chars = 0;
        for (let i = 0; i < r.n; i++) {
            const lo = dv.getUint32(i * 8, true), hi = dv.getUint32(i * 8 + 4, true);
            if (lo === 0 && hi === 0)
                continue;
            const key = lo + hi * 4294967296;
            if (key === ownKey)
                continue;
            let o = null;
            let ck = charKind.get(key);
            if (ck === undefined || now - ck.t > 1500) {
                o = r.arr.add(i * 8).readPointer();
                if (!X.safe(o) || o.equals(own))
                    continue;
                let same = false;
                try {
                    same = ownT >= 0 ? (typeOfObj(o) === ownT) : o.readPointer().equals(ownVt);
                }
                catch (_) { } // ohne gueltigen Typ: Fallback gleiche Vtable
                ck = { k: same ? 1 : 0, t: now };
                charKind.set(key, ck);
            }
            if (ck.k !== 1)
                continue;
            if (o === null) {
                o = r.arr.add(i * 8).readPointer();
                if (!X.safe(o) || o.equals(own))
                    continue;
            }
            let team, x, y;
            try {
                team = o.add(O.Obj_team).readU32();
                x = o.add(O.Obj_x).readS32();
                y = o.add(O.Obj_y).readS32();
            }
            catch (_) {
                continue;
            }
            if (team >= 64 || team === myTeam)
                continue;
            if (x === 0 && y === 0)
                continue;
            if (Math.abs(x) > 200000 || Math.abs(y) > 200000)
                continue;
            chars++;
            seen.add(key);
            let tr = enemyTracks.get(key);
            if (!tr) {
                tr = { x, y, t: now, vx: 0, vy: 0, h: [{ x, y, t: now }] };
                enemyTracks.set(key, tr);
            }
            else {
                tr.x = x;
                tr.y = y;
                tr.t = now;
                tr.h.push({ x, y, t: now });
                while (tr.h.length > 2 && now - tr.h[0].t > 450)
                    tr.h.shift();
                let ref = null;
                for (const sm of tr.h) {
                    if (now - sm.t >= 200)
                        ref = sm;
                    else
                        break;
                } // Geschwindigkeit aus dem 200-450-ms-Fenster (robust gegen den 20-Hz-Logiktick)
                if (!ref)
                    ref = tr.h[0];
                const dt = (now - ref.t) / 1000;
                if (dt >= 0.08) {
                    tr.vx = (x - ref.x) / dt;
                    tr.vy = (y - ref.y) / dt;
                }
            }
            let sh = 0;
            if (CFG.SHIELD_OFF > 0) {
                try {
                    sh = o.add(CFG.SHIELD_OFF).readU8() !== 0 ? 1 : 0;
                }
                catch (_) { }
            }
            out.push({ key, o, x, y, vx: tr.vx, vy: tr.vy, sh, d: Math.hypot(x - me.x, y - me.y) });
        }
        AU.chars = chars;
        AU.enemies = out.length;
        AU.shielded = out.reduce((n, e) => n + e.sh, 0);
        for (const k of enemyTracks.keys())
            if (!seen.has(k))
                enemyTracks.delete(k);
        for (const [k, v] of charKind)
            if (now - v.t > 5000)
                charKind.delete(k);
        return out;
    }
    // ---------- Sichtlinie (Wandkarte der Dodge-Engine) ----------
    function blocked(x, y) {
        const grid = Walls.grid;
        if (!grid)
            return false;
        const tx = Math.floor(x / O.TILE), ty = Math.floor(y / O.TILE);
        if (tx < 0 || ty < 0 || tx >= Walls.w || ty >= Walls.h)
            return true;
        const raw = grid[ty * Walls.w + tx], v = raw & 3;
        if (Walls.strictWalls)
            return v === 3;
        if (raw & 4)
            return false; // Wasser blockiert nie Schuesse
        return (v & 2) !== 0; // nur Kacheln, die PROJEKTILE blockieren (cls 2 und 3); cls 1 = nur Bewegung (Wasser/Loch) -> Schuesse fliegen drueber
    }
    function ray(ox, oy, ux, uy, d, sa, sb) {
        for (let s = 40; s <= d; s += CFG.WALL_STEP) {
            const x = ox + ux * s, y = oy + uy * s;
            const tx = Math.floor(x / O.TILE), ty = Math.floor(y / O.TILE);
            if ((tx === sa[0] && ty === sa[1]) || (tx === sb[0] && ty === sb[1]))
                continue; // eigene Kachel + Zielkachel ueberspringen
            if (blocked(x, y))
                return s;
        }
        return d;
    }
    function clearShot(me, tx, ty, d) {
        if (!(d > 1))
            return true;
        const ux = (tx - me.x) / d, uy = (ty - me.y) / d, px = -uy, py = ux;
        const A = [Math.floor(me.x / O.TILE), Math.floor(me.y / O.TILE)], B = [Math.floor(tx / O.TILE), Math.floor(ty / O.TILE)];
        for (const off of [0, CFG.SHOT_R, -CFG.SHOT_R]) { // Mitte + zwei Strahlen im Abstand des Projektilradius
            const tol = off === 0 ? 60 : 110;
            const ox = me.x + px * off, oy = me.y + py * off;
            const h = ray(ox, oy, ux, uy, d, A, B);
            if (h < d - tol) {
                try {
                    const bx = Math.floor((ox + ux * h) / O.TILE), by = Math.floor((oy + uy * h) / O.TILE);
                    const inMap = bx >= 0 && by >= 0 && bx < Walls.w && by < Walls.h;
                    AU.lastBlock = { tx: bx, ty: by, cls: inMap ? Walls.grid[by * Walls.w + bx] : -1, ray: off, dist: Math.round(h), of: Math.round(d) };
                }
                catch (_) { }
                return false;
            }
        }
        return true;
    }
    const wallsOk = () => X.wallsOn();
    // ---------- Zielwahl + Zielpunkt ----------
    function pickTarget(list, me) {
        let best = null;
        const rng = g("RANGE", 3000), maxAngle = g("MAXANGLE", 90), los = flag("LOS", true), skipShield = flag("SKIPSHIELD", true);
        AU.lastBlock = null;
        AU.mapMissing = false;
        for (const e of list) {
            if (e.d > rng || e.d < 1)
                continue;
            if (skipShield && e.sh)
                continue;
            if (best && e.d >= best.d)
                continue;
            if (maxAngle < 360 && AU.faceX !== undefined) {
                const cosA = ((e.x - me.x) * AU.faceX + (e.y - me.y) * AU.faceY) / e.d;
                if (Math.acos(Math.max(-1, Math.min(1, cosA))) * 180 / Math.PI > maxAngle / 2)
                    continue;
            }
            if (los) {
                if (!wallsOk())
                    AU.mapMissing = true; // ohne Wandkarte ohne Sichtlinien-Pruefung schiessen (statt gar nicht)
                else if (!clearShot(me, e.x, e.y, e.d))
                    continue;
            }
            best = e;
        }
        return best;
    }
    function aimPoint(best, me) {
        const rng = g("RANGE", 3000), los = flag("LOS", true);
        let ax = best.x, ay = best.y;
        let vx = best.vx, vy = best.vy;
        const sp = Math.hypot(vx, vy);
        if (sp < 80) {
            vx = 0;
            vy = 0;
        }
        else if (sp > 1500) {
            vx *= 1500 / sp;
            vy *= 1500 / sp;
        }
        const lag = CFG.LAG / 1000;
        if (flag("MODE", false)) { // feste Vorhaltezeit
            ax = best.x + vx * CFG.LEADT / 1000;
            ay = best.y + vy * CFG.LEADT / 1000;
        }
        else { // Abfangpunkt: P = pos + v*t mit |P - me| = Geschwindigkeit * t
            const px = best.x + vx * lag - me.x, py = best.y + vy * lag - me.y;
            const s = Math.max(800, CFG.LEAD);
            const a = vx * vx + vy * vy - s * s, b = 2 * (px * vx + py * vy), c = px * px + py * py;
            let t;
            if (Math.abs(a) < 1e-6)
                t = c / Math.max(1e-6, -b);
            else {
                const disc = b * b - 4 * a * c;
                if (disc < 0)
                    t = Math.sqrt(c) / s;
                else {
                    const r1 = (-b - Math.sqrt(disc)) / (2 * a), r2 = (-b + Math.sqrt(disc)) / (2 * a);
                    t = Math.min(r1 > 0 ? r1 : 1e9, r2 > 0 ? r2 : 1e9);
                }
            }
            if (!(t > 0) || t > 1.5)
                t = Math.sqrt(c) / s;
            t = Math.min(t, 1.2);
            ax = best.x + vx * (lag + t);
            ay = best.y + vy * (lag + t);
        }
        { // Vorhalt hoechstens LEADMAX vor dem Gegner und nie ausserhalb der Reichweite (dann Vorhalt kuerzen statt nicht schiessen)
            let lx = ax - best.x, ly = ay - best.y;
            const ll = Math.hypot(lx, ly);
            if (CFG.LEADMAX > 0 && ll > CFG.LEADMAX) {
                lx *= CFG.LEADMAX / ll;
                ly *= CFG.LEADMAX / ll;
            }
            const rmax = rng + 150;
            if (Math.hypot(best.x + lx - me.x, best.y + ly - me.y) > rmax) {
                let lo = 0, hi = 1;
                for (let i = 0; i < 8; i++) {
                    const mid = (lo + hi) / 2;
                    if (Math.hypot(best.x + lx * mid - me.x, best.y + ly * mid - me.y) <= rmax)
                        lo = mid;
                    else
                        hi = mid;
                }
                lx *= lo;
                ly *= lo;
            }
            ax = best.x + lx;
            ay = best.y + ly;
        }
        ax = Math.round(ax);
        ay = Math.round(ay);
        if (Math.hypot(ax - me.x, ay - me.y) > rng + 150)
            return null;
        if (los && wallsOk()) {
            const dd = Math.hypot(ax - me.x, ay - me.y);
            if (dd > 1 && !clearShot(me, ax, ay, dd))
                return null;
        }
        { // Strength / Opposite / Opposite strength / Max radius
            const dx = ax - me.x, dy = ay - me.y;
            const oppChance = g("OPP_CHANCE", 0);
            if (oppChance > 0 && Math.random() * 100 < oppChance) {
                const os = rnd(g("OPP_MIN", 20), g("OPP_MAX", 60)) / 100;
                ax = me.x - dx * os;
                ay = me.y - dy * os;
            }
            else {
                const s = rnd(g("STR_MIN", 60), g("STR_MAX", 100)) / 100;
                ax = me.x + dx * s;
                ay = me.y + dy * s;
                const mr = g("MAXRADIUS", 3);
                if (mr > 0) {
                    const ang = Math.random() * 2 * Math.PI, rr = Math.sqrt(Math.random()) * mr * O.TILE;
                    ax += Math.cos(ang) * rr;
                    ay += Math.sin(ang) * rr;
                }
            }
            ax = Math.round(ax);
            ay = Math.round(ay);
        }
        return { ax, ay };
    }
    // ---------- Input senden (manueller Schuss: Flags 0/0, ID 0, x/y relativ zur eigenen Position) ----------
    function sendOne(b, type, x, y) {
        const mgr = X.rdPtr(b.add(O.BM_input));
        if (!X.safe(mgr))
            return false;
        const ci = calloc(1, O.CI_size);
        if (ci.isNull())
            return false;
        X.ctorInput(ci, type | 0);
        ci.add(O.CI_x).writeS32(x | 0);
        ci.add(O.CI_y).writeS32(y | 0);
        ci.add(0x10).writeU32(0);
        ci.add(0x14).writeU8(0);
        ci.add(0x15).writeU8(0);
        AU.sending = true;
        X.st.sending = true; // eigene Inputs nie vom Input-Guard anfassen lassen
        try {
            X.addInput(mgr, ci);
        }
        finally {
            AU.sending = false;
            X.st.sending = false;
        }
        return true;
    }
    function relXY(ax, ay, me) {
        const lag = CFG.LAG / 1000;
        return [Math.round(ax - (me.x + AU.mvx * lag)), Math.round(ay - (me.y + AU.mvy * lag))];
    }
    // ---------- Frame ----------
    function frameInner() {
        const want = !!PH.on.aura_ON, wantAim = !!PH.on.aimbot_ON;
        if (want !== AU.enabled) {
            AU.enabled = want;
            AU.errors = 0;
            if (!want) {
                AU.target = null;
                if (!AB.enabled && !wantAim)
                    enemyTracks.clear();
            }
            log("[KillAura]", want ? "ON" : "OFF");
        }
        if (wantAim !== AB.enabled) {
            AB.enabled = wantAim;
            AB.rewrites = 0;
            if (wantAim)
                installAimHook();
            else {
                AB.aim = null;
                AB.target = null;
            }
            log("[Aimbot]", wantAim ? "ON" : "OFF");
        }
        if ((!AU.enabled && !AB.enabled) || !X.st.ready)
            return;
        const now = Date.now();
        if (now - AU.lastScan < Math.max(CFG.SCAN_MS, AU.adapt))
            return;
        AU.lastScan = now;
        AU.ticks++;
        const bl = X.battleLogic();
        if (!bl) {
            enemyTracks.clear();
            charKind.clear();
            AU.target = null;
            AU.pm = null;
            return;
        }
        const own = X.ownCharOf(bl.l);
        if (!own || own.isNull()) {
            AU.target = null;
            return;
        }
        if (!X.st.enabled)
            X.wallsUpdate(bl.l, bl.b, now); // Wandkarte pflegt der Dodge sonst selbst
        const me = X.posOf(own);
        { // eigene Geschwindigkeit (Position aendert sich im 20-Hz-Tick) -> fuer das relative Ziel
            const pm = AU.pm;
            if (!pm)
                AU.pm = { x: me.x, y: me.y, t: now };
            else if (me.x !== pm.x || me.y !== pm.y) {
                const dt = (now - pm.t) / 1000;
                if (dt >= 0.03 && dt <= 0.4) {
                    let vx = (me.x - pm.x) / dt, vy = (me.y - pm.y) / dt;
                    const sp = Math.hypot(vx, vy);
                    if (sp > 1500) {
                        vx *= 1500 / sp;
                        vy *= 1500 / sp;
                    }
                    AU.mvx = AU.mvx * 0.5 + vx * 0.5;
                    AU.mvy = AU.mvy * 0.5 + vy * 0.5;
                }
                else {
                    AU.mvx = 0;
                    AU.mvy = 0;
                }
                AU.pm = { x: me.x, y: me.y, t: now };
            }
            else if (now - pm.t > 150) {
                AU.mvx = 0;
                AU.mvy = 0;
            }
        }
        const msp = Math.hypot(AU.mvx, AU.mvy);
        if (msp > 120) {
            AU.faceX = AU.mvx / msp;
            AU.faceY = AU.mvy / msp;
        } // letzte Laufrichtung (fuer Max angle)
        const list = scanEnemies(bl.l, own, me, now);
        if (AB.enabled) { // Aimbot: nur Zielpunkt berechnen (mit den aimbot_*-Werten), geschossen wird vom Spieler
            PFX = "aimbot_";
            try {
                const bb = pickTarget(list, me);
                const apt = bb ? aimPoint(bb, me) : null;
                AB.target = bb;
                AB.aim = apt ? { ax: apt.ax, ay: apt.ay, mx: me.x, my: me.y, t: now } : null;
            }
            finally {
                PFX = "aura_";
            }
        }
        if (!AU.enabled)
            return;
        const best = pickTarget(list, me);
        AU.target = best;
        if (!best) {
            if (list.length && !AU.lastBlock && now - (AU.whyLog || 0) > 3000) {
                AU.whyLog = now;
                let nd = Infinity;
                for (const e of list)
                    if (e.d < nd)
                        nd = e.d;
                log("[KillAura] no target | Enemies:", list.length, "nearest:", Math.round(nd), "Range:", g("RANGE", 3000), nd > g("RANGE", 3000) ? "-> too far" : "", "with shield:", AU.shielded);
            }
            if (AU.lastBlock && now - (AU.blockLog || 0) > 3000) {
                AU.blockLog = now;
                log("[KillAura] Line of sight blocked by tile", AU.lastBlock.tx + "," + AU.lastBlock.ty, "cls=" + AU.lastBlock.cls, "Ray:", AU.lastBlock.ray, "at", AU.lastBlock.dist, "of", AU.lastBlock.of);
            }
            return;
        }
        const canSuper = flag("SUPER", false) && now - AU.lastSuper >= CFG.SUPER_INTERVAL;
        if (now - AU.lastFire < CFG.INTERVAL && !canSuper)
            return;
        const pt = aimPoint(best, me);
        if (!pt)
            return;
        const sxy = relXY(pt.ax, pt.ay, me);
        if (canSuper) {
            AU.lastSuper = now;
            if (sendOne(bl.b, CFG.SUPER_TYPE, sxy[0], sxy[1])) {
                AU.supers++;
                log("[KillAura] Super ->", pt.ax, pt.ay, "sent:", sxy[0] + "," + sxy[1], "Count:", AU.supers);
                return;
            }
        }
        if (now - AU.lastFire < CFG.INTERVAL)
            return;
        if (sendOne(bl.b, CFG.TYPE, sxy[0], sxy[1])) {
            AU.shots++;
            AU.lastFire = now;
            if (now - AU.lastLog > 1000) {
                AU.lastLog = now;
                log("[KillAura] Attack ->", pt.ax, pt.ay, "Target:", best.x, best.y, "v:", Math.round(best.vx), Math.round(best.vy), "sent:", sxy[0] + "," + sxy[1], "Distance:", Math.round(best.d), "Shots:", AU.shots);
            }
        }
    }
    function frame() {
        const t0 = Date.now();
        try {
            frameInner();
        }
        catch (e) {
            AU.errors++;
            AU.lastError = String((e && e.stack) || e);
            if (AU.errors <= 3)
                log("[KillAura] Error #" + AU.errors + ":", AU.lastError);
            if (AU.errors >= 10) {
                AU.enabled = false;
                PH.on.aura_ON = false;
                log("[KillAura] disabled due to errors -> dbg.aura.state.lastError");
            }
        }
        finally {
            const dt = Date.now() - t0;
            AU.avgMs = AU.avgMs * 0.9 + dt * 0.1;
            AU.adapt = Math.min(150, Math.max(0, Math.round(AU.avgMs * 4))); // teure Ticks -> seltener scannen
            if (dt >= 10 && t0 - (AU.slowLog || 0) > 1000) {
                AU.slowLog = t0;
                log("[KillAura] slow tick:", dt, "ms | enemies:", AU.enemies);
            }
        }
    }
    function installHook() {
        if (AU.hooked)
            return true;
        try {
            Interceptor.attach(base.add(Dodge.offsets.FrameHook), { onEnter() { frame(); } });
            AU.hooked = true;
            return true;
        }
        catch (e) {
            log("[KillAura] hook failed:", e);
            return false;
        }
    }
    function installAimHook() {
        if (AB.hooked)
            return true;
        try {
            Interceptor.attach(base.add(Dodge.offsets.AddInput), { onEnter(args) {
                    try {
                        if (!AB.enabled || AU.sending || X.st.sending)
                            return; // eigene Inputs des Scripts nie anfassen
                        const ci = args[1];
                        const it = ci.add(O.CI_type).readS32();
                        const isSup = !!PH.on.aimbot_SUPER && it === (CFG.SUPER_TYPE | 0); // Allow Super: auch dein Super wird gebogen
                        if (it !== (CFG.TYPE | 0) && !isSup)
                            return; // nur Hauptangriff (und ggf. Super)
                        const allowAim = ("aimbot_ALLOWAIM" in PH.on) ? !!PH.on.aimbot_ALLOWAIM : true;
                        // Allow Aim AUS: manuell gezogener Schuss (Flags 0/0) bleibt unveraendert; Taps (Auto-Aim, Flags 1/1) werden gebogen
                        if (!allowAim && ci.add(0x14).readU8() === 0 && ci.add(0x15).readU8() === 0)
                            return;
                        const aim = AB.aim, now = Date.now();
                        if (!aim || now - aim.t > 400)
                            return; // kein Ziel -> Schuss bleibt unveraendert
                        const sxy = relXY(aim.ax, aim.ay, { x: aim.mx, y: aim.my }); // manueller Schuss: relativ zur eigenen Position
                        ci.add(O.CI_x).writeS32(sxy[0] | 0);
                        ci.add(O.CI_y).writeS32(sxy[1] | 0);
                        ci.add(0x10).writeU32(0);
                        ci.add(0x14).writeU8(0);
                        ci.add(0x15).writeU8(0);
                        AB.rewrites++;
                        if (now - AB.lastLog > 1000) {
                            AB.lastLog = now;
                            log("[Aimbot] Shot bent ->", aim.ax, aim.ay, "sent:", sxy[0] + "," + sxy[1], "Count:", AB.rewrites);
                        }
                    }
                    catch (e) {
                        AB.lastErr = String((e && e.stack) || e);
                    }
                } });
            AB.hooked = true;
            log("[Aimbot] Input hook active");
            return true;
        }
        catch (e) {
            log("[Aimbot] Hook failed:", e);
            return false;
        }
    }
    const api = {
        aimbot: {
            state: AB,
            enable() { if (!installAimHook())
                return false; PH.on.aimbot_ON = true; return true; },
            disable() { PH.on.aimbot_ON = false; },
            toggle() { PH.on.aimbot_ON = !PH.on.aimbot_ON; return PH.on.aimbot_ON; },
            dump() { log("[Aimbot] on:", AB.enabled, "target:", AB.target ? JSON.stringify({ x: AB.target.x, y: AB.target.y, d: Math.round(AB.target.d) }) : "-", "aim:", JSON.stringify(AB.aim), "bent:", AB.rewrites, "hook:", AB.hooked, "errors:", AB.lastErr || "-"); },
        },
        state: AU, cfg: CFG, log: LOGCFG,
        enable() { if (!installHook())
            return false; PH.on.aura_ON = true; return true; },
        disable() { PH.on.aura_ON = false; },
        toggle() { PH.on.aura_ON = !PH.on.aura_ON; return PH.on.aura_ON; },
        verbose(on) { LOGCFG.verbose = on === undefined ? !LOGCFG.verbose : !!on; console.log("[DEBUG-iOS] KillAura verbose:", LOGCFG.verbose); },
        setInterval(ms) { CFG.INTERVAL = Math.max(30, Math.min(2000, ms | 0)); log("[KillAura] Interval ms:", CFG.INTERVAL); },
        setLag(ms) { CFG.LAG = Math.max(0, Math.min(500, ms | 0)); log("[KillAura] Delay ms:", CFG.LAG); },
        setLead(speed) { CFG.LEAD = Math.max(0, Math.min(10000, speed | 0)); log("[KillAura] Lead (projectile speed):", CFG.LEAD); },
        setLeadTime(ms) { CFG.LEADT = Math.max(0, Math.min(2000, ms | 0)); },
        setLeadMax(n) { CFG.LEADMAX = Math.max(0, Math.min(3000, n | 0)); log("[KillAura] Max. lead:", CFG.LEADMAX || "unlimited"); },
        setType(t) { CFG.TYPE = t | 0; log("[KillAura] Attack input type:", CFG.TYPE); },
        setSuperType(t) { t = t | 0; if (t === 2 || t === (CFG.TYPE | 0))
            return log("[KillAura] Super type must not be movement/main attack"); CFG.SUPER_TYPE = t; log("[KillAura] Super type:", t); },
        setSuperInterval(ms) { CFG.SUPER_INTERVAL = Math.max(100, Math.min(10000, ms | 0)); },
        setShieldOffset(o) { CFG.SHIELD_OFF = o | 0; log("[KillAura] Shield offset: 0x" + CFG.SHIELD_OFF.toString(16), CFG.SHIELD_OFF ? "" : "(off)"); },
        // Bytes an den Shield-Kandidaten aller Gegner ausgeben (direkt nach einem Respawn vs. spaeter vergleichen)
        shield() {
            const bl = X.battleLogic();
            if (!bl)
                return log("[KillAura] not in battle");
            const own = X.ownCharOf(bl.l);
            if (!own || own.isNull())
                return log("[KillAura] own char not found");
            const list = scanEnemies(bl.l, own, X.posOf(own), Date.now());
            for (const e of list) {
                try {
                    log("[KillAura] enemy", e.o, "+0xdc =", e.o.add(0xdc).readU8(), "| +0x134 =", e.o.add(0x134).readU8());
                }
                catch (_) { }
            }
            if (!list.length)
                log("[KillAura] no enemies");
        },
        // Alle Objekte mit fremdem Team: Vtable-Offset -> zeigt Charaktere mit anderer Klasse als der eigene (werden sonst nicht erkannt)
        probe() {
            const bl = X.battleLogic();
            if (!bl)
                return log("[KillAura] not in battle");
            const own = X.ownCharOf(bl.l);
            if (!own || own.isNull())
                return log("[KillAura] own char not found");
            const r = X.objList(bl.l);
            if (!r)
                return log("[KillAura] object list not found");
            const myTeam = own.add(O.Obj_team).readU32(), ownVt = own.readPointer(), rows = [];
            for (let i = 0; i < r.n && i < 400; i++) {
                const o = X.rdPtr(r.arr.add(i * 8));
                if (!X.safe(o))
                    continue;
                try {
                    const vt = o.readPointer();
                    const t = o.add(O.Obj_team).readU32();
                    if (t < 64 && t !== myTeam)
                        rows.push("vt 0x" + vt.sub(base).toString(16) + " type=" + typeOfObj(o) + (vt.equals(ownVt) ? " (= own class)" : "") + " team=" + t + " (" + o.add(O.Obj_x).readS32() + "," + o.add(O.Obj_y).readS32() + ")");
                }
                catch (_) { }
            }
            log("[KillAura] probe (own vt 0x" + ownVt.sub(base).toString(16) + "):\n" + rows.join("\n"));
        },
        // Loggt jeden Input, der in die Warteschlange geht (Spiel UND Script): echten Angriffs-/Super-Button druecken -> Typ-Nummern ablesen
        sniff(on) {
            if (!on) {
                AU.sniff = false;
                return log("[KillAura] sniff OFF");
            }
            if (!AU.sniffHooked) {
                try {
                    Interceptor.attach(base.add(Dodge.offsets.AddInput), { onEnter(args) {
                            if (!AU.sniff)
                                return;
                            try {
                                const ci = args[1];
                                log("[KillAura] input type", ci.add(4).readS32(), "x,y", ci.add(8).readS32(), ci.add(0xc).readS32(), "id", ci.add(0x10).readU32().toString(16), "flags", ci.add(0x14).readU8(), ci.add(0x15).readU8(), AU.sending ? "(script)" : "(game)");
                            }
                            catch (_) { }
                        } });
                    AU.sniffHooked = true;
                }
                catch (e) {
                    return log("[KillAura] sniff hook failed:", e);
                }
            }
            AU.sniff = true;
            log("[KillAura] sniff ON");
        },
        fire() {
            const bl = X.battleLogic();
            if (!bl)
                return log("[KillAura] not in battle");
            const own = X.ownCharOf(bl.l);
            if (!own || own.isNull())
                return log("[KillAura] own char not found");
            const me = X.posOf(own), list = scanEnemies(bl.l, own, me, Date.now());
            const best = pickTarget(list, me);
            if (!best)
                return log("[KillAura] no target in range");
            const pt = aimPoint(best, me);
            if (!pt)
                return log("[KillAura] hit point out of range / behind wall");
            const s = relXY(pt.ax, pt.ay, me);
            log("[KillAura] fire:", pt.ax, pt.ay, "-> sent", s[0], s[1], "->", sendOne(bl.b, CFG.TYPE, s[0], s[1]));
        },
        dump() {
            const bl = X.battleLogic();
            if (!bl)
                return log("[KillAura] not in battle");
            const own = X.ownCharOf(bl.l);
            log("[KillAura] on:", AU.enabled, "own:", own, own && !own.isNull() ? JSON.stringify(X.posOf(own)) + " team=" + own.add(O.Obj_team).readU32() : "(not found)", "ownType:", AU.ownType, "typeErr:", AU.typeErr || "-", "chars:", AU.chars, "enemies:", AU.enemies, "shielded:", AU.shielded, "shots:", AU.shots, "supers:", AU.supers, "walls ok:", X.wallsOn(), "ticks:", AU.ticks, "errors:", AU.errors, "avgMs:", AU.avgMs.toFixed(2), "last error:", AU.lastError || "-");
        },
    };
    if (X.st.ready) {
        try {
            installHook();
            installAimHook();
        }
        catch (e) {
            log("[KillAura] preinstall failed:", e);
        }
    }
    log("[KillAura] bereit (iOS) - Menue: Combat > Kill Aura | Konsole: dbg.aura.dump() / sniff(true) / probe() / shield()");
    return api;
}
const Aura = createAura({ PH, base, calloc, Dodge });
// ============================================================
//  Name Gradient  (iOS-Port aus neuerdodge.js, echte Funktion)
//  Statisch aus "laser" (RVAs):
//    LogicDataTables::getTable(int)           0x3770d0   (name_colors = Tabelle 43, siehe 0x39c4d8: mov w2,#0x2b)
//                                                        Tabelle: vtable+0x20 = Anzahl, vtable+0x28 = Eintrag(index)
//    NameColorData::getGradient               0x39130c   (ldr x0,[x0,#0x60] -> ColorGradientData*)
//    PlayerDisplayData::getNameColorData      0x40205c   (nur 4 Befehle lang -> kein sicherer Hook-Punkt)
//    NameField::setPlayerName                 0x95aa4    (this, displayData, str, w3)
//    TextField::setTextWithGradient           0x95dec    (this, GameString*, ColorGradientData*)   <- Hook, arg 2 wird ersetzt
//  Wirkung: alle Namen, die ueber setPlayerName und die Geschwister-Wrapper (0x95d94, 0x95eac) gebaut werden (nur clientseitig).
//  Namen werden nur beim Aufbau eines Screens gesetzt -> Screen neu oeffnen, um es zu sehen.
//  Konsole: dbg.grad.dump() | dbg.grad.set(n) | dbg.grad.enable(true/false) | dbg.grad.status()
// ============================================================
const GRAD_O = { GetTable: 0x3770d0, GetGradient: 0x39130c, SetTextWithGradient: 0x95dec, NameColorsTable: 43 };
const Grad = (() => {
    const S = { hooked: false, hits: 0, applied: 0, first: 0, lastErr: 0, list: null, err: "" };
    let getTable = null, getGradient = null;
    // iOS: Lesen von unmapped Speicher loest eine (langsame) CPU-Exception aus -> nur plausible User-Space-Zeiger dereferenzieren
    const plausible = (p) => {
        try {
            if (p.isNull())
                return false;
            const h = p.shr(32).toInt32();
            return h >= 1 && h <= 15 && p.and(7).toInt32() === 0;
        }
        catch (_) {
            return false;
        }
    };
    function entries() {
        if (S.list && S.list.length)
            return S.list;
        if (!getTable || !getGradient)
            return [];
        const tbl = getTable(GRAD_O.NameColorsTable);
        if (!plausible(tbl))
            return [];
        const vt = tbl.readPointer();
        if (!plausible(vt))
            return [];
        const count = new NativeFunction(vt.add(0x20).readPointer(), "int", ["pointer"])(tbl);
        if (count < 1 || count > 4096)
            return [];
        const itemAt = new NativeFunction(vt.add(0x28).readPointer(), "pointer", ["pointer", "int"]);
        const out = [];
        for (let i = 0; i < count; i++) {
            const d = itemAt(tbl, i);
            if (!plausible(d))
                continue;
            const g = getGradient(d);
            if (plausible(g))
                out.push({ row: i, g });
        }
        S.list = out;
        log("[Gradient] " + count + " Name-Farben, " + out.length + " mit Gradient");
        return out;
    }
    function install() {
        if (S.hooked)
            return true;
        try {
            getTable = new NativeFunction(base.add(GRAD_O.GetTable), "pointer", ["int"]);
            getGradient = new NativeFunction(base.add(GRAD_O.GetGradient), "pointer", ["pointer"]);
            Interceptor.attach(base.add(GRAD_O.SetTextWithGradient), {
                onEnter(args) {
                    S.hits++;
                    if (!PH.on.gradient)
                        return;
                    try {
                        const g = entries();
                        if (!g.length) {
                            if (S.first++ < 2)
                                log("[Gradient] Hook laeuft, aber name_colors hat keine (lesbaren) Gradient-Zeilen");
                            return;
                        }
                        args[2] = g[(PH.idx.grad | 0) % g.length].g;
                        S.applied++;
                    }
                    catch (e) {
                        S.err = String((e && e.stack) || e);
                        if (Date.now() - S.lastErr > 5000) {
                            S.lastErr = Date.now();
                            log("[Gradient] Hook-Fehler:", S.err);
                        }
                    }
                },
            });
            S.hooked = true;
            log("[Gradient] Hook @ 0x" + GRAD_O.SetTextWithGradient.toString(16) + " aktiv");
        }
        catch (e) {
            log("[Gradient] Installation fehlgeschlagen:", e);
        }
        return S.hooked;
    }
    return {
        state: S, install,
        count: () => { try {
            return entries().length;
        }
        catch (_) {
            return 0;
        } },
        enable(on) { PH.on.gradient = on === undefined ? !PH.on.gradient : !!on; log("[Gradient]", PH.on.gradient ? "AN" : "AUS"); },
        set(n) { PH.idx.grad = Math.max(0, n | 0); log("[Gradient] Index", PH.idx.grad); },
        status() { log("[Gradient] Hook:", S.hooked, "| an:", !!PH.on.gradient, "| Index:", PH.idx.grad | 0, "| Zeilen mit Gradient:", S.list ? S.list.length : "?", "| Hook-Aufrufe:", S.hits, "| angewendet:", S.applied); },
        dump() { try {
            log("[Gradient] an:", !!PH.on.gradient, "Index:", PH.idx.grad | 0, "Zeilen:", JSON.stringify(entries().map((e) => e.row)));
        }
        catch (e) {
            log("[Gradient] dump Fehler:", e);
        } },
    };
})();
Grad.install();
// ============================================================
//  Spinner  (iOS-Port aus neuerdodge.js, baut auf der Dodge-Engine auf)
//  Laeuft im Kreis um einen Anker (Position beim Start). Tempo = Drehgeschwindigkeit, Radius in Einheiten (300 = 1 Tile),
//  Steps = wie viele Move-Inputs (50 ms) ein Punkt gehalten wird. "While moving": dreht auch, waehrend du selbst steuerst;
//  sonst pausiert der Spinner, solange du den Joystick haeltst. Autododge hat Vorrang, solange es ausweicht.
//  Nutzt nur bereits verifizierte Funktionen: FrameHook 0x223ea8, AddInput 0x1db228 (Typ 2 = Move, x +8, y +0xc), sendMove.
//  Menue-Werte: spin_ON | spin_MOVE | spin_SPEED (30) | spin_RADIUS (100) | spin_STEPS (4)
//  Konsole: dbg.spinner.toggle() | dbg.spinner.dump()
// ============================================================
const Spinner = (() => {
    const X = Dodge.x;
    const O = { FrameHook: Dodge.offsets.FrameHook, AddInput: Dodge.offsets.AddInput, CI_type: 0x4, CI_x: 0x8, CI_y: 0xc, MOVE_TYPE: 2, SEND_MS: 50 };
    const SP = { enabled: false, errors: 0, lastError: "", ang: 0, hold: 0, anchor: null, userT: 0, userL: 0, ux: 0, uy: 0, hooked: false, sent: 0, lastTick: 0 };
    const val = (k, d) => phGet("spin_" + k, d);
    // einmal auf die aktuelle Position "stehen bleiben", damit Client und Server uebereinstimmen
    function stopMove() {
        try {
            const bl = X.battleLogic();
            if (!bl)
                return;
            const o = X.ownCharOf(bl.l);
            if (!o || o.isNull())
                return;
            const m = X.posOf(o);
            X.sendMove(bl.b, bl.l, m.x, m.y, true);
        }
        catch (_) { /* nicht im Kampf */ }
    }
    // beobachtet NUR deine Move-Inputs (eigene sind ueber X.st.sending markiert)
    function onInput(args) {
        try {
            if (!SP.enabled || X.st.sending)
                return;
            const ci = args[1];
            if (!X.safe(ci) || ci.add(O.CI_type).readS32() !== O.MOVE_TYPE)
                return;
            const bl = X.battleLogic();
            if (!bl)
                return;
            const own = X.ownCharOf(bl.l);
            if (!own || own.isNull())
                return;
            const m = X.posOf(own);
            const dx = ci.add(O.CI_x).readS32() - m.x, dy = ci.add(O.CI_y).readS32() - m.y, l = Math.hypot(dx, dy);
            SP.userT = Date.now();
            SP.userL = l;
            if (l >= 20) {
                SP.ux = dx / l;
                SP.uy = dy / l;
            }
        }
        catch (_) { /* ignorieren */ }
    }
    function frameInner() {
        const want = !!PH.on.spin_ON;
        if (want !== SP.enabled) {
            SP.enabled = want;
            SP.errors = 0;
            SP.anchor = null;
            SP.hold = 0;
            if (!want)
                stopMove();
            log("[Spinner]", want ? "ON" : "OFF");
        }
        if (!SP.enabled || !X.st.ready)
            return;
        const bl = X.battleLogic();
        if (!bl) {
            SP.anchor = null;
            return;
        }
        const own = X.ownCharOf(bl.l);
        if (!own || own.isNull())
            return;
        if (X.st.enabled && X.st.heading) {
            SP.anchor = null;
            return;
        } // Autododge weicht gerade aus -> nicht stoeren
        const now = Date.now();
        const userMoving = now - SP.userT < 160 && SP.userL >= 20;
        if (userMoving && !PH.on.spin_MOVE) {
            SP.anchor = null;
            return;
        } // du steuerst selbst -> Spinner pausiert
        if (now - SP.lastTick < O.SEND_MS)
            return;
        const me = X.posOf(own), R = val("RADIUS", 100);
        let cx, cy;
        if (userMoving) {
            cx = me.x + SP.ux * R;
            cy = me.y + SP.uy * R;
            SP.anchor = null;
        }
        else {
            if (!SP.anchor)
                SP.anchor = { x: me.x, y: me.y };
            cx = SP.anchor.x;
            cy = SP.anchor.y;
        }
        if (SP.hold <= 0) {
            SP.ang += (6 + val("SPEED", 30) * 1.14) * Math.PI / 180; // 6 .. 120 Grad pro Punkt
            if (SP.ang > Math.PI * 2)
                SP.ang -= Math.PI * 2;
            SP.hold = Math.max(1, val("STEPS", 4) | 0);
        }
        if (X.sendMove(bl.b, bl.l, Math.round(cx + Math.cos(SP.ang) * R), Math.round(cy + Math.sin(SP.ang) * R), false)) {
            SP.lastTick = now;
            SP.hold--;
            SP.sent++;
        }
    }
    function frame() {
        if (!PH.on.spin_ON && !SP.enabled)
            return; // schneller Ausstieg, solange aus
        try {
            frameInner();
        }
        catch (e) {
            SP.errors++;
            SP.lastError = String((e && e.stack) || e);
            if (SP.errors <= 3)
                log("[Spinner] Fehler #" + SP.errors + ":", SP.lastError);
            if (SP.errors >= 10) {
                SP.enabled = false;
                PH.on.spin_ON = false;
                log("[Spinner] wegen Fehlern abgeschaltet -> dbg.spinner.state.lastError");
            }
        }
    }
    function install() {
        if (SP.hooked)
            return true;
        try {
            Interceptor.attach(base.add(O.FrameHook), { onEnter() { frame(); } });
            Interceptor.attach(base.add(O.AddInput), { onEnter(args) { onInput(args); } });
            SP.hooked = true;
            log("[Spinner] bereit (iOS) - Menue: Combat > Spinner | Konsole: dbg.spinner.toggle() / dump()");
        }
        catch (e) {
            log("[Spinner] Hook fehlgeschlagen:", e);
        }
        return SP.hooked;
    }
    install();
    return {
        state: SP, install,
        toggle() { PH.on.spin_ON = !PH.on.spin_ON; return !!PH.on.spin_ON; },
        dump() { log("[Spinner] an:", SP.enabled, "| gesendet:", SP.sent, "| Tempo:", val("SPEED", 30), "Radius:", val("RADIUS", 100), "Steps:", val("STEPS", 4), "While moving:", !!PH.on.spin_MOVE, "| Fehler:", SP.errors, SP.lastError || ""); },
    };
})();
// ============================================================
//  Chat Spam  (iOS-Port aus neuerdodge.js, ChatSpam)
//  Statisch aus "laser" (echter Team-Chat-Sender, GameRoom-Klasse, 0xd231c..0xd24dc):
//    msg = operator new(0xa0)            0xe0095c
//    TeamChatMessage ctor(msg)           0x3fb28c
//    String::operator=(msg+0x90, text)   0xdcfd88   (Text: String per ctor 0xdcfacc, danach Dtor 0xdcf888)
//    inst = *(base+0x11828d8) (MessageManager);  (*(*inst + 0x18))(inst, msg)
//  Laeuft auf dem Game-Thread (setXY-Hook = laeuft staendig, auch in der Lobby, nicht nur im Kampf). Zeitsteuerung: spam_ms.
//  Menue: Chat > Spam | spam_ms (10..600 ms) | Button "Text: ..." (naechste Team-Chat-Nachricht wird der Spam-Text)
//  Konsole: dbg.spam.say("text") | dbg.spam.setText("text") | dbg.spam.toggle() | dbg.spam.dump()
// ============================================================
const CHAT_GLOBAL_OFF = 0x11828d8; // MessageManager-Global (siehe TagTools CHAT_O)
const ChatSpam = (() => {
    const C = { OpNew: 0xe0095c, Ctor: 0x3fb28c, StrAssign: 0xdcfd88, StrDtor: 0xdcf888, MgrGlobal: CHAT_GLOBAL_OFF, SendSlot: 0x18, MsgSize: 0xa0, TextOff: 0x90 };
    const st = { text: "hi", ready: false, sent: 0, last: 0, errors: 0, lastError: "", busy: false, hooked: false, waiting: false };
    let newMem = null, ctor = null, strAssign = null, strDtor = null;
    const tmp = Memory.alloc(0x20);
    try {
        newMem = new NativeFunction(F(C.OpNew), "pointer", ["size_t"]);
        ctor = new NativeFunction(F(C.Ctor), "pointer", ["pointer"]);
        strAssign = new NativeFunction(F(C.StrAssign), "pointer", ["pointer", "pointer"]);
        strDtor = new NativeFunction(F(C.StrDtor), "void", ["pointer"]);
        st.ready = true;
    }
    catch (e) {
        log("[Spam] init fehlgeschlagen:", e);
    }
    // NUR auf dem Game-Thread aufrufen (setXY-Hook / Button-Handler)
    function sendNow(text) {
        if (!st.ready)
            return false;
        const inst = F(C.MgrGlobal).readPointer();
        if (inst.isNull())
            return false; // noch kein MessageManager (nicht eingeloggt)
        const vt = inst.readPointer();
        if (vt.isNull())
            return false;
        const fn = new NativeFunction(vt.add(C.SendSlot).readPointer(), "void", ["pointer", "pointer"]);
        const msg = newMem(C.MsgSize);
        if (msg.isNull())
            return false;
        ctor(msg);
        tmp.writeByteArray(new Uint8Array(0x20).buffer);
        const cs = Memory.allocUtf8String(String(text));
        stringCtor(tmp, cs);
        strAssign(msg.add(C.TextOff), tmp);
        strDtor(tmp);
        fn(inst, msg); // der MessageManager uebernimmt die Nachricht
        st.sent++;
        return true;
    }
    function tickSpam() {
        if (!PH.on.spam || st.busy)
            return;
        const now = Date.now(), gap = Math.max(10, phGet("spam_ms", 100));
        if (now - st.last < gap)
            return;
        st.last = now;
        st.busy = true;
        try {
            sendNow(st.text);
        }
        catch (e) {
            st.errors++;
            st.lastError = String((e && e.stack) || e);
            if (st.errors <= 3)
                log("[Spam] Fehler #" + st.errors + ":", st.lastError);
            if (st.errors >= 5) {
                PH.on.spam = false;
                log("[Spam] wegen Fehlern abgeschaltet -> dbg.spam.state.lastError");
            }
        }
        finally {
            st.busy = false;
        }
    }
    function install() {
        if (st.hooked || !st.ready)
            return;
        try {
            Interceptor.attach(F(O.SetXY), { onEnter() { tickSpam(); } });
            st.hooked = true;
            log("[Spam] bereit (setXY-Frame-Hook) - Menue: Chat > Spam");
        }
        catch (e) {
            log("[Spam] Hook fehlgeschlagen:", e);
        }
    }
    install();
    function setText(t) { st.text = String(t).slice(0, 200); st.waiting = false; log("[Spam] Text =", st.text); try {
        uiRefresh();
    }
    catch (_) { /* Menue evtl. zu */ } }
    return {
        state: st, sendNow,
        setText,
        // Button: die naechste Team-Chat-Nachricht wird der Spam-Text (nochmal druecken = abbrechen)
        askText() {
            if (st.waiting) {
                st.waiting = false;
                TagTools.chat.askText(null);
                return;
            }
            st.waiting = true;
            TagTools.chat.askText((t) => setText(t));
        },
        say(t) { try {
            return sendNow(t === undefined ? st.text : String(t));
        }
        catch (e) {
            log("[Spam] say Fehler:", e);
            return false;
        } },
        toggle() { PH.on.spam = !PH.on.spam; return !!PH.on.spam; },
        dump() { log("[Spam] an:", !!PH.on.spam, "| Text:", st.text, "| Abstand:", phGet("spam_ms", 100) + "ms", "| gesendet:", st.sent, "| Fehler:", st.errors, st.lastError || ""); },
    };
})();
// ============================================================
//  Name Changer  (Menue: Other > Name Changer)  -  NUR VISUELL, nur du siehst den Namen. Es wird NICHTS an den Server gesendet.
//  Funktionsweise: jeder Text, der beim Aufbau von Textfeldern gesetzt wird und deinen ECHTEN Namen enthaelt, wird durch den
//  Wunsch-Namen ersetzt (Lobby, Profil, Team, Freunde, Kampf, Chat ...).
//  Hooks (RVAs, aus "laser"):  TextField::setText 0xbef364 (this, GameString*)  und  setTextWithGradient 0x95dec (this, GameString*, grad)
//  -> der String-Parameter (args[1]) wird durch einen eigenen Game-String ersetzt; setText kopiert den Text, das ist sicher.
//  Game-String: Laenge @+4, Daten inline @+8 (len < 8) sonst Zeiger @+8.
//  Eingabe: "Original per Chat" = dein echter Name (wie er im Spiel steht), "Name per Chat" = der Name, den nur du sehen sollst.
//  Beides: Button druecken, dann den Namen in den Team-Chat schreiben (wie bei Spam-Text / Tag).
//  Namen werden nur beim Aufbau eines Screens gesetzt -> nach dem Einschalten/Aendern Screen neu oeffnen (z.B. Lobby verlassen).
//  Grenze: andere Spieler mit exakt demselben Namen werden ebenfalls ersetzt.
//  Konsole: dbg.name.setReal("Echter Name") | setFake("Neuer Name") | ask("real"|"fake") | dump()
// ============================================================
const NameChanger = (() => {
    const st = { real: "", fake: "", realBytes: 0, hooked: false, hits: 0, replaced: 0, errors: 0, lastError: "", lastErr: 0 };
    let myCb = null;
    const nlog = (...a) => log("[Name]", ...a);
    const toast = (t) => { try {
        TagTools.chat.toast(t);
    }
    catch (_) { /* egal */ } };
    const isOn = () => phOn("namechg");
    const byteLen = (s) => {
        let n = 0;
        for (const ch of s) {
            const c = ch.codePointAt(0);
            n += c < 0x80 ? 1 : c < 0x800 ? 2 : c < 0x10000 ? 3 : 4;
        }
        return n;
    };
    const clean = (t) => Array.from(String(t).replace(/[\r\n\t]+/g, " ").trim()).slice(0, 60).join("");
    function readStr(sp, minLen) {
        try {
            if (sp.isNull())
                return null;
            const len = sp.add(4).readS32();
            if (len < minLen || len > 512)
                return null;
            const data = len < 8 ? sp.add(8) : sp.add(8).readPointer();
            return data.readUtf8String(len);
        }
        catch (_) {
            return null;
        }
    }
    function swap(args) {
        if (!st.real || !st.fake || !isOn())
            return;
        st.hits++;
        try {
            const text = readStr(args[1], st.realBytes);
            if (text === null || text.indexOf(st.real) < 0)
                return;
            if (st.fake.indexOf(st.real) >= 0 && text.indexOf(st.fake) >= 0)
                return; // schon ersetzt (Fake enthaelt den echten Namen)
            args[1] = strC(text.split(st.real).join(st.fake));
            st.replaced++;
        }
        catch (e) {
            st.errors++;
            st.lastError = String((e && e.stack) || e);
            if (Date.now() - st.lastErr > 5000) {
                st.lastErr = Date.now();
                nlog("Hook-Fehler:", st.lastError);
            }
        }
    }
    function install() {
        if (st.hooked)
            return;
        try {
            Interceptor.attach(F(O.SetText), { onEnter(args) { swap(args); } });
            Interceptor.attach(F(GRAD_O.SetTextWithGradient), { onEnter(args) { swap(args); } });
            st.hooked = true;
            nlog("bereit (nur visuell) - Menue: Other > Name Changer");
        }
        catch (e) {
            nlog("Hook fehlgeschlagen:", e);
        }
    }
    install();
    const refresh = () => { try {
        uiRefresh();
    }
    catch (_) { /* Menue evtl. zu */ } };
    function setReal(t) {
        const n = clean(t);
        if (!n) {
            toast("Ungueltiger Name");
            return false;
        }
        st.real = n;
        st.realBytes = byteLen(n);
        nlog("Echter Name gesetzt:", n);
        toast("Original-Name gesetzt");
        refresh();
        return true;
    }
    function setFake(t) {
        const n = clean(t);
        if (!n) {
            toast("Ungueltiger Name");
            return false;
        }
        st.fake = n;
        nlog("Wunsch-Name:", n);
        toast("Name gesetzt - Screen neu oeffnen");
        refresh();
        return true;
    }
    const waiting = () => !!myCb && TagTools.chat.state.textCb === myCb;
    return {
        state: st, setReal, setFake, waiting,
        // Button: der naechste Team-Chat-Text wird der echte Name ("real") bzw. der Wunsch-Name ("fake"); nochmal druecken = abbrechen
        ask(kind) {
            if (waiting()) {
                TagTools.chat.askText(null);
                myCb = null;
                return;
            }
            ChatSpam.state.waiting = false; // beide teilen sich den Chat-Hook -> Spam-Text-Wartezustand beenden
            myCb = (t) => { myCb = null; if (kind === "real")
                setReal(t);
            else
                setFake(t); };
            TagTools.chat.askText(myCb, kind === "real" ? "Echten Namen in den Team-Chat schreiben" : "Neuen Namen in den Team-Chat schreiben");
        },
        dump() { nlog("an:", isOn(), "| echt:", st.real || "-", "| Wunsch:", st.fake || "-", "| Hook:", st.hooked, "| geprueft:", st.hits, "| ersetzt:", st.replaced, "| Fehler:", st.errors, st.lastError || ""); },
    };
})();
// ============================================================
//  Theme Changer  (iOS-Port aus combined_mod_merged: Gene Brawl HomeScreen.replaceTheme, inkl. Theme-Musik)
//  LIVE: das Theme wechselt sofort in der Lobby, kein Neustart noetig. Auswahl wird gespeichert (THEME_SAVED.name) und beim
//  naechsten Lobby-Aufbau automatisch wieder gesetzt. Offsets statisch per Disassembly von "laser" gefunden (RVA):
//    HomeScreen-Theme-Funktion   0x231ba4  (this = HomeScreen; enthaelt "HomeScreen::enter - active theme sc file doesn't exist!")
//    HomeScreen + 0x720          LogicThemeData* (aktives Theme)   | HomeScreen + 0x6b0  MovieClip* (Theme-Hintergrund)
//    LogicThemeData              isDisabled 0x3ab1f8 | getFileName 0x3ab208 | getExportName 0x3ab218 | getMusic 0x3ab268 (Feld +0x58)
//                                LogicData::getName 0x3742bc
//    ResourceManager-Clip        0x31d50c  (String* file, String* export) -> MovieClip   (genau der Aufruf des Spiels @0x231fe4)
//    Asset existiert?            0xb89428  (String* file, 0) -> bool   (Pruefung des Spiels @0x231e20, sonst "sc file doesn't exist!")
//    Sprite::addChildAt          0xbd2bf4  (parent, child, index)
//    Kind entfernen              parent->vtable[0xf8](parent, child+0x40)  (removeChildAt, so ruft es addChildAt selbst beim Umhaengen)
//    HomeScreen::calculateThemeScale 0x2343ac
//    GameMain::getInstance 0x4eb0, +0xf0 = Home-Sprite (Theme-Clip sitzt auf Kindindex 0)
//    Theme-Tabelle (Klasse 41)   Zeiger im Global 0x114d700 (wie getThemeByName 0x37cfc8); Vtable-Slot 4 = Anzahl, 5 = Eintrag(index)
//    Musik: SoundManager* im Global 0x1182c90 | playMusic 0x30b3b8 (this, musicData) | getMenuMusic 0x37c5cc (Fallback)
//  Nicht eingebaut: Toast-Einblendung (ShowFloater auf iOS nicht gesucht) -> Meldungen nur im Log.
//  Konsole: dbg.theme.step(1) | server() | reapply() | list() | dump()
// ============================================================
const THEME_O = {
    HomeScreenInit: 0x231ba4, ThemeData: 0x720, ThemeClip: 0x6b0, CalcScale: 0x2343ac,
    IsDisabled: 0x3ab1f8, GetFileName: 0x3ab208, GetExportName: 0x3ab218, GetName: 0x3742bc,
    MakeClip: 0x31d50c, AssetExists: 0xb89428, GameMainGet: 0x4eb0, HomeSprite: 0xf0, ThemeTable: 0x114d700,
    AddChildAt: 0xbd2bf4, ParentOff: 0x38, ChildIndex: 0x40, VtRemoveAt: 0xf8,
    VSlotCount: 4, VSlotItemAt: 5,
    SoundMgr: 0x1182c90, PlayMusic: 0x30b3b8, GetMusic: 0x3ab268, MenuMusic: 0x37c5cc,
};
const Theme = (() => {
    const O = THEME_O;
    const IMG_END = 0x13f8000; // Ende des Mach-O-Images (RVA), siehe Aura
    const inImg = (p) => { try {
        return p.compare(base) >= 0 && p.compare(base.add(IMG_END)) < 0;
    }
    catch (_) {
        return false;
    } };
    const tlog = (...a) => console.log("[DEBUG-iOS]", ...a);
    const st = {
        ready: false, hooked: false, hs: ptr(0), serverData: ptr(0), applied: 0, errors: 0, lastError: "",
        get name() { return THEME_SAVED.name; }, set name(v) { THEME_SAVED.name = v; },
    };
    let gmGet = null, isDis = null, getFile = null, getExp = null, getNm = null;
    let makeClip = null, calcScale = null, addAt = null, assetExists = null;
    let playMusic = null, getMusic = null, menuMusic = null;
    let cache = null;
    try {
        gmGet = new NativeFunction(base.add(O.GameMainGet), "pointer", []);
        isDis = new NativeFunction(base.add(O.IsDisabled), "int", ["pointer"]);
        getFile = new NativeFunction(base.add(O.GetFileName), "pointer", ["pointer"]);
        getExp = new NativeFunction(base.add(O.GetExportName), "pointer", ["pointer"]);
        getNm = new NativeFunction(base.add(O.GetName), "pointer", ["pointer"]);
        makeClip = new NativeFunction(base.add(O.MakeClip), "pointer", ["pointer", "pointer"]);
        calcScale = new NativeFunction(base.add(O.CalcScale), "void", ["pointer"]);
        addAt = new NativeFunction(base.add(O.AddChildAt), "void", ["pointer", "pointer", "int"]);
        assetExists = new NativeFunction(base.add(O.AssetExists), "int", ["pointer", "int"]);
        st.ready = true;
    }
    catch (e) {
        tlog("[Theme] init failed:", String(e));
    }
    try {
        playMusic = new NativeFunction(base.add(O.PlayMusic), "void", ["pointer", "pointer"]);
        getMusic = new NativeFunction(base.add(O.GetMusic), "pointer", ["pointer"]);
        menuMusic = new NativeFunction(base.add(O.MenuMusic), "pointer", []);
    }
    catch (e) {
        tlog("[Theme] music init failed:", String(e));
    }
    const vfn = (obj, off, ret, args) => new NativeFunction(obj.readPointer().add(off).readPointer(), ret, args);
    // Spiel-String: Laenge @+4, Text inline @+8 wenn Laenge < 8, sonst Zeiger @+8
    function readGameString(sp) {
        try {
            if (!sp || sp.isNull())
                return "";
            const len = sp.add(4).readU32();
            if (len === 0 || len > 512)
                return "";
            const p = len < 8 ? sp.add(8) : sp.add(8).readPointer();
            return p.isNull() ? "" : (p.readUtf8String(len) || "");
        }
        catch (_) {
            return "";
        }
    }
    // Theme-Musik wie das Spiel: eigene Musik des Themes, sonst Menue-Musik
    function playThemeMusic(d) {
        if (!playMusic)
            return;
        try {
            const sm = base.add(O.SoundMgr).readPointer();
            if (sm.isNull())
                return;
            let m = (d && !d.isNull()) ? getMusic(d) : ptr(0);
            if (m.isNull())
                m = menuMusic();
            if (!m.isNull())
                playMusic(sm, m);
        }
        catch (e) {
            tlog("[Theme] music failed:", String(e));
        }
    }
    function fileOk(fileS) {
        try {
            return !assetExists || (assetExists(fileS, 0) & 1) === 1;
        }
        catch (_) {
            return false;
        }
    }
    // alle Themes, die nicht deaktiviert sind, Datei- + Exportnamen haben und deren Datei existiert
    function list() {
        if (!st.ready)
            return [];
        try {
            const t = base.add(O.ThemeTable).readPointer();
            if (t.isNull())
                return [];
            const count = vfn(t, O.VSlotCount * 8, "int", ["pointer"])(t);
            if (count <= 0 || count > 1000)
                return [];
            if (cache && cache.t.equals(t) && cache.n === count)
                return cache.items;
            const itemAt = vfn(t, O.VSlotItemAt * 8, "pointer", ["pointer", "int"]);
            const items = [];
            for (let i = 0; i < count; i++) {
                try {
                    const d = itemAt(t, i);
                    if (d.isNull() || (isDis(d) & 1))
                        continue;
                    if (!readGameString(getFile(d)) || !readGameString(getExp(d)))
                        continue;
                    if (!fileOk(getFile(d)))
                        continue; // sc-Datei fehlt -> Laden wuerde abstuerzen/haengen
                    items.push({ i, d, name: readGameString(getNm(d)) || ("Theme " + i) });
                }
                catch (_) { /* Eintrag ueberspringen */ }
            }
            cache = { t, n: count, items };
            tlog("[Theme] " + items.length + " von " + count + " Themes verfuegbar");
            return items;
        }
        catch (e) {
            tlog("[Theme] list failed:", String(e));
            return [];
        }
    }
    // HomeScreen lebt und die Lobby wird angezeigt (der Zeiger ist nur dort gueltig)
    function homeOk() {
        try {
            if (st.hs.isNull() || !inImg(st.hs.readPointer()))
                return false;
            const gm = gmGet();
            if (gm.isNull())
                return false;
            const sprite = gm.add(O.HomeSprite).readPointer();
            if (sprite.isNull())
                return false;
            const clip = st.hs.add(O.ThemeClip).readPointer();
            return clip.isNull() || clip.add(O.ParentOff).readPointer().equals(sprite);
        }
        catch (_) {
            return false;
        }
    }
    // altes Theme-Clip aus dem Home-Sprite nehmen (removeChildAt ueber die Vtable des Elternobjekts, wie das Spiel beim Umhaengen)
    function detach(clip) {
        const parent = clip.add(O.ParentOff).readPointer();
        if (parent.isNull())
            return;
        const idx = clip.add(O.ChildIndex).readS32();
        vfn(parent, O.VtRemoveAt, "pointer", ["pointer", "int"])(parent, idx);
    }
    // wie HomeScreen::replaceTheme (Gene Brawl), Schritte in der Reihenfolge des Spiel-Codes.
    // Alles Riskante (Datei pruefen, laden, Clip bauen) passiert VOR der ersten Aenderung am HomeScreen; schlaegt danach etwas fehl, wird zurueckgerollt.
    function apply(it, force) {
        if (!st.ready)
            return false;
        if (!force && !homeOk()) {
            tlog("[Theme] Erst die Lobby oeffnen (bzw. einmal neu betreten)");
            return false;
        }
        let stage = "start", detached = false, wrote = false, old = ptr(0), prevData = ptr(0), sprite = ptr(0);
        const hs = st.hs;
        try {
            const d = it.d;
            stage = "sprite";
            sprite = gmGet().add(O.HomeSprite).readPointer();
            if (sprite.isNull())
                return false;
            stage = "getFile";
            const fileS = getFile(d);
            stage = "getExport";
            const expS = getExp(d);
            stage = "exists";
            if (!fileOk(fileS)) {
                tlog("[Theme] sc-Datei existiert nicht:", it.name, readGameString(fileS));
                return false;
            }
            stage = "loadAsset";
            loadAsset(fileS, 0);
            stage = "makeClip";
            const clip = makeClip(fileS, expS);
            if (clip.isNull()) {
                tlog("[Theme] Clip nicht gefunden:", it.name);
                return false;
            }
            stage = "read";
            old = hs.add(O.ThemeClip).readPointer();
            prevData = hs.add(O.ThemeData).readPointer();
            stage = "detach";
            if (!old.isNull()) {
                detach(old);
                detached = true;
            }
            stage = "write";
            wrote = true;
            hs.add(O.ThemeData).writePointer(d);
            hs.add(O.ThemeClip).writePointer(clip);
            stage = "addChildAt";
            addAt(sprite, clip, 0);
            wrote = false;
            detached = false; // ab hier ist das neue Clip eingehaengt
            stage = "calcScale";
            calcScale(hs);
            stage = "music";
            playThemeMusic(d);
            st.applied++;
            return true;
        }
        catch (e) {
            st.errors++;
            st.lastError = "[" + stage + "] " + String((e && e.stack) || e);
            tlog("[Theme] apply failed bei Schritt '" + stage + "':", st.lastError);
            if (detached || wrote) { // altes Theme wiederherstellen, damit die Lobby nicht kaputt zurueckbleibt
                try {
                    hs.add(O.ThemeData).writePointer(prevData);
                    hs.add(O.ThemeClip).writePointer(old);
                    if (!old.isNull() && old.add(O.ParentOff).readPointer().isNull())
                        addAt(sprite, old, 0);
                    tlog("[Theme] altes Theme wiederhergestellt");
                }
                catch (e2) {
                    tlog("[Theme] Rollback fehlgeschlagen:", String(e2));
                }
            }
            return false;
        }
    }
    function select(it) {
        if (!apply(it, false))
            return false;
        st.name = it.name;
        tlog("[Theme] gesetzt:", it.name);
        return true;
    }
    function step(delta) {
        const items = list();
        if (!items.length) {
            tlog("[Theme] keine Themes gefunden (erst in die Lobby gehen)");
            return false;
        }
        const cur = items.findIndex((x) => x.name === st.name);
        const n = items.length;
        const pos = cur < 0 ? (delta > 0 ? delta - 1 : n + delta) : cur + delta;
        return select(items[((pos % n) + n) % n]);
    }
    function server() {
        if (!homeOk()) {
            tlog("[Theme] Erst die Lobby oeffnen (bzw. einmal neu betreten)");
            return false;
        }
        if (st.serverData.isNull()) {
            tlog("[Theme] Server-Theme unbekannt - Lobby einmal neu betreten");
            return false;
        }
        if (!apply({ d: st.serverData, name: "server" }, false))
            return false;
        st.name = "";
        tlog("[Theme] zurueck zum Server-Theme");
        return true;
    }
    function reapply() {
        if (!st.name)
            return server();
        const it = list().find((x) => x.name === st.name);
        return it ? select(it) : false;
    }
    function label() {
        if (!st.name)
            return "Server theme";
        const items = list();
        const pos = items.findIndex((x) => x.name === st.name);
        return (pos >= 0 ? (pos + 1) + "/" + items.length + "  " : "") + st.name;
    }
    // Das Spiel baut sein Theme bei jedem Lobby-Eintritt -> danach durch das gespeicherte ersetzen
    function install() {
        if (st.hooked || !st.ready)
            return;
        try {
            Interceptor.attach(base.add(O.HomeScreenInit), {
                onEnter(args) { this.hs = args[0]; },
                onLeave() {
                    try {
                        st.hs = this.hs;
                        st.serverData = st.hs.add(O.ThemeData).readPointer();
                        if (st.name) {
                            const it = list().find((x) => x.name === st.name);
                            if (it)
                                apply(it, true);
                            else
                                tlog("[Theme] gespeichertes Theme nicht gefunden:", st.name);
                        }
                    }
                    catch (e) {
                        st.errors++;
                        st.lastError = String((e && e.stack) || e);
                        tlog("[Theme] hook error:", st.lastError);
                    }
                },
            });
            // HomeScreen-Zeiger auch ohne Lobby-Neueintritt bekommen (calculateThemeScale laeuft z.B. bei Groessenaenderung)
            Interceptor.attach(base.add(O.CalcScale), {
                onEnter(args) { try {
                    if (st.hs.isNull() && inImg(args[0].readPointer()))
                        st.hs = args[0];
                }
                catch (_) { /* egal */ } },
            });
            st.hooked = true;
        }
        catch (e) {
            tlog("[Theme] hook failed:", String(e));
        }
    }
    install();
    tlog("[Theme] bereit (iOS, live) - Konsole: dbg.theme.step(1) / server() / list() / dump()");
    return {
        state: st, list, step, select, server, reapply, label,
        dump() {
            tlog("[Theme]", JSON.stringify({ ready: st.ready, hooked: st.hooked, name: st.name, applied: st.applied, errors: st.errors, lastError: st.lastError || "-",
                hs: String(st.hs), server: String(st.serverData), homeOk: homeOk(), themes: list().map((x) => x.name) }));
        },
    };
})();
// dbg arbeitet nur mit dem zuletzt erstellten Menue. Aeltere Menues gehoeren oft zu
// Screens, die schon freigegeben wurden -> Zugriff darauf kann das Spiel crashen.
globalThis.dbg = {
    show: () => current && current.show(),
    hide: () => current && current.hide(),
    add: (t, f) => current && current.add(t, f),
    // Diagnose: aktuelles Menue mit Position/Groesse ausgeben
    info: () => current ? log("current parent", current.parent, describe(current)) : log("noch kein Menue"),
    // Toggle-Position setzen, z.B. dbg.move(300, 300)
    move: (x, y) => current && current.toggle && setXY(current.toggle, x, y),
    // Zeigt, welcher Container wie viele Buttons bekommen hat (Lobby = die meisten)
    counts: () => addCounts.forEach((n, k) => log("parent", k, "Buttons:", n)),
    // Manuell einen Parent waehlen (Adresse aus dem Log), Erstellung beim naechsten Touch,
    // z.B. dbg.attach("0x10a79d200")
    attach: (addr) => { pending = ptr(addr); log("vorgemerkt:", pending); },
    // Hauptmenue (UI): geoeffnet wird es ueber den D-Button
    ui: {
        close: () => uiClose(),
        // Panel-Mitte verschieben, z.B. dbg.ui.move(500, 300)
        move: (cx, cy) => { UI.cx = cx; UI.cy = cy; uiApply(); },
        // Ursprung der Buttons: "center" oder "tl". Danach D zweimal druecken (neu aufbauen).
        anchor: (m) => { UI.anchor = m; uiDrop(true); log("[UI] Anker:", m, "- D druecken zum Neuaufbau"); },
        // Hintergrund-Clip: true = Ursprung oben links, false = Mitte
        bgAnchor: (tl) => { UI.bgTL = tl; uiDrop(true); log("[UI] bgTL:", tl, "- D druecken zum Neuaufbau"); },
        rebuild: () => { uiDrop(true); log("[UI] zurueckgesetzt - D druecken"); },
        // Panel-Mitte neu bestimmen (hebt manuelle Position auf): dbg.ui.center()
        center: () => { UI.manualPos = false; const ok = uiAutoCenter(true); log("[UI] Mitte:", UI.cx, UI.cy, ok ? "(neu berechnet)" : "(Standard, keine Daten)"); },
        // Finger-Skalierung erzwingen, falls die Regler zu schnell/langsam laufen: dbg.ui.scale(1.5)
        scale: (n) => { UI.scale = Math.max(0.2, Math.min(10, +n || 1)); UI.cal = []; UI.calibrated = true; log("[UI] Skalierung:", UI.scale); uiAutoCenter(); },
        // Touch-Koordinaten loggen (zum Pruefen von Offsets/Skalierung)
        touchLog: (on) => { UI.touchLog = !!on; },
        // Versatz der Labels (falls Text verschoben sitzt), danach D zweimal druecken: dbg.ui.lbl(-165.5, 108.5)
        lbl: (ox, oy) => { UI.lblOx = ox; UI.lblOy = oy; uiDrop(true); log("[UI] Label-Versatz:", ox, oy, "- D druecken zum Neuaufbau"); },
        // Haekchen-Frames tauschen, falls AN/AUS vertauscht aussieht: dbg.ui.frames(1, 0)
        frames: (off, on) => { UI.frames = { off, on }; uiDrop(true); log("[UI] Frames off/on:", off, on, "- D druecken zum Neuaufbau"); },
        state: UI,
    },
    menus,
    // Guard: dbg.guard.check() zeigt Root-Zustand + Stimmen, dbg.guard.reset() erzwingt Neuaufbau
    guard: {
        check: () => log("[Guard] Root:", rootMenu ? rootMenu.parent : "-", "gesund:", rootHealthy(), "| Stimmen:", Array.from(votes.entries()).map(([k, v]) => k + "=" + v.n).join(" ") || "-"),
        reset: () => teardown("manuell"),
    },
    cfg: CFG,
    // Autododge: dbg.dodge.dump() | probe() | wallsDump() | verbose(true) | toggle() | setVtable(0x...)
    dodge: Dodge,
    // Kill Aura: dbg.aura.dump() | sniff(true) | probe() | shield() | fire() | verbose(true)
    aura: Aura,
    // Spinner: dbg.spinner.toggle() | dump()
    spinner: Spinner,
    // Name Gradient: dbg.grad.dump() | set(n) | enable(true/false) | status()
    grad: Grad,
    // Chat Spam: dbg.spam.say("text") | setText("text") | toggle() | dump()
    spam: ChatSpam,
    // Name Changer (nur visuell): dbg.name.setReal("Echter Name") | setFake("Neuer Name") | ask("real"|"fake") | dump()
    name: NameChanger,
    // HUD: dbg.hud.toggle() | text("...") | pos(x, y) | size(n)
    hud: HudApi,
    // Theme Changer: dbg.theme.list() | step(1) | server() | reapply() | dump()
    theme: Theme,
    // Spectate by Tag: dbg.spectate.setTag("#2PP") | now() | byId(hi, lo)     Profile by Tag: dbg.profile.(gleiche Funktionen)
    spectate: TagTools.spectate,
    profile: TagTools.profile,
    // Tag aus Team-Chat: dbg.chat.arm("spectate"|"profile") -> danach Tag in den Team-Chat schreiben
    chat: TagTools.chat,
    // Copy Tag: dbg.copyTag.toggle()
    copyTag: CopyTag,
    // Quick Access: dbg.qa.enable("aura", true) | dbg.qa.dump()   (wirkt beim naechsten Button-Druck bzw. sofort, falls auf dem Game-Thread)
    qa: {
        enable: (key, on) => {
            const d = QA.defs.find((x) => x.key === key);
            if (!d)
                return log("[QuickAccess] Keys:", QA.defs.map((x) => x.key).join(", "));
            PH.on[d.flag] = on === undefined ? !PH.on[d.flag] : !!on;
            log("[QuickAccess]", key, PH.on[d.flag] ? "AN" : "AUS", "- erscheint beim naechsten Button-Druck");
        },
        reset: () => { QA.fails = 0; log("[QuickAccess] Fehlerzaehler zurueckgesetzt"); },
        dump: () => log("[QuickAccess] an:", QA.defs.filter((d) => phOn(d.flag)).map((d) => d.key).join(",") || "-", "Buttons:", Object.keys(QA.b).join(",") || "-", "Pos:", JSON.stringify(QA.pos), "Fehler:", QA.fails),
    },
    // Edit Controls: dbg.edit.on(true/false) | dbg.edit.reset() | dbg.edit.dump()
    edit: {
        on: (v) => editOn(v === undefined ? !EDIT.on : !!v),
        reset: () => editReset(),
        dump: () => log("[Edit] an:", EDIT.on, "| QA:", JSON.stringify(QA.pos), "| D:", CFG.toggleX + "," + CFG.toggleY, "| Panel:", UI.cx + "," + UI.cy, UI.manualPos ? "(manuell)" : "(auto)", "| Skalierung:", editScale().toFixed(2), "| Moves:", EDIT.moves),
    },
};
log("bereit, base =", base, " – Debug-Button erscheint in der Lobby, sobald dort " + CFG.minAdds + " Buttons aufgebaut wurden");

})();

/******/ })()
;
//# sourceMappingURL=bundle.js.map