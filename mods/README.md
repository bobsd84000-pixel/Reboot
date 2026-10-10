# Mods Claude Code

Prérequis : Claude Code 2.1.287 minimum (`claude update`).

## Installation (dans un terminal Claude Code)

```
/plugin install relais-sessions --marketplace bobsd84000-pixel/Reboot
/plugin install tableau-de-bord --marketplace bobsd84000-pixel/Reboot
/plugin install routage-haiku --marketplace bobsd84000-pixel/Reboot
```

Réponds `y` pour ajouter la marketplace, puis Entrée (scope utilisateur).

## 1. relais-sessions : plan ↔ build

- Session A : `/role plan` · Session B : `/role build`
- Dans « plan », demande : « envoie cette tâche au build ». Claude appelle `envoyer_au_build`.
- « build » reçoit la tâche toute seule. À la fin, il appelle `rapport_au_plan` et le compte rendu arrive dans « plan ».
- Les rôles sont notés dans `~/.claude/relais-sessions.json`.

## 2. tableau-de-bord

- S'ouvre au démarrage dans un panneau. `/tableau` le rouvre.
- Affiche les agents en cours, les tâches terminées aujourd'hui et les notes ajoutées aujourd'hui dans `~/notes` (fichiers modifiés depuis minuit).
- Se met à jour toutes les 5 s.

## 3. routage-haiku

- Les demandes courtes (300 caractères max) qui contiennent corrige / faute / renomme / reformule / résume partent vers `claude-haiku-5-5`.
- Si la demande contient bug, refactor, tests, sécurité, etc., elle reste sur le modèle principal (celui choisi avec `/model`, par ex. Sonnet 5.5).
- Après chaque réponse : une ligne « ↳ Répondu par … » plus la barre d'état. `/routage off` coupe l'affichage.

## Sécurité

Un mod a le même accès à ta machine que Claude Code. Lis le code dans `mods/` avant de l'installer.
