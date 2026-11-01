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
- [x] CI на GitHub зелёный: https://github.com/byazamat/baliqbozor/actions/runs/41247185692

**M0 закрыт 2026-11-01.**

- [x] PROGRESS и DECISIONS обновлены

Dockerfile'ы приложений — при подготовке staging (M11).

## M1. Доступ и организации

Критерий готовности (SPEC 14.1): регистрация продавца → создание организации → отправка документов → оператор верифицирует в админке → владельцу приходит уведомление in-app. Плюс по DoD: e2e на успех, валидацию, права и изоляцию каждого эндпоинта; OpenAPI и клиент обновлены; i18n uz/ru; аудит и доменные события; CI зелёный.

Вне M1 (по плану SPEC): хозяйства и обработка медиа (M2), заявки и подбор (M3), realtime (M4), push/Telegram/SMS-провайдер Eskiz (M8), пульт, отчёты и impersonation (M9), мобильные экраны (M10). Решения по границам — D-28…D-36.

### M1.0 Схема БД и миграция `init` (D-04, D-11)

- [x] Полная схема SPEC 7.2 в `packages/db/prisma/schema.prisma` (43 модели) + `OrgInvitation` (D-11); сверено с SPEC построчно — отличия только запланированные; `prisma validate`
- [x] Миграция `20261101001507_init`; частичные уникальные индексы `PriceIndex` через preview `partialIndexes` вместо ручного SQL (D-38); проверено, что дубликаты отсекаются
- [x] `migrate deploy` на пустой БД и повторно — без изменений; `pnpm db:check-drift` (код 0 без расхождений, 2 при расхождении); в CI: `db:migrate:deploy` → `db:check-drift` перед e2e
- [x] `packages/db`: экспорт enum-ов, типов моделей и `TransactionClient`; тест экспорта enum-ов
- [x] Генерация кода — отдельная turbo-задача `generate` (Prisma, i18n, `next typegen`), от которой зависят build/lint/typecheck/test: убрана гонка параллельных `prisma generate` (D-38)

### M1.1 Домен: правила M1 (`packages/domain`, покрытие ≥ 90%)

- [x] `identity/phone`: нормализация номеров Узбекистана в `+998XXXXXXXXX` (D-32)
- [x] `identity/otp`: генерация 6 цифр, `decideOtpRequest` (кулдаун, номер/час с блокировкой, IP/час), `checkOtp` (срок, попытки, использованный код)
- [x] `org/verification`: машина статусов (проверена на всех 75 сочетаниях статус × действие × тип), правка юридических полей (D-30, D-39); `org/status-gate`: таблица ограничений 8.1
- [x] `org/access`: `canInOrg` и `canOnPlatform` — матрица SPEC 9 для действий M1
- [x] `org/membership`: последний OWNER, срок и активность приглашений
- [x] `settings/registry`: 28 ключей 8.13 (сверено со SPEC) + 4 добавленных (D-35, D-39), схемы zod, значения по умолчанию, `resolveSettings` игнорирует неверные сохранённые значения
- [x] Новые коды ошибок не понадобились (последний OWNER и дубликаты — `CONFLICT`, лимиты OTP — `RATE_LIMITED` с `retryAfterSec`)
- [x] Enum-ы схемы, нужные правилам, — в `domain/enums.ts` (домен не зависит от `db`); тест совместимости с Prisma — в M1.2
- [x] 108 тестов, покрытие 100%

### M1.2 Инфраструктура API

- [ ] `settings`: чтение из БД с кэшем Redis, сброс кэша при изменении; `GET/PATCH /admin/settings` (A) с аудитом
- [ ] `audit`: сервис записи `AuditLog` (актор, роль, ip, user-agent, before/after) в транзакции действия
- [ ] `events`: запись `DomainEvent` в транзакции (хелпер `withEvents(tx)`); `PrismaOutboxSource` в worker (`FOR UPDATE SKIP LOCKED`, попытки, `lastError`)
- [ ] Rate limiting: глобально 100 запросов/мин на пользователя/IP, хранилище Redis (SPEC 10.1); `RATE_LIMITED`
- [ ] Тест совместимости enum-ов `@baliqbozor/domain` и Prisma (типы)
- [ ] Пагинация курсором (`limit`, `cursor` → `{ items, nextCursor }`) — общий хелпер и DTO
- [ ] Логи: `userId`, `orgId` в контексте запроса (SPEC 13.3)

