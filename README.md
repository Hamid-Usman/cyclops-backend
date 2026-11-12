<p align="center">
  <a href="http://nestjs.com/" target="blank"><img src="https://nestjs.com/img/logo-small.svg" width="120" alt="Nest Logo" /></a>
</p>

[circleci-image]: https://img.shields.io/circleci/build/github/nestjs/nest/master?token=abc123def456
[circleci-url]: https://circleci.com/gh/nestjs/nest

  <p align="center">A progressive <a href="http://nodejs.org" target="_blank">Node.js</a> framework for building efficient and scalable server-side applications.</p>
    <p align="center">
<a href="https://www.npmjs.com/~nestjscore" target="_blank"><img src="https://img.shields.io/npm/v/@nestjs/core.svg" alt="NPM Version" /></a>
<a href="https://www.npmjs.com/~nestjscore" target="_blank"><img src="https://img.shields.io/npm/l/@nestjs/core.svg" alt="Package License" /></a>
<a href="https://www.npmjs.com/~nestjscore" target="_blank"><img src="https://img.shields.io/npm/dm/@nestjs/common.svg" alt="NPM Downloads" /></a>
<a href="https://circleci.com/gh/nestjs/nest" target="_blank"><img src="https://img.shields.io/circleci/build/github/nestjs/nest/master" alt="CircleCI" /></a>
<a href="https://discord.gg/G7Qnnhy" target="_blank"><img src="https://img.shields.io/badge/discord-online-brightgreen.svg" alt="Discord"/></a>
<a href="https://opencollective.com/nest#backer" target="_blank"><img src="https://opencollective.com/nest/backers/badge.svg" alt="Backers on Open Collective" /></a>
<a href="https://opencollective.com/nest#sponsor" target="_blank"><img src="https://opencollective.com/nest/sponsors/badge.svg" alt="Sponsors on Open Collective" /></a>
  <a href="https://paypal.me/kamilmysliwiec" target="_blank"><img src="https://img.shields.io/badge/Donate-PayPal-ff3f59.svg" alt="Donate us"/></a>
    <a href="https://opencollective.com/nest#sponsor"  target="_blank"><img src="https://img.shields.io/badge/Support%20us-Open%20Collective-41B883.svg" alt="Support us"></a>
  <a href="https://twitter.com/nestframework" target="_blank"><img src="https://img.shields.io/twitter/follow/nestframework.svg?style=social&label=Follow" alt="Follow us on Twitter"></a>
