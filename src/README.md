# Bausteine des Kartentischs

- `base-v1.html` – Grundversion
- `parts/` – Erweiterungen (Aussehen, Board, Bausteine, Supabase-Sync, Heptabase-Import …)
- `splice.py` – setzt Grundversion + Erweiterungen zu einer Datei zusammen:
  `python3 splice.py base-v1.html index.html` (Pfad `P` oben in der Datei anpassen)
- `build.py` – baut daraus das veröffentlichte Paket (index.html, Symbole, Manifest, Offline-Cache)
- `tests/` – Browser-Tests (Playwright) mit nachgebauter Supabase-Umgebung
