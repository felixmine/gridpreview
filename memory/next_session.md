---
name: Nächste Session – offene Aufgaben
description: Priorisierte To-dos für die nächste Arbeitssession an GridPreview
type: project
---

## Offene Aufgaben (Prio-Reihenfolge)

### 1. Snapping fixen
Modelle zentrieren sich auf die angeklickte Zelle, aber bei Multi-Zell-Bins (z.B. 2×4) sollte das Snapping auf die nächste Gitter-Ecke einrasten, nicht auf die Zellmitte. Für ein 2×4-Bin wäre das Ziel: die Bin-Ecke rastet an Gitter-Schnittpunkten ein, und der Klick wählt die nächste passende Ausrichtung.

**Warum:** Aktuell erscheint ein 2×4-Bin zentriert auf der geklickten Zelle, was dazu führt, dass es symmetrisch in Nachbarzellen hineinragt statt sauber ab einer Kante zu beginnen.

**Ansatz:**
- Footprint-Größe in Grid-Einheiten ermitteln: `ceil(footprintX / unitMm)` × `ceil(footprintY / unitMm)`
- Platzierungsposition auf nächste ganzzahlige Zellengruppe snappen
- `cellToWorld` so anpassen, dass Multi-Zell-Bins ab der Ecke der geklickten Zelle positioniert werden

### 2. 3MF-Zerlegung angehen
3MF-Dateien können mehrere Build-Items enthalten (Multi-Part). Der aktuelle Parser (`modelLoader.js → loadThreeMfMulti`) gibt bereits ein Array zurück (ein Eintrag pro Build-Item). Die Library zeigt diese als separate Einträge an.

**Was fehlt / zu prüfen:**
- Testen ob Multi-Part-3MF korrekt aufgeteilt wird (jedes Teil einzeln platzierbar)
- Naming-Bug: zweites Teil wird als `"basename · Part 2"` benannt — Trennzeichen `·` kollidiert falls Dateiname schon `·` enthält → saubereren Separator wählen (z.B. ` #2`)
- Prüfen ob Transform-Matrizen aus dem 3MF korrekt auf die Einzelteile angewendet werden (relative Positionen)
- Evtl. Option: gesamtes 3MF als ein Objekt importieren (zusammengeführtes Mesh) statt aufzuteilen
