# Прогресс

Чек-листы по milestones M0–M11 (см. SPEC.md, раздел 14.1). Агент ведёт этот файл.
Ссылки вида D-NN — на записи в `docs/DECISIONS.md`.

## M0. Каркас

Критерий готовности: `pnpm dev` поднимает всё; CI зелёный; `/health` отвечает.

### M0.0 Основа репозитория

- [x] `git init`, `.gitignore`, `.editorconfig`, `.nvmrc` (D-01), `packageManager` в корневом `package.json`
- [x] `pnpm-workspace.yaml`, `turbo.json` (`allowBuilds` для pnpm 12); `.npmrc` не понадобился — Metro работает с изолированным `node_modules` (D-25)
- [x] Корневые скрипты: `dev`, `build`, `lint`, `typecheck`, `test`, `test:e2e`, `db:migrate`, `db:seed`, `api:generate`, `i18n:check`
- [x] Commitlint (Conventional Commits) + lint-staged

### M0.1 packages/config

- [x] `tsconfig.base.json` (strict) + варианты node / next / react-native
- [x] ESLint flat config: `no-explicit-any: error`, `ban-ts-comment` только с описанием, запрет строк-литералов в JSX
- [x] Prettier

### M0.2 packages/domain

- [x] Скелет пакета, Vitest с порогом покрытия 90%
- [x] `errors.ts`: коды из SPEC 10.2 + тип `ApiError`
- [x] `decimal.js`; заготовки `money/`, `matching/` без логики

### M0.3 packages/db (D-03, D-04)

- [x] Prisma 7: `prisma.config.ts`, генератор `prisma-client`, `@prisma/adapter-pg`, экспорт клиента
- [x] Команды `db:migrate`, `db:seed`, `db:generate`; заготовка seed
- [x] `prisma validate` в CI (схема с моделями — в M1)

### M0.4 packages/i18n

- [x] `locales/uz.json`, `locales/ru.json` (`common.*`, `errors.<CODE>`)
- [x] `formatMoney`, `formatKg`, `formatDate`, `formatPhone` без `Intl` (D-09) + тесты по форматам SPEC 12.1
- [x] Скрипт `i18n:check` (паритет ключей)

### M0.5 packages/api-client

- [x] `openapi-typescript` + `openapi-fetch`; `openapi.json` и `src/generated/schema.ts` в репозитории; `createApiClient` (Bearer, `X-Org-Id`, `Accept-Language`), `isApiError`
- [x] `pnpm api:generate`: документ из модулей Nest без БД и сети → типы (детерминированно, проверено повторным запуском)

### M0.6 packages/ui

- [x] Пресет Tailwind 4 `@baliqbozor/ui/theme.css` (`@theme`, D-22), тест контраста AA для всех пар; `Button`, `Badge`, `cn`

### M0.7 infra

- [x] `infra/docker-compose.yml`: Postgres 18, Redis 8 (D-17), MinIO (D-21) + init приватного бакета; healthcheck'и
- [x] `.env.example` по SPEC 13.6 + D-10

### M0.8 apps/api

- [x] NestJS, префикс `/api/v1`, проверка env (zod)
- [x] pino с `requestId` и маской телефонов; Helmet; CORS по `WEB_URL`/`ADMIN_URL`; в логе ответа только `statusCode` (исправлен `null`, D-27)
- [x] Глобальный фильтр исключений → формат SPEC 10.2
- [x] `health`: `/health`, `/ready` (БД, Redis, S3) вне префикса (D-05)
- [x] Swagger `/api/docs` (не в production)
- [x] Глобальная сериализация `BigInt`/`Decimal` → строка
- [x] Sentry (выключен без DSN)
- [x] Jest + supertest: e2e `/health`, `/ready`, формат ошибки

### M0.9 apps/worker

- [x] NestJS standalone + BullMQ 6, очередь `system.heartbeat` (job scheduler, `HEARTBEAT_INTERVAL_MS`), pino с маской телефонов, корректная остановка по SIGTERM
- [x] HTTP `/health` и `/ready` (БД, Redis) на `WORKER_HEALTH_PORT` (D-05, D-23); e2e на реальных Postgres/Redis
- [x] Заготовка цикла опроса outbox: `OutboxPoller` + интерфейс `OutboxSource` (заглушка до `DomainEvent` в M1), юнит-тесты

### M0.10 apps/web и apps/admin

