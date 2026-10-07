#!/usr/bin/env python3
"""Note un prompt système : budget tokens + JSON valide + bonnes valeurs.
Usage : python evaluate.py --gen-dir runs/run_1/gen_1
"""
import argparse, json
from pathlib import Path

BUDGET_TOKENS = 120          # 120 pour LUMIK, 150 pour BulkDirect
CHARS_PAR_TOKEN = 3          # estimation prudente (français)
CLES = ["gravite", "action"]  # clés JSON obligatoires
CLES_A_COMPARER = ["gravite"] # champs qui doivent etre exacts (action = libre)


def trouver_submission(gen_dir: Path):
    d = gen_dir / "results"
    fichiers = list(d.glob("*.json")) if d.is_dir() else list(gen_dir.glob("submission*.json"))
    return max(fichiers, key=lambda p: p.stat().st_mtime) if fichiers else None


def evaluate(gen_dir: Path) -> dict:
    prive = Path(__file__).resolve().parent.parent / "private" / "reponses.json"
    attendu = {r["id"]: r["attendu"] for r in json.loads(prive.read_text(encoding="utf-8"))}
    sub_path = trouver_submission(gen_dir)
    res = {"total": len(attendu), "correct": 0, "json_invalide": 0, "manquant": 0,
           "tokens_estimes": None, "budget": BUDGET_TOKENS, "accuracy": 0.0}
    if not sub_path:
        res["erreur"] = "pas de submission"
        return res
    sub = json.loads(sub_path.read_text(encoding="utf-8"))
    prompt = sub.get("system_prompt", "")
    res["tokens_estimes"] = -(-len(prompt) // CHARS_PAR_TOKEN)
    if res["tokens_estimes"] > BUDGET_TOKENS:
        res["erreur"] = "prompt trop long -> score 0"
        return res
    sorties = {d["id"]: d.get("sortie", "") for d in sub.get("details", [])}
    for id_, exp in attendu.items():
        brut = sorties.get(id_)
        if brut is None:
            res["manquant"] += 1
            continue
        try:
            obj = json.loads(brut)
            assert isinstance(obj, dict) and all(k in obj for k in CLES)
        except Exception:
            res["json_invalide"] += 1
            continue
        if all(str(obj[k]).lower() == str(exp[k]).lower() for k in CLES_A_COMPARER):
            res["correct"] += 1
    res["accuracy"] = res["correct"] / res["total"]
    res["accuracy_percent"] = round(100 * res["accuracy"], 1)
    return res


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--gen-dir", required=True)
    a = ap.parse_args()
    r = evaluate(Path(a.gen_dir))
    out = Path(a.gen_dir) / "results.json"
    out.write_text(json.dumps(r, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps(r, ensure_ascii=False, indent=2))
