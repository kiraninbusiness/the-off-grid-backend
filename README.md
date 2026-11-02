# the-off-grid-backend

The one shared backend API for **The Off Grid**. Both the website and the Android app call it.

| Part | Repository |
| --- | --- |
| Shared backend API | this repo (`server/`) |
| Website and admin panel | `The-Off-Grid` |
| Mobile app | `the-off-grid-mobile` |

Deploy: Render, root directory `server`, build `npm install`, start `npm start`.
Database: Neon (`DATABASE_URL`). Set `CLIENT_URL` and `CLIENT_URL_WWW` to the website's addresses.
