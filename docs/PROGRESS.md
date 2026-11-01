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

- [x] `SettingsService`: БД + кэш Redis (5 мин), сброс при изменении, неверные сохранённые значения игнорируются, без Redis — чтение из БД; изменение с аудитом. Эндпоинты `GET/PATCH /admin/settings` — после guard'ов (M1.10)
- [x] `AuditService`: запись в транзакции действия; актор, роль (`PLATFORM/ORG`), `impersonatorId`, IP, user-agent из контекста запроса (`AsyncLocalStorage`); BigInt/Decimal сериализуются
- [x] Каталог событий M1 с типизированными payload (`domain/events`); `recordEvent(tx, …)` в api; worker: `PrismaOutboxSource` (`FOR UPDATE SKIP LOCKED`, аренда и пауза через служебное `availableAt`, миграция `outbox_available_at`), обработчик и отметка «обработано» в одной транзакции, экспоненциальные повторы, остановка после 10 попыток; `OutboxDispatcher` (D-40)
- [x] Лимит запросов: глобальный guard, фиксированное окно в Redis, пользователь или IP, `RATE_LIMIT_PER_MINUTE` (100), заголовки `X-RateLimit-*` и `Retry-After`; health не считается; без Redis — пропускает (D-40)
- [x] Тест совместимости enum-ов `@baliqbozor/domain` и Prisma (типы и значения)
- [x] Пагинация курсором: `CursorPageQueryDto`, курсор `createdAt+id`, `afterCursor`, `toPage`, `PageDto(T)` для OpenAPI
- [x] Логи: `userId`, `orgId` в строке запроса (заполнятся guard'ом аутентификации в M1.4)
- [x] Тестовое окружение e2e: отдельная БД `<имя>_test` (создаётся и мигрируется в Jest globalSetup) и Redis `/1`; очистка между тестами; `TRUST_PROXY_HOPS` для реального IP

### M1.3 Auth

- [x] `SmsProvider` + `ConsoleSmsProvider` (текст с кодом в лог только при `APP_ENV=local`, номер маскируется); тексты SMS из i18n на языке запроса
- [x] `POST /auth/otp/request`: лимиты 13.2 (кулдаун, номер/час с блокировкой на час в Redis, IP/час по служебному `OtpCode.ip`, миграция `otp_request_ip`), одинаковый ответ для любых номеров
- [x] `POST /auth/otp/verify`: argon2id-хэш, попытки, срок, защита от повторного использования кода; обход только при `APP_ENV=local` (и env запрещает его вне local); пользователь создаётся при первом входе с языком запроса; ожидающие приглашения превращаются в членство; события и аудит
- [x] Access JWT (HS256, 15 мин, текущий + предыдущий ключ); refresh — 32 случайных байта, в БД SHA-256, `familyId`; вне local секрет ≥ 32 символов
- [x] `POST /auth/refresh` (ротация под `FOR UPDATE`; повтор старого токена отзывает цепочку), `POST /auth/logout`
- [x] Заблокированный пользователь не входит (`FORBIDDEN`, `USER_BLOCKED`) и сразу теряет доступ: guard проверяет сессию и статус на каждом запросе (D-41)
- [x] e2e: полный вход, лимиты, неверный/просроченный/повторный код, ротация и повтор refresh, logout, блокировка, приглашения, обход недоступен вне local (12 тестов)
- [x] Глобальный `AuthGuard` (отказ по умолчанию, `@Public()`) — сделан здесь, роли и членство — M1.4

### M1.4 Guard'ы и изоляция

- [x] Глобальные guard'ы: `AuthGuard` (аутентификация, отказ по умолчанию, `@Public()`) → `AccessGuard` (платформенная роль, членство по `X-Org-Id` или пути с проверкой совпадения, D-14) → лимит; политики ресурса — `assertCanInOrg`/`assertCanOnPlatform` в сервисах
- [x] Декораторы `@PlatformRoles`, `@OrgScoped({ types, roles, allowPlatformStaff, fromParam })`, `@CurrentAuth` (организация — `auth.org`)
- [x] `assertOrgStatusAllows` — ограничения 8.1 (`ORG_SUSPENDED`, `ORG_NOT_VERIFIED`, тип)
- [x] Хелперы e2e: `FakeSms`, `loginAs`, `actor` (с платформенной ролью), `createOrg`, `addMember`, `expectIsolated`; e2e guard'ов (8 тестов)

### M1.5 Профиль, организации, участники, адреса

- [x] `GET/PATCH /me` (профиль + организации с ролями и статусом; `fullName`, `locale`; аудит)
- [x] `POST /orgs` (создатель — OWNER, СТИР по 8.1, событие, аудит), `GET /orgs/:id` (публичный профиль + приватный блок для своих и O/A, D-43), `PATCH /orgs/:id` (OWNER, O, A; блокировка юридических полей D-30; тип неизменен)
- [x] `GET/POST /orgs/:id/members`, `PATCH/DELETE /orgs/:id/members/:userId` (последний OWNER защищён, блокировка строки организации), `DELETE /orgs/:id/invitations/:id`; существующий пользователь — сразу участник, новый номер — `OrgInvitation` (повтор продлевает)
- [x] `GET/POST /orgs/:id/addresses`, `PATCH/DELETE /addresses/:id` (`X-Org-Id`; архивирование; один адрес по умолчанию, первый — автоматически)
- [x] `GET /dict/regions`, `GET /dict/species` (активные размерные классы), публичные; кэш не понадобился — запросы лёгкие (пересмотреть в M11)
- [x] e2e на каждый эндпоинт: успех, валидация, права, изоляция A/B (15 тестов)

### M1.6 Медиа (минимум, D-12)

- [x] `StorageProvider`: presigned PUT (подписаны `content-type` и `content-length` — файл другого размера хранилище не примет) и GET, `head`; подпись клиентом с `S3_PUBLIC_ENDPOINT`; заглушка в памяти для тестов
- [x] `POST /media/upload-url` (правила 10.3 в `domain/media`, `purpose = ORG_VERIFICATION`, только OWNER, `X-Org-Id`), `POST /media/:id/complete` (наличие и размер → `UPLOADED`, иначе `REJECTED`/409), `GET /media/:id/url` (загрузивший, члены организации, O, A; остальным 404)
- [ ] Проверка magic bytes, EXIF и превью — M2 (D-12)
- [x] e2e с MinIO: загрузка и скачивание, неверный размер отвергается хранилищем, типы и лимиты, права и изоляция (4 теста)

### M1.7 Верификация организаций

- [x] `POST /orgs/:id/verification` (OWNER; документы своей организации и загруженные) → `PENDING`, `OpsTask(VERIFY_ORG)`, события `org.verification.submitted` и `ops.task.created`, аудит; повтор после `REJECTED`; блокировка строки организации
- [x] `GET /admin/orgs` (поиск по названию, СТИР, телефону участника; фильтры статуса и типа; курсор), `GET /admin/orgs/:id` (профиль с приватными полями, участники, документы, открытые задачи)
- [x] `POST /admin/orgs/:id/verify` / `reject` / `suspend` / `unsuspend` (комментарий обязателен для отказа и блокировки) → события, закрытие задач `VERIFY_ORG`, аудит
- [x] `GET /admin/tasks` (статус, тип, курсор), `PATCH /admin/tasks/:id` (статус, назначение только на O/A, аудит)
- [x] e2e: полный цикл M1, отказ и повторная отправка, блокировка, неверные переходы, проверка документов, права и изоляция, поиск и задачи (5 тестов)

### M1.8 Уведомления in-app (D-12)

- [x] Обработчики каталога SPEC 11.2 для событий M1 (`apps/worker/src/notifications`): `org.verification.approved/rejected` → владельцы, `ops.task.created` → активные O/A, `org.member.added` → добавленный пользователь, `org.member.invited` → SMS на номер
- [x] Тексты — ключи `notifications.<событие>.title/body/sms` в `locales/{uz,ru}.json` (SPEC 12.5), паритет проверяет `i18n:check` (D-45)
- [x] Worker: outbox → `Notification(IN_APP, SENT)` на языке получателя в транзакции обработки события; SMS-приглашение через `SmsSender` (console); повторы — механизм outbox (D-40)
- [x] `GET /notifications` (курсор, `unreadOnly`, `unreadCount`), `POST /notifications/:id/read`, `POST /notifications/read-all`
- [x] e2e: событие → уведомления нужным получателям на их языке и только им (worker, 3 теста); API: курсор, прочтение, изоляция (3 теста)
- [x] e2e api и worker разведены по разным тестовым БД и базам Redis — параллельный прогон больше не мешает (D-45)

### M1.9 Web (apps/web)

- [x] Сессия (D-31, D-46): route handlers `/api/session/{login,refresh,logout}` держат refresh-токен в httpOnly-cookie, access — в памяти `SessionManager` (`packages/api-client`): обновление заранее и после 401 с повтором, один запрос обновления на все вкладки (Web Locks)
- [x] `/login`: телефон с маской → код (таймер повторной отправки, ошибки по `code`, `retryAfterSec`), `?next` только внутренний, язык — из профиля
- [x] Онбординг: тип организации → форма 8.1 (форма, название, регион, СТИР, телефон), проверка СТИР теми же правилами домена
- [x] Переключатель организаций (`X-Org-Id` явно в запросах уровня организации), защищённые разделы (без сессии — вход, без организации — онбординг), выход
- [x] Профиль пользователя (имя, язык; смена языка переключает интерфейс)
- [x] Профиль организации: просмотр/редактирование (реквизиты заблокированы на проверке и после, D-30), статус верификации, загрузка документов (presigned PUT → complete), выбор документов и отправка на проверку, причина отказа; в API — `GET /orgs/:id/documents` (D-46)
- [x] Команда (OWNER): участники, приглашение по телефону, смена роли, исключение с подтверждением, отзыв приглашения
- [x] Уведомления: колокольчик со счётчиком (опрос 30 с и при фокусе, D-34), список с подгрузкой, «прочитано», «все прочитаны»
- [x] Компоненты `packages/ui`: Field, Input, Textarea, PhoneInput, Select, FileUpload, Alert, Dialog, EmptyState; контраст новых пар проверяется тестом темы
- [x] i18n uz/ru для всех экранов; проверено вживую на десктопе и ширине 375 px

### M1.10 Admin (apps/admin)

- [x] Вход по OTP (та же сессия, что в web, отдельная cookie, D-46) только для OPERATOR/ADMIN; остальным — экран «нет доступа» с входом под другим номером
- [x] Очередь верификации: таблица организаций (по умолчанию PENDING), фильтры по статусу и типу, поиск по названию, СТИР и телефону участника, подгрузка
- [x] Карточка организации: данные, участники, открытые задачи с комментарием заявителя, документы (превью изображений и «Открыть» по подписанным ссылкам), «Верифицировать» / «Отклонить» (комментарий обязателен) / «Заблокировать» / «Разблокировать» — доступность по статусной машине домена, подтверждение в диалоге
- [x] Настройки (A): `GET/PATCH /admin/settings` (только ADMIN, через `SettingsService`, аудит; e2e) и таблица 8.13 с описаниями, значением по умолчанию, отметкой «изменено» и проверкой той же схемой домена до запроса (D-48); ошибки проверки — на uz/ru по кодам домена (D-50)
- [x] i18n uz/ru; проверено вживую: отказ продавцу, решение оператора → уведомление владельцу, правка настройки администратором

### M1.11 Seed и демо

- [x] Справочники 7.3: 14 регионов, 9 видов, 32 размерных класса (upsert по `code`); настройки 8.13 — только недостающие, изменения администратора не затираются (D-47)
- [x] Демо-данные (только local/staging): оператор, администратор, 3 продавца, 3 покупателя, 2 перевозчика с владельцами (без хозяйств — они в M2), номера `+998900000001…10` (D-36, D-47)
- [x] Команда `pnpm admin:grant <phone> <OPERATOR|ADMIN|USER>` с записью в аудит (D-36, D-47); e2e: идемпотентность seed, вход демо-владельца, выдача и снятие роли

### M1.12 Приёмка M1

- [x] e2e API сценария M1 целиком (`apps/api/test/m1-acceptance.e2e-spec.ts`): новый номер → OTP → организация → загрузка в MinIO → отправка → очередь и карточка оператора, документ по подписанной ссылке → верификация → статус у владельца, событие outbox, аудит, изоляция (D-49)
- [x] Playwright (`pnpm test:acceptance`, живые api, worker, web, admin): продавец входит → создаёт организацию → загружает документ → отправляет; оператор в админке находит, смотрит документ и верифицирует; у продавца уведомление in-app и статус «Проверена»; в CI — job `web-e2e` после `db:migrate:deploy` и `db:seed` на чистой БД
- [x] Чистая БД → `db:migrate` → `db:seed` (повторно — без дублей) → `db:check-drift` → сценарий и ручная проверка демо-продавца (uz) и оператора; CI зелёный ([прогон 41321176823](https://github.com/byazamat/baliqbozor/actions/runs/41321176823): checks, e2e, Playwright smoke + приёмка); PROGRESS и DECISIONS обновлены

**M1 закрыт 2026-11-01.**

## M2. Хозяйства и наличие

Критерий готовности (SPEC 14.1): продавец публикует наличие с фото; покупатель находит его в каталоге с фильтрами и по расстоянию; без подтверждения через 7 дней позиция уходит в паузу. Плюс сценарий 14.3 №4 «Свежесть» и DoD: e2e на успех, валидацию, права и изоляцию каждого эндпоинта; OpenAPI и клиент; i18n uz/ru; аудит и доменные события; CI зелёный.

Вне M2: мобильные экраны (M10), push и Telegram-кнопки напоминаний (M8/M10 — в M2 только in-app), ценовой индекс на карточке (M11, поле пока `null`), резервирование и `SOLD_OUT` по заказам (M4), подбор по заявкам (M3). Решения по границам — D-51 и далее.

### M2.0 Решения и схема

- [x] DECISIONS: границы M2, обработка медиа и видео, служебные поля наличия, правила статусов и свежести, приватность каталога
- [x] Миграция `m2_listing_media_service_fields`: `Listing.pauseReason`, `Listing.freshnessRemindedAt`, `MediaFile.purpose`, `MediaFile.rejectReason` (служебные), `MediaFile.sortOrder` (порядок фото), индексы для каталога и планировщика (`Farm(lat, lng)`, `Listing(status, lastConfirmedAt)`, `Listing(status, availableTo)`, `MediaFile(orgId, purpose)`); перенос `purpose = ORG_VERIFICATION` для существующих файлов; `db:check-drift`

### M2.1 Домен (`packages/domain`, покрытие ≥ 90%)

- [x] `listing/rules`: проверки 8.3 (объёмы, минимальная партия ≥ `order.minOrderKg`, цена по `priceType`, окно вылова и `kind` по `listing.nowMaxDaysAhead`, `volumeKg ≥ reservedKg + soldKg`), `availableKg`
- [x] `listing/status`: машина статусов (publish, pause, resume, archive, confirm, expire, autopause, farm-deactivate) с причинами паузы; условия публикации (верификация, фото, объёмы, даты)
- [x] `listing/freshness`: срок подтверждения, момент напоминания (за 1 день), автопауза, истечение по дате в Asia/Tashkent
- [x] `geo`: гаверсинус, ограничивающий прямоугольник, округление расстояния для публичной выдачи
- [x] `farm/rules`: обязательные поля и координаты в пределах Узбекистана (с запасом)
- [x] `org/access`: действия `FARMS_VIEW`, `FARMS_MANAGE`, `LISTINGS_VIEW`, `LISTINGS_MANAGE`, `LISTING_CONFIRM` по матрице SPEC 9 и D-15
- [x] `media`: назначения `FARM_PHOTO`, `LISTING_MEDIA`; лимит длительности видео; сверка magic bytes с заявленным типом
- [x] `time`: дата и минуты суток по Ташкенту без `Intl` (UTC+5), рабочие часы
- [x] События: `farm.created/updated/deactivated`, `listing.created/updated/status_changed/confirmed/expired`, `listing.freshness_reminder`, `listing.auto_paused`, `media.uploaded`; enum-ы наличия и медиа в домене + тест совместимости с Prisma; 165 тестов, покрытие 99,7%

### M2.2 Обработка медиа (api + worker)

- [x] API: `purpose` `FARM_PHOTO`/`LISTING_MEDIA` (продавец OWNER/MANAGER, `X-Org-Id`), `complete` → событие `media.uploaded` в транзакции
- [x] Worker: outbox `media.uploaded` → очередь BullMQ `media` (jobId = mediaId, повторы); проверка magic bytes; изображения — sharp: поворот по EXIF, удаление метаданных (в том числе GPS), очищенная копия под новым ключом и удаление оригинала, превью WebP; видео — ffmpeg (`ffmpeg-static`, `FFMPEG_PATH`): длительность ≤ 60 с, удаление метаданных, кадр-превью; итог `PROCESSED` или `REJECTED` с причиной
- [x] `GET /media/:id` (статус и причина отказа), `GET /media/:id/url?variant=thumb`; доступ — загрузивший, члены организации, O/A; публичная выдача обработанных фото — через каталог (M2.6); документы организации и верификация берут только `ORG_VERIFICATION`
- [x] Web: `compressPhoto` (до ~2 МБ, JPEG, HEIC → JPEG там, где браузер умеет, D-46 п. 7) и `uploadSellerMedia`; экраны — в M2.7
- [x] Тесты: unit worker (EXIF/GPS и геотег QuickTime удалены, поворот, превью, PNG, битый файл, PDF, видео 62 с отклонено), e2e worker с MinIO (outbox → очередь → `PROCESSED`/`REJECTED`, оригинал удалён), e2e api (права по назначению, событие один раз, статус, изоляция)

### M2.3 Хозяйства

- [x] `GET/POST /farms`, `GET/PATCH /farms/:id` (SELLER; STAFF — просмотр; O/A), фото через `mediaIds` (порядок, отвязка; только свои `FARM_PHOTO`, D-52); деактивация `isActive = false` переводит активное наличие в `PAUSED` (причина «хозяйство отключено») в той же транзакции; аудит и события
- [x] D-28: отправка продавцом документов на верификацию требует хотя бы одного активного хозяйства
- [x] e2e: успех, валидация (зона сервиса, регион, чужие файлы), права (STAFF, MANAGER, BUYER, O), изоляция A/B, деактивация, заблокированный продавец, правило D-28; сценарий M1 (e2e API) теперь добавляет хозяйство через `POST /farms` (5 тестов)

### M2.4 Наличие продавца

- [ ] `POST /listings` (`DRAFT`), `PATCH /listings/:id` (проверки 8.3; правка объёма или цены обновляет `lastConfirmedAt`), `POST /listings/:id/publish|pause|resume|archive|confirm`, `GET /seller/listings` (фильтр по статусу, курсор), `GET /listings/:id` для своих в любом статусе
- [ ] Медиа наличия: привязка и порядок фото/видео, метка «есть видео облова»
- [ ] Аудит и события на каждое действие; строка наличия блокируется (`FOR UPDATE`) при смене статуса и объёма
- [ ] e2e: каждый переход и запрет, валидации 8.3, STAFF только подтверждает (D-15), неверифицированный и заблокированный продавец, изоляция

### M2.5 Планировщик свежести (worker)

- [ ] Задача BullMQ по расписанию (каждый час, часовой пояс Asia/Tashkent): напоминание за день до срока (один раз за цикл), автопауза по истечении `listing.freshnessDays`, `EXPIRED` при прошедшем `availableTo`; пакетами, идемпотентно, события в той же транзакции
- [ ] Уведомления in-app: `listing.freshness_reminder` (OWNER/MANAGER/STAFF), `listing.auto_paused` (OWNER/MANAGER) — тексты uz/ru со ссылкой на позицию
- [ ] e2e worker: напоминание → автопауза → уведомления; повторный прогон ничего не дублирует

### M2.6 Публичный каталог

- [ ] `GET /listings` (public): фильтры `speciesId, sizeClassId, form, regionId, kind, availableOn, maxPrice`, `near=lat,lng` + `radiusKm` (гаверсинус в SQL с отбором по прямоугольнику), `sort=score|price|distance|fresh`, курсор; только `ACTIVE` с доступным объёмом
- [ ] `GET /listings/:id` (public): карточка без координат, контактов и названия хозяйства (регион, рейтинг продавца, расстояние округлено), фото по подписанным ссылкам, `priceIndex: null` до M11
- [ ] e2e: фильтры, расстояние и сортировки, скрытие закрытых полей, неактивное наличие не видно чужим

### M2.7 Web: кабинет продавца

- [ ] Компонент карты за общим интерфейсом (Leaflet + OSM, `NEXT_PUBLIC_MAP_TILE_URL`, атрибуция; D-37): выбор точки и показ
- [ ] Хозяйства: список, создание и редактирование с картой и фото, деактивация с подтверждением
- [ ] Наличие: список по статусам, форма в порядке 12.2, фото/видео, быстрые действия (подтвердить, изменить объём, пауза, возобновить, архив), бейджи статусов и причины паузы, подсказки в пустых состояниях
- [ ] Главная продавца: позиции с истекающей свежестью; подсказка «добавьте хозяйство» перед верификацией (D-28)
- [ ] i18n uz/ru; проверка вживую на десктопе и 375 px

### M2.8 Web: публичный каталог

- [ ] `/catalog`: фильтры, карточки (фото, вид, размер, форма, объём, цена или «договорная», окно вылова, регион, рейтинг, «есть видео облова»), «рядом со мной» (геолокация браузера или выбор региона), сортировки, подгрузка; «Заказать» ведёт на вход
- [ ] `/listing/:id`: галерея, видео, параметры, регион и рейтинг продавца
- [ ] SEO-основа: `generateMetadata`, серверный рендер первой страницы каталога

### M2.9 Admin

- [ ] Карточка организации: хозяйства продавца (точка на карте, фото) и наличие — для проверки перед верификацией

### M2.10 Seed и демо

- [ ] Демо: хозяйства у верифицированных продавцов (Самарканд, Джизак, …) и наличие в разных статусах с фото (картинки загружаются в MinIO из `packages/db/seed-assets`); идемпотентно

### M2.11 Приёмка M2

- [ ] e2e API: продавец создаёт хозяйство → наличие → фото обрабатывается → публикация → анонимный поиск с фильтрами и расстоянием находит позицию
- [ ] Сценарий 14.3 №4: 7 дней без подтверждения → `PAUSED`, исчезает из каталога, уведомление продавцу; «Актуально» → снова `ACTIVE`
- [ ] Playwright (`pnpm test:acceptance`): продавец создаёт хозяйство на карте и наличие с фото, публикует; гость находит его в `/catalog` по фильтру и расстоянию
- [ ] Чистая БД → migrate → seed → drift; CI зелёный; PROGRESS и DECISIONS обновлены
