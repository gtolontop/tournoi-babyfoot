# Tournoi de baby-foot

Inscriptions et organisation d'un tournoi de baby-foot : un formulaire public pour s'inscrire, et un espace d'organisation pour gérer les équipes et le tableau.

## Fonctionnalités

- Formulaire d'inscription rapide, seul ou à deux
- Contact par Instagram, téléphone ou email
- Disponibilités en texte libre
- Espace d'organisation :
  - joueurs et équipes, avec formation automatique des équipes
  - tableau en élimination directe ou en championnat
  - saisie des scores, forfaits
  - absences et remplacements
  - QR code et affiche
  - liens d'accès protégés par mot de passe
- Tableau public

## Stack

- Node.js, Hono, TypeScript
- React + Vite pour l'espace d'organisation
- Un fichier JSON comme stockage

## Organisation du code

- `src/server` : le serveur Hono, l'API, les pages publiques rendues en TSX
- `src/admin` : l'espace d'organisation (React)
- `src/form` : le petit script du formulaire, mis en ligne dans la page
- `src/shared` : les types et la lecture des disponibilités (« mardi midi, jeudi après 17h »)

Développement : `npm run dev` (serveur) et `npm run dev:web` (espace d'organisation, http://localhost:5173/admin/).

## Lancer

```sh
npm install
npm run build
ADMIN_PASSWORD=... PUBLIC_URL=https://... npm start
```

Variables d'environnement :

| Variable         | Rôle                                         | Défaut           |
| ---------------- | -------------------------------------------- | ---------------- |
| `ADMIN_PASSWORD` | mot de passe de l'espace d'organisation      | généré et affiché au démarrage |
| `PUBLIC_URL`     | adresse publique (liens, QR code)            | `http://127.0.0.1:8110` |
| `PORT`           | port d'écoute                                | `8110`           |
| `HOST`           | interface d'écoute                           | `127.0.0.1`      |
| `DATA_FILE`      | chemin du fichier JSON de données            | `data/state.json` |

`ADMIN_PASSWORD` n'est lu qu'au premier démarrage, puis il est stocké haché dans le fichier de données.

## Police

L'interface peut utiliser la police Facade (`src/admin/public/fonts/facade.woff2`), qui n'est pas incluse dans ce dépôt car elle n'est pas sous licence libre. Elle est optionnelle : sans elle, l'interface utilise Inter (licence OFL, incluse).

## Licence

MIT. Voir aussi [THIRD_PARTY.md](THIRD_PARTY.md).