### M1.3 Auth

- [ ] `SmsProvider` (интерфейс) + `ConsoleSmsProvider` (код в лог только при `APP_ENV=local`, номер маскируется)
- [ ] `POST /auth/otp/request`: лимиты 13.2, ответ `{ resendAfterSec }`, одинаковый ответ для любых номеров
- [ ] `POST /auth/otp/verify`: проверка хэша, попыток и срока; `OTP_DEV_BYPASS_CODE` только при `APP_ENV=local`; создание пользователя при первом входе; принятие ожидающих приглашений
- [ ] JWT access (HS256, 15 мин, два ключа для ротации — D-10) + refresh (случайная строка, хэш, `familyId`)
- [ ] `POST /auth/refresh` с ротацией; повторное использование старого refresh отзывает цепочку; `POST /auth/logout`
- [ ] Заблокированный пользователь (`BLOCKED`) не входит и теряет доступ
- [ ] e2e: полный вход, лимиты, неверный/просроченный код, повтор refresh, logout, bypass недоступен вне local

### M1.4 Guard'ы и изоляция

- [ ] Глобальный guard: аутентификация → платформенная роль → членство (`X-Org-Id`, D-14) → политика ресурса; отказ по умолчанию, `@Public()` для открытых
- [ ] Декораторы `@Roles`, `@OrgRoles`, `@OrgTypes`, `@CurrentUser`, `@CurrentOrg`
- [ ] Проверка статуса организации (`ORG_SUSPENDED`, `ORG_NOT_VERIFIED`) по правилам 8.1
- [ ] Тестовые хелперы e2e: создать пользователя/организацию/токен, `expectIsolated(...)` для пары организаций A/B

### M1.5 Профиль, организации, участники, адреса

- [ ] `GET/PATCH /me` (профиль + организации с ролями, `fullName`, `locale`)
- [ ] `POST /orgs` (создатель — OWNER), `GET /orgs/:id` (публичный профиль), `PATCH /orgs/:id` (OWNER, O, A) + аудит
- [ ] `GET/POST /orgs/:id/members`, `PATCH/DELETE /orgs/:id/members/:userId`; приглашение существующего пользователя — сразу членство, нового номера — `OrgInvitation` (D-11)
- [ ] `GET/POST /orgs/:id/addresses`, `PATCH/DELETE /addresses/:id` (архивирование, один `isDefault`)
- [ ] `GET /dict/regions`, `GET /dict/species` (с размерными классами), публичные, с кэшем
- [ ] e2e на каждый эндпоинт: успех, валидация, права, изоляция A/B

### M1.6 Медиа (минимум, D-12)

- [ ] `StorageProvider`: presigned PUT/GET, `HEAD` объекта
- [ ] `POST /media/upload-url` (лимиты типов и размеров 10.3, `purpose = ORG_VERIFICATION`), `POST /media/:id/complete` (проверка наличия и размера объекта → `UPLOADED`), `GET /media/:id/url` (доступ — загрузивший, члены организации, O, A)
- [ ] Проверка magic bytes, EXIF и превью — M2 (D-12)
- [ ] e2e с MinIO: загрузка, неверный тип/размер, чужой файл недоступен

### M1.7 Верификация организаций

- [ ] `POST /orgs/:id/verification` (OWNER; `{ mediaIds[], note }`) → `PENDING`, `OpsTask(VERIFY_ORG)`, событие `org.verification.submitted`, аудит; повторная отправка после `REJECTED` (D-29, D-30)
- [ ] `GET /admin/orgs` (поиск по названию, телефону, СТИР; фильтр по статусу), `GET /admin/orgs/:id` (данные, участники, документы верификации)
- [ ] `POST /admin/orgs/:id/verify` / `reject` / `suspend` / `unsuspend` с комментарием → события `org.verification.approved/rejected`, закрытие задачи, аудит
- [ ] `GET /admin/tasks`, `PATCH /admin/tasks/:id` (минимум для очереди верификации; пульт — M9)
- [ ] e2e: полный цикл, неверные переходы (`INVALID_TRANSITION`), права (не O/A → 403)