</p>
  <!--[![Backers on Open Collective](https://opencollective.com/nest/backers/badge.svg)](https://opencollective.com/nest#backer)
  [![Sponsors on Open Collective](https://opencollective.com/nest/sponsors/badge.svg)](https://opencollective.com/nest#sponsor)-->

## Description

[Nest](https://github.com/nestjs/nest) framework TypeScript starter repository.

## Project setup

```bash
$ npm install
```

## Compile and run the project

```bash
# development
$ npm run start

# watch mode
$ npm run start:dev

# production mode
$ npm run start:prod
```

## Run tests

```bash
# unit tests
$ npm run test

# e2e tests
$ npm run test:e2e

# test coverage
$ npm run test:cov
```

## Authentication

Authentication uses MySQL, scrypt password hashes, and one-hour JWT bearer
tokens. Create a MySQL database, copy `.env.example` to `.env`, set
`DATABASE_URL`, and replace `JWT_SECRET` with a random secret of at least 32
characters. The users-table migration runs automatically when the app starts;
schema synchronization is disabled.

Endpoints:

- `POST /auth/register` with `{ "email": "user@example.com", "password": "at-least-8-characters", "displayName": "User Name" }`
- `POST /auth/login` with `{ "email": "user@example.com", "password": "at-least-8-characters" }`
- `GET /auth/me` with `Authorization: Bearer <accessToken>`

Register and login return an `accessToken`, `tokenType`, `expiresIn`, and the
public user profile. Email addresses are case-insensitive, and duplicate
registrations return `409 Conflict`.

### Google sign-in

The frontend signs the user in with Google and sends the resulting Google ID
token to the API, which verifies it against Google's published keys and returns
the same response as `/auth/login`.

1. In the [Google Cloud console](https://console.cloud.google.com/apis/credentials),
   create an OAuth client ID of type "Web application" and add your frontend's
   origins (e.g. `http://localhost:5173`) as authorized JavaScript origins.
2. Set `GOOGLE_CLIENT_ID` in `.env` to that client id. For several clients
   (web, iOS, Android), separate their ids with commas. No client secret is
   needed. Without it, the Google endpoints answer `503`.
3. On the frontend, use [Google Identity Services](https://developers.google.com/identity/gsi/web)
   (web) or the Google Sign-In SDK (mobile) and post its ID token (`credential`).

Endpoints:

- `POST /auth/google` with `{ "idToken": "<Google ID token>" }` signs in, and
  creates the account on first sign-in (with no password).
- `POST /auth/google/link` with `{ "idToken": "..." }` and
  `Authorization: Bearer <accessToken>` links Google to an existing account.

Accounts are matched by Google's account id, never by email. If a password
account already uses the Google email, `/auth/google` answers `409`: the user
logs in with their password and links Google instead. This stops someone who
registered another person's email from taking over their Google sign-in.

## Workflow API

Every endpoint below needs `Authorization: Bearer <accessToken>`.

- **Clients** (`/client`): add an existing user as a client by `email` or
  `userId` (optional `status`: `lead`, `active`, `inactive`, `archived`), list,
  get, `PATCH /client/:id` with `{ "status": ... }`, delete.
  `GET /client/me` returns the signed-in user's own client record.
- **Projects** (`/projects`): create for a client, list (filter by `status`,
  `clientId`), get, edit, complete or cancel. New projects are inactive; a
  project becomes active only when its client accepts a proposal.
- **Proposals** (`/proposals`): the owner drafts a proposal for a client
  (`clientId`; the project is created when the client accepts) or for an
  existing inactive project (`projectId`), edits it, then
  `POST /proposals/:id/send` (all five sections must be filled in; totals and
  terms are locked) or `/withdraw`. An optional payment schedule,
  `milestones: [{ title, deliverables?, percent, dueDate? }]`, must add up to
  100% together with `depositPercent` when sent; without milestones, whatever
  the deposit leaves is billed as one balance. Responses include the
  `paymentSchedule` with each step's amount.
- **Generated projects**: accepting a proposal creates the project (name,
  description, deliverables, start date, due date from the last milestone or
  the estimated duration) and its milestones: the deposit, each milestone or
  the balance, priced so they add up exactly to the agreed total.
  `GET /projects/:id/milestones` lists them with their invoice, and
  `PATCH /projects/:id/milestones/:milestoneId` with `{ "completed": true }`
  marks one delivered.
- **Received proposals** (`/received-proposals`): the client's side. List the
  proposals sent to you, open one (marks it viewed), then
  `POST /received-proposals/:id/accept` with
  `{ "agreeToTerms": true, "signatureName": "Full Name" }` or
  `/decline` with an optional `{ "reason": "..." }`. Accepting activates the
  project and supersedes its other open proposals. Proposals past
  `validUntil` become expired.
- **Invoices** (`/invoices`): draft with line items for an active or completed
  project, edit, `send` (numbered `INV-0001`, ...; due in 14 days unless a due
  date is set), `mark-paid`, `void`. `GET /invoices?overdue=true` lists overdue
  ones. `POST /invoices/from-milestone` with `{ "milestoneId": "..." }` drafts
  the deposit or milestone invoice from the agreed terms (that share of the
  price after discount, with the agreed currency and tax rate). A milestone is
  billed once; voiding its invoice frees it again.
- **Dashboard** (`/dashboard`, `/dashboard/attention?days=14`): active
  clients, active projects, pending invoice totals per currency, and what is
  overdue or due soon. Cached per user for 30 seconds (Redis at `REDIS_URL`, or
  in memory without it).

Interactive API documentation is available at `/api/docs` when the app is
running. The generated OpenAPI JSON is available at `/api/docs-json`.

## Deployment

When you're ready to deploy your NestJS application to production, there are some key steps you can take to ensure it runs as efficiently as possible. Check out the [deployment documentation](https://docs.nestjs.com/deployment) for more information.

If you are looking for a cloud-based platform to deploy your NestJS application, check out [Mau](https://mau.nestjs.com), our official platform for deploying NestJS applications on AWS. Mau makes deployment straightforward and fast, requiring just a few simple steps:

```bash
$ npm install -g @nestjs/mau
$ mau deploy
```

With Mau, you can deploy your application in just a few clicks, allowing you to focus on building features rather than managing infrastructure.

## Observability

In production applications, observability is essential for understanding how your system behaves, detecting issues early, and maintaining reliable performance.

[NestJS Observe](https://observe.nestjs.com) automatically instruments your NestJS application, giving you deep visibility into your system with minimal setup:

- **Distributed tracing:** Follow requests across services and understand how they flow through your system.
- **Waterfall analysis:** Visualize request execution and identify slow operations, bottlenecks, and unexpected delays.
- **Performance analysis:** Analyze application performance in real time and quickly pinpoint areas that need optimization.
- **Metrics:** Track key application and infrastructure metrics to understand system health and performance trends.
- **Logging:** Centralize and correlate logs with traces and other telemetry to make debugging easier.
- **Error tracking:** Detect errors quickly and investigate their root causes with the surrounding context.
- **SLA monitoring:** Track service-level objectives and identify when your application is approaching or exceeding defined thresholds.
- **Alarms and alerts:** Set up alerts for critical errors, performance degradation, SLA violations, and other anomalies so your team can react quickly.

This project is already instrumented. To connect it, run this and approve the code it prints at [observe.nestjs.com/link](https://observe.nestjs.com/link) - signing up for free if you have no account:

```bash
$ npx @nestjs/observe link
```

It writes the app key and secret into `.env` and makes every `nest start` script (`start`, `start:dev`, `start:debug`) load it. In production, set `OBSERVE_APP_KEY` and `OBSERVE_APP_SECRET` in the environment instead.

Or do it by hand: create an application and an API key at [observe.nestjs.com](https://observe.nestjs.com), and set the pair as `OBSERVE_APP_KEY` and `OBSERVE_APP_SECRET` in the environment the app runs in.

The free plan needs no payment details and covers 300,000 events a month. You can also browse the [live demo](https://www.observe-demo.nestjs.com/dashboard) first - the whole dashboard over a busy service's data, with nothing to install.

## Resources

Check out a few resources that may come in handy when working with NestJS:

- Visit the [NestJS Documentation](https://docs.nestjs.com) to learn more about the framework.
- For questions and support, please visit our [Discord channel](https://discord.gg/G7Qnnhy).
- To dive deeper and get more hands-on experience, check out our official video [courses](https://courses.nestjs.com/).
- Deploy your application to AWS with the help of [NestJS Mau](https://mau.nestjs.com) in just a few clicks.
- Auto-instrument your application with [NestJS Observe](https://observe.nestjs.com). Distributed tracing, metrics, and logging made easy. Error tracking and performance monitoring for your NestJS applications.
- Visualize your application graph and interact with the NestJS application in real-time using [NestJS Devtools](https://devtools.nestjs.com).
- Need help with your project (part-time to full-time)? Check out our official [enterprise support](https://enterprise.nestjs.com).
- To stay in the loop and get updates, follow us on [X](https://x.com/nestframework) and [LinkedIn](https://linkedin.com/company/nestjs).
- Looking for a job, or have a job to offer? Check out our official [Jobs board](https://jobs.nestjs.com).

## Support

Nest is an MIT-licensed open source project. It can grow thanks to the sponsors and support by the amazing backers. If you'd like to join them, please [read more here](https://docs.nestjs.com/support).

## Stay in touch

- Author - [Kamil Myśliwiec](https://twitter.com/kammysliwiec)
- Website - [https://nestjs.com](https://nestjs.com/)
- Twitter - [@nestframework](https://twitter.com/nestframework)

## License

Nest is [MIT licensed](https://github.com/nestjs/nest/blob/master/LICENSE).
