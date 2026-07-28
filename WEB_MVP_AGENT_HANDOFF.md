# Superherooo Web MVP Handoff

## What Was Built
- Public Citizen/Partner web app is live at `https://www.superherooo.com/app/`.
- Web source is in `WebApp/` and the deployed static bundle is committed under `app/`.
- Website landing CTAs now only point to the web app while app-store launch is pending.
- Backend code is in the `superherooBackend` repo on `main`; see `WEB_MVP_AGENT_HANDOFF.md` there for backend/env details.

## Main Code Locations
- `WebApp/src/main.tsx`: routes, auth, Citizen task flow, Partner task flow, realtime listeners, partner arrival/completion selfie capture.
- `WebApp/src/api.ts`: backend API client, including multipart task selfie upload.
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
7. Partner captures and uploads arrival selfie, then marks ARRIVED.
8. Partner starts with Citizen arrival OTP.
9. Partner captures and uploads completion selfie, then completes with Citizen completion OTP; Citizen sees completed state.

## Latest Live Smoke
- Production API host: `https://api.mysuperhero.xyz`.
- Backend server: `168.144.64.250`, systemd service `superheroo-api`, jar `/opt/superheroo/app.jar`.
- Verified task lifecycle on 2026-07-28 with task `464acbcf-e684-45eb-bb0e-701040909539`.
- Final state: `COMPLETED`, `PAY_AFTER_SERVICE`, `PHOTO_AND_OTP`, arrival selfie uploaded, completion selfie uploaded.

## Test Credentials
- Do not commit or expose real passwords or service credentials.
- Web email/password test accounts should be created through `/app/signup`; OTP is delivered through MojoAuth.
- Existing reviewer/mobile phone OTP accounts are `9999999991` Buyer, `9999999992` Helper, and `9999999993` Mediator with OTP `123456`.