- [x] Next.js 16 App Router, Tailwind 4 + `@baliqbozor/ui/theme.css`, TanStack Query, `ApiProvider` на `api-client` (D-02)
- [x] i18n на next-intl: uz по умолчанию без префикса, ru — `/ru/…`, переключатель в шапке (D-08, D-24)
- [x] Страница-заглушка со статусом `/health` через `api-client` (проверено на живом API через CORS)
- [x] Vitest (HealthStatus: ok / down / повтор); smoke-тест Playwright на web (десктоп и Pixel 7, API подменяется)
- [x] Порты: web 3000, admin 3001, api 4000

### M0.11 apps/mobile

- [x] React Native 0.88 CLI (не Expo), TypeScript, `uz.baliqbozor.app`; Metro с `watchFolders` на корень, без hoisting (D-07, D-25)
- [x] i18next с ключами `packages/i18n` (плейсхолдеры `{name}`), переключатель uz/ru, экран-заглушка с `/health` через `api-client`
- [x] Jest 29 + RNTL 14 smoke-тест (uz по умолчанию, переключение на ru, ok/down/повтор); Android debug-сборка (`assembleDebug`) собрана и запущена на эмуляторе: Hermes, i18n, `/health` через `10.0.2.2` — работает. iOS (`pod install`) не проверялся: нет совместимого Ruby/CocoaPods
- [x] Скрипты `mobile:start|android|ios`, вне `pnpm dev` (D-06); lint/typecheck/test входят в общие turbo-задачи

### M0.12 CI (GitHub Actions)

Все шаги прогнаны локально на чистом клоне с `CI=true`; на GitHub-раннере ещё не запускался.

- [x] `.github/workflows/ci.yml`, три параллельных job'а (D-26): `checks` (format → lint → typecheck → unit → … → build), `e2e` (api + worker на docker compose), `web-e2e` (Playwright, отчёт артефактом при падении)
- [x] `prisma validate`, `i18n:check`, дрейф OpenAPI (`api:generate && git diff --exit-code`)
- [x] mobile: lint + typecheck + jest — в общих turbo-задачах job'а `checks` (D-06, D-26)

### M0.13 Закрытие

- [x] Чистый клон → `pnpm i` → `pnpm infra:up` → `pnpm db:migrate` → `pnpm db:seed` → `pnpm dev`: api и worker `/health`, `/ready` 200, web/admin 200 на uz и ru, heartbeat worker идёт (2026-11-01)
- [x] Все шаги CI на нетронутом клоне с проверкой кодов выхода; исправлены скрытые зависимости от локальных артефактов (D-27)
- [ ] CI на GitHub зелёный
- [x] PROGRESS и DECISIONS обновлены

Dockerfile'ы приложений — при подготовке staging (M11).

## M1. Доступ и организации (план, детализировать перед стартом)

- [ ] Полная схема SPEC 7.2 + миграция `init` + ручной SQL частичного уникального индекса `PriceIndex`; проверка `prisma migrate diff` в CI (D-04)
- [ ] Seed справочников и настроек 8.13 (+ недостающие); `settings` с кэшем Redis; `audit`
- [ ] `auth`: SmsProvider (console), OTP с лимитами, JWT + refresh-ротация (`familyId`)
- [ ] Guard'ы: аутентификация → роль → членство (`X-Org-Id`) → политика; хелпер e2e изоляции
- [ ] `/me`, `orgs`, участники, `OrgInvitation` (D-11), адреса
- [ ] Минимальный `media`: presigned PUT + complete (D-12)
- [ ] Верификация: отправка → `PENDING` + `OpsTask(VERIFY_ORG)` → решение оператора
- [ ] Outbox `DomainEvent` → worker → `Notification(IN_APP)`, `GET /notifications` (D-12)
- [ ] UI web: вход, онбординг, профиль организации, документы, уведомления; admin: вход, очередь верификации
- [ ] Демо-сценарий M1

## M2. Хозяйства и наличие (план, детализировать перед стартом)

- [ ] Обработка медиа в worker: magic bytes, sharp, удаление EXIF/GPS, лимиты видео
- [ ] Domain: статусная машина наличия, валидации 8.3, свежесть, гаверсинус + bbox
- [ ] `farms` (деактивация → PAUSED), карта в web
- [ ] `listings`: CRUD, publish/pause/resume/archive/confirm, `pauseReason`
- [ ] Планировщик (Asia/Tashkent): напоминание о свежести, автопауза, EXPIRED → outbox → in-app
- [ ] Публичный каталог `GET /listings` + страницы `/catalog`, `/listing/:id`
- [ ] Демо: критерий M2 и сценарий 14.3 №4
