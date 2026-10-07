# Tâche : écrire le meilleur prompt système (LUMIK)

Tu dois écrire UN prompt système court pour un modèle Claude Haiku.
Ce prompt sera testé sur les exemples de `exemples.json`.

## Données
`exemples.json` : liste de `{"id": 1, "entree": "..."}`. Il n'y a PAS les réponses.

## Contraintes du prompt (OBLIGATOIRES)
- Maximum **120 tokens** (environ 360 caractères). Au-dessus : score 0.
- Le modèle doit répondre **uniquement en JSON valide**, avec exactement ces clés : `gravite`, `action`.
  (À adapter selon LUMIK.)

## Ce que ton agent doit faire
1. Écrire un prompt système (<= 120 tokens).
2. Pour chaque exemple, appeler `claude-haiku-4-5-20251001` avec ce prompt et l'entrée.
3. Sauver `results/submission.json` :
```json
{
  "system_prompt": "le prompt utilisé",
  "details": [{"id": 1, "sortie": "{\"gravite\": \"haute\", \"action\": \"...\"}"}]
}
```

## Objectif
Maximiser la part de réponses correctes (JSON valide + bonnes valeurs), prompt <= 120 tokens.
