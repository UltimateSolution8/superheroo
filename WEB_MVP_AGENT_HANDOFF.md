# Superherooo Web MVP Handoff

## What Was Built
- Public Citizen/Partner web app is live at `https://www.superherooo.com/app/`.
- Web source is in `WebApp/` and the deployed static bundle is committed under `app/`.
- Website hero links to the web app and temporary APK release assets.
- Backend code is in the `superherooBackend` repo on `main`; see `WEB_MVP_AGENT_HANDOFF.md` there for backend/env details.

## Main Code Locations
- `WebApp/src/main.tsx`: routes, auth, Citizen task flow, Partner task flow, realtime listeners.
- `WebApp/src/api.ts`: backend API client.
- `WebApp/src/types.ts`: DTO types.
- `WebApp/src/styles.css`: web app UI styling.
- `app/`: built Vite bundle served under `/app`.
- `404.html`: static-host fallback for `/app/*` deep links.
- `nginx.conf`: container rewrite support for `/app/*`.

## End-To-End Test
1. Open `https://www.superherooo.com/app/`.
2. Sign up Citizen with email/password, send email OTP, verify OTP.
3. Create a Hyderabad-area instant task with Cash/UPI pay-after-service messaging.
4. In a second browser, sign up/login Partner, verify email, ensure that Partner KYC is approved in backend/admin data.
5. Partner goes online with browser geolocation and receives/sees nearby task.
6. Partner accepts; Citizen sees assigned status.
7. Partner marks ARRIVED, then starts with Citizen arrival OTP.
8. Partner completes with Citizen completion OTP; Citizen sees completed state.

## Test Credentials
- Do not commit or expose real passwords or service credentials.
- Web email/password test accounts should be created through `/app/signup`; OTP is delivered through MojoAuth.
- Existing reviewer/mobile phone OTP accounts are `9999999991` Buyer, `9999999992` Helper, and `9999999993` Mediator with OTP `123456`.