### M1.8 Уведомления in-app (D-12)

- [ ] Каталог событий M1 в коде (получатели, каналы, критичность — SPEC 11.2): `org.verification.approved/rejected`, `org.member.invited`, `ops.task.created`
- [ ] Шаблоны `packages/i18n/notifications/{uz,ru}.json` + проверка паритета в `i18n:check`
- [ ] Worker: диспетчер outbox → `Notification(IN_APP)` на языке получателя; `org.member.invited` → SMS через `SmsProvider` (console); повторы до 3 раз
- [ ] `GET /notifications` (пагинация + `unreadCount`), `POST /notifications/:id/read`, `POST /notifications/read-all`
- [ ] e2e: событие → уведомление у нужных получателей и только у них

### M1.9 Web (apps/web)

- [ ] Сессия: refresh-токен в httpOnly-cookie через route handlers Next.js, access — в памяти, автообновление (D-31)
- [ ] `/login`: телефон с маской → код (таймер повторной отправки, ошибки по `code`)
- [ ] Онбординг: тип организации → форма 8.1 (форма, название, регион, СТИР, телефон)
- [ ] Переключатель организаций (`X-Org-Id`), защищённые разделы, выход
- [ ] Профиль пользователя (имя, язык)
- [ ] Профиль организации: просмотр/редактирование, статус верификации, загрузка документов и отправка на проверку, причина отказа
- [ ] Команда (OWNER): участники, приглашение по телефону, смена роли, исключение
- [ ] Уведомления: колокольчик со счётчиком (опрос, D-34), список, «прочитано»
- [ ] Компоненты `packages/ui`: Input, PhoneInput, Select, FileUpload, Alert, Dialog, EmptyState
- [ ] i18n uz/ru для всех экранов

### M1.10 Admin (apps/admin)

- [ ] Вход по OTP только для OPERATOR/ADMIN (остальным — экран «нет доступа»)
- [ ] Очередь верификации: таблица PENDING-организаций, фильтры, поиск
- [ ] Карточка организации: данные, участники, просмотр документов, «Верифицировать» / «Отклонить» (с комментарием) / «Заблокировать» / «Разблокировать»
- [ ] Настройки (A): таблица 8.13 с валидацией — минимальная версия
- [ ] i18n uz/ru

### M1.11 Seed и демо

- [ ] Справочники 7.3: 14 регионов, 9 видов, размерные классы; настройки 8.13 (идемпотентно, upsert)
- [ ] Демо-данные (только local/staging): оператор, администратор, 3 продавца, 3 покупателя, 2 перевозчика с владельцами (без хозяйств — они в M2), номера `+99890000000x` (D-36)
- [ ] Команда `pnpm admin:grant <phone> <role>` для выдачи платформенной роли на staging/production (D-36)

### M1.12 Приёмка M1

- [ ] e2e API сценария M1 целиком
- [ ] Playwright: продавец входит → создаёт организацию → загружает документ → отправляет; оператор в админке верифицирует; у продавца уведомление
- [ ] Чистая БД → `db:migrate` → `db:seed` → демо-сценарий руками; CI зелёный; PROGRESS и DECISIONS обновлены

## M2. Хозяйства и наличие (план, детализировать перед стартом)

- [ ] Обработка медиа в worker: magic bytes, sharp, удаление EXIF/GPS, лимиты видео
- [ ] Domain: статусная машина наличия, валидации 8.3, свежесть, гаверсинус + bbox
- [ ] `farms` (деактивация → PAUSED), карта в web
- [ ] `listings`: CRUD, publish/pause/resume/archive/confirm, `pauseReason`
- [ ] Планировщик (Asia/Tashkent): напоминание о свежести, автопауза, EXPIRED → outbox → in-app
- [ ] Публичный каталог `GET /listings` + страницы `/catalog`, `/listing/:id`
- [ ] Демо: критерий M2 и сценарий 14.3 №4
