# kitmod fuer bundle.js (iOS-Binary "laser")

Gleiche Technik wie im Kit (QuickJS ohne JIT + statisches Hooking), jetzt fuer `bundle.js`.

## Was schon erledigt ist (auf Linux gebaut und geprueft)
- `laser_patched`: die 16 Hook-Stellen (`hooks.bundle.json`) sind gepatcht, Code-Signatur entfernt. Geprueft mit `tools/verify_patched.py`
  (Segmente, alle Linkedit-Daten byteweise identisch, nur die 16 Hook-Woerter geaendert, Caves/Slots korrekt).
- `tools/build_hooks.py` braucht kein lief/capstone mehr (lief hatte Export-Trie, Function-Starts und Signatur der Binary kaputtgeschrieben).
  Unterstuetzt jetzt auch `b`/`bl` als erste Instruktion (Chat-Hook 0xd246c sitzt mitten in einer Funktion).
- Laufzeit: `File` (new File(path,"w") / write / flush / close) und `this.context.x0..x8` ergaenzt. Selbsttests: 43 ok.
- `bundle.js` laeuft in der Laufzeit durch (alle Module "bereit", UI-Einstellungen werden gespeichert).

## Was du auf dem Mac machst
1. `cd dylib && make` (Xcode-Tools; erzeugt `kitmod.dylib` mit eingebettetem bundle.js; kitmod_gen.h / kitmod_tramp.S liegen schon bei)
2. `laser_patched` in die IPA als Haupt-Binary zurueckkopieren (Name wie im Original), `kitmod.dylib` per Sideloadly "Inject dylibs", signieren, installieren.
3. Log: `Documents/kitmod.log`

## Nicht geprueft (kein ARM-Compiler / kein Geraet hier)
- `make` und `kitmod_tramp.S` (ARM64-Assembler) wurden nicht assembliert. Fehlermeldungen von `make` bitte schicken.
- Verhalten auf dem Geraet (Menue, Hooks, Chat-Hook mit Funktionsmitte-Sprung).
- Binary muss genau die Version sein, auf die die Offsets im Bundle passen (die hochgeladene "laser" passt).
