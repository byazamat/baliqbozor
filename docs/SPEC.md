# ТЗ: B2B-маркетплейс рыбы для рыбных хозяйств Узбекистана (MVP)

> Версия 1.0 · октябрь 2026 · рабочее название проекта: **BaliqBozor** (заменить на финальный бренд)
>
> Документ — единственный источник истины для разработки. Он написан так, чтобы по нему мог работать AI-агент (Claude Code) и человек-разработчик. Всё, что здесь не описано и не следует из описанного, — вне объёма MVP. Если требование неоднозначно — выбрать значение по умолчанию из раздела 15 «Открытые вопросы» и записать решение в `docs/DECISIONS.md`.

## Содержание

1. Цель и границы проекта
2. Контекст рынка (кратко)
3. Участники и роли
4. Глоссарий
5. Архитектура и технологический стек
6. Структура репозитория и соглашения
7. Модель данных (Prisma-схема)
8. Бизнес-процессы, статусы и правила
9. Права доступа
10. API (REST + realtime)
11. Уведомления и Telegram-бот
12. Клиентские приложения: веб, админка оператора, мобильное приложение
13. Нефункциональные требования, безопасность, тестирование, DevOps
14. План реализации (milestones) и критерии приёмки
15. Открытые вопросы и значения по умолчанию
16. Точки расширения (будущие модули)

---

## 1. Цель и границы проекта

### 1.1. Проблема

Рыбные хозяйства Узбекистана продают рыбу в основном через посредников. Посредник получает заказ (например, 10 ресторанов по 2 т толстолобика), объезжает знакомые хозяйства, сам назначает закупочную цену, собирает объём и доставляет покупателю. По словам рыбоводов, фермер получает 2–3 тыс. сум чистыми с кг, а посредник добавляет сверху 8–10 тыс. сум. Прямого канала «хозяйство → покупатель» нет.

Посредник при этом выполняет реальные функции, которые платформа обязана заменить:

- **агрегация** — собирает нужный объём с нескольких хозяйств;
- **логистика** — организует перевозку живой рыбы;
- **риск и деньги** — платит фермеру и рискует неоплатой покупателя;
- **документы** — накладные, ветеринарные документы, счета.

### 1.2. Цель MVP

Сделать B2B-платформу, через которую:

1. **покупатель** (ресторан, магазин, оптовик, переработчик) размещает заявку на рыбу и получает предложения от проверенных хозяйств;
2. **рыбхоз** публикует наличие и будущий урожай, отвечает на заявки и получает справедливую цену;
3. **оператор платформы** помогает подобрать хозяйства, собирает сборный заказ, назначает перевозчика, разбирает споры;
4. **перевозчик** получает заказы на доставку живой и охлаждённой рыбы;
5. все стороны видят статус сделки, документы, фактический вес при приёмке, расчёты и рейтинги.

Принцип: **маркетплейс работает от заявки покупателя**, а не от доски объявлений. В первые месяцы значительная часть подбора делается оператором вручную, система фиксирует всё и постепенно автоматизирует.

### 1.3. В объёме MVP

- Регистрация по номеру телефона (OTP), организации, команды, верификация продавцов.
- Справочники: регионы, виды рыбы, размерные классы, формы поставки.
- Хозяйства продавца, публикация наличия и будущего урожая с фото и видео контрольного облова.
- Заявки покупателей, автоматический подбор хозяйств, предложения продавцов.
- Заказы, включая **сборные заказы** из нескольких хозяйств, подтверждение продавцами, резервирование объёма.
- Логистика: перевозчики, машины, рейсы, статусы.
- Приёмка с **фактическим весом**, снулой рыбой и фото весов.
- Учёт расчётов (без онлайн-платежей), комиссия платформы, счета на комиссию.
- Документы: генерация PDF (подтверждение заказа, акт приёмки, счёт на комиссию) и загрузка (ветеринарные документы, накладные).
- Чат по заказу, уведомления (in-app, push, SMS, Telegram), Telegram-бот для продавцов.
- Споры, отзывы, рейтинг надёжности.
- Ценовой индекс (средние цены сделок).
- Кабинет оператора (back-office) и администратора.
- Веб-приложение (покупатель, продавец, перевозчик), админка, мобильное приложение (React Native).

### 1.4. Вне объёма MVP (не реализовывать, только оставить точки расширения — раздел 16)

- Интеграция с государственной платформой e-baliq.
- Оборудование, IoT, телеметрия, датчики.
- Учёт хозяйства (кормление, биомасса, вода).
- Онлайн-платежи, удержание денег (escrow), отсрочка платежа, кредитование, факторинг.
- Интеграция с операторами электронных счетов-фактур (ЭСФ).
- Продажи частным лицам (B2C), экспорт, аукционы.
- Поставщики малька, кормов и оборудования как отдельные продавцы.
- GPS-трекинг машин в реальном времени.
- Telegram Mini App (только бот).

---

## 2. Контекст рынка (кратко)

- Страна: Узбекистан. Часовой пояс: `Asia/Tashkent` (UTC+5). Валюта: узбекский сум (UZS), в расчётах используются целые суммы без тийинов.
- Основные виды: карп (сазан), толстолобик белый и пёстрый, белый амур (прудовая поликультура); форель, осётр, клариевый сом, тиляпия (УЗВ и проточная вода).
- Сезонность: прудовые хозяйства массово вылавливают рыбу осенью (сентябрь–ноябрь) — предложение растёт, цены падают. УЗВ и форель продают круглый год.
- Рыба продаётся **живой** (в живорыбных машинах с баками и аэрацией) или **охлаждённой**. Живая рыба теряет вес и может погибнуть в пути — отсюда учёт снулой рыбы при приёмке.
- Каналы связи пользователей: телефон и Telegram — основные; многие фермеры не установят отдельное приложение, поэтому продавцу должно хватать Telegram-бота для ключевых действий.
- Языки: узбекский (латиница) — основной, русский — второй.
- Номер телефона: формат `+998XXXXXXXXX` (12 цифр после `+`).
- Идентификатор организации: СТИР (ИНН) — 9 цифр. ПИНФЛ физлиц **не хранить** в MVP.
- Организационно-правовые формы: ЯТТ (индивидуальный предприниматель), МЧЖ (ООО), фермерское хозяйство (fermer xo'jaligi), дехканское хозяйство (dehqon xo'jaligi), физлицо.

---

## 3. Участники и роли

| Участник | Кто это | Главные действия |
|---|---|---|
| **Продавец** (организация типа `SELLER`) | Рыбхоз: пруды, УЗВ, форелевое хозяйство | Ведёт хозяйства, публикует наличие, отвечает на заявки, подтверждает строки заказа, отмечает отгрузку, загружает ветдокументы, подтверждает получение оплаты |
| **Покупатель** (`BUYER`) | Ресторан, магазин, сеть, оптовик, переработчик | Создаёт заявки, принимает предложения, отслеживает заказ, оформляет приёмку, отмечает оплату, оставляет отзывы |
| **Перевозчик** (`CARRIER`) | Владелец живорыбных или рефрижераторных машин | Ведёт машины, получает рейсы, меняет статусы рейса |
| **Оператор** (платформенная роль `OPERATOR`) | Сотрудник платформы, диспетчер | Верификация, ручной подбор, сборка заказов от имени покупателя (по звонку), назначение перевозчиков, контроль сроков, споры |
| **Администратор** (`ADMIN`) | Владелец платформы | Всё, что оператор, плюс справочники, настройки, комиссии, отчёты, пользователи |

Внутри организации у пользователя роль: `OWNER` (владелец), `MANAGER` (управляющий), `STAFF` (сотрудник). Один пользователь может состоять в нескольких организациях и переключаться между ними.

---

## 4. Глоссарий

| Термин | Значение |
|---|---|
| Хозяйство (Farm) | Площадка продавца с координатами: пруды, УЗВ и т.п. У продавца может быть несколько хозяйств |
| Наличие (Listing) | Публикация продавца: вид, размерный класс, форма, объём, цена, окно вылова |
| Будущий урожай | Наличие с датой готовности в будущем (`kind = FUTURE_HARVEST`) |
| Окно вылова | Даты, в которые продавец готов выловить и отгрузить рыбу |
| Размерный класс | Диапазон веса одной рыбы, например «толстолобик 1–2 кг» |
| Форма поставки | `LIVE` — живая, `CHILLED` — охлаждённая |
| Заявка (BuyerRequest) | Запрос покупателя: что, сколько, куда, когда |
| Предложение (Offer) | Ответ продавца на заявку: объём, цена, дата |
| Заказ (Order) | Сделка, состоящая из одной или нескольких строк |
| Строка заказа (OrderLine) | Часть заказа от одного хозяйства |
| Сборный заказ | Заказ из нескольких строк от разных хозяйств |
| Рейс (Shipment) | Перевозка по заказу с точками погрузки и выгрузки |
| Приёмка (Acceptance) | Фиксация покупателем фактического веса, снулой и отбракованной рыбы по строке |
| Снулая рыба | Рыба, погибшая к моменту приёмки (для живой поставки) |
| Комиссия | Вознаграждение платформы, процент от итоговой суммы строки |
| Ценовой индекс | Средние цены завершённых сделок по виду, размеру, региону и неделе |
| Свежесть наличия | Продавец должен регулярно подтверждать, что наличие актуально |
| bps | Базисный пункт, 1/100 процента: 200 bps = 2% |

---

## 5. Архитектура и технологический стек

### 5.1. Общая схема

```
 ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐
 │ apps/web     │  │ apps/admin   │  │ apps/mobile  │  │ Telegram     │
 │ Next.js      │  │ Next.js      │  │ React Native │  │ (бот)        │
 └──────┬───────┘  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘
        │ REST + WebSocket (JWT)            │                 │ webhook
        └─────────────────┬─────────────────┘                 │
                   ┌──────▼─────────────────────────────────────▼──────┐
                   │ apps/api — NestJS (модульный монолит)             │
                   │ REST /api/v1 · Socket.IO /rt · Telegram webhook   │
                   └──────┬──────────────┬───────────────┬─────────────┘
                          │              │               │
                   ┌──────▼─────┐ ┌──────▼─────┐  ┌──────▼──────────┐
                   │ PostgreSQL │ │ Redis      │  │ S3-хранилище    │
                   │ (Prisma)   │ │ BullMQ     │  │ (MinIO локально)│
                   └────────────┘ └──────┬─────┘  └─────────────────┘
                                  ┌──────▼─────────────────────────┐
                                  │ apps/worker — NestJS (очереди):│
                                  │ уведомления, PDF, индекс цен,  │
                                  │ напоминания, таймауты          │
                                  └────────────────────────────────┘
```

**Модульный монолит**: один NestJS-бэкенд с чётко разделёнными модулями и отдельный процесс `worker` из той же кодовой базы для фоновых задач. Микросервисы не нужны.

### 5.2. Стек

| Слой | Технология | Примечание |
|---|---|---|
| Язык | TypeScript (strict) везде | `noImplicitAny`, `strictNullChecks` |
| Монорепозиторий | pnpm workspaces + Turborepo | |
| Бэкенд | NestJS 10+, Node.js 20 LTS | REST + Socket.IO gateway |
| ORM | Prisma | PostgreSQL 16 |
| Очереди | BullMQ + Redis 7 | Отдельный процесс `apps/worker` |
| Валидация | class-validator + class-transformer в API; zod в общих пакетах и на клиентах | |
| Документация API | @nestjs/swagger → OpenAPI 3 | Клиент генерируется `openapi-typescript` + `openapi-fetch` в `packages/api-client` |
| Аутентификация | OTP по SMS, JWT access (15 мин) + refresh (30 дней, ротация) | |
| Файлы | S3-совместимое хранилище, загрузка по presigned URL | MinIO в dev |
| PDF | HTML-шаблоны → PDF через headless Chromium (Playwright) в worker | Шрифты с кириллицей и узбекской латиницей (Noto Sans) |
| Изображения | sharp: ресайз, превью, удаление EXIF | В worker после загрузки |
| Веб | Next.js 14+ (App Router), React 18, TanStack Query, react-hook-form + zod, Tailwind CSS | |
| Админка | Отдельное Next.js-приложение, тот же стек, таблицы — TanStack Table | |
| Карты | MapLibre GL или Leaflet + OpenStreetMap | Выбор точки на карте, показ хозяйств |
| Мобильное | React Native CLI (не Expo), TypeScript, React Navigation, TanStack Query, Zustand, MMKV, react-native-vision-camera, Notifee + FCM | |
| Telegram | grammY внутри `apps/api` (модуль `telegram`), режим webhook | |
| SMS | Абстракция `SmsProvider`: `ConsoleSmsProvider` (dev), `EskizSmsProvider` (prod, уточнить провайдера) | |
| Push | Firebase Cloud Messaging (Android, iOS через APNs) | |
| Логи | pino (JSON) с requestId | |
| Ошибки | Sentry (api, web, admin, mobile) | |
| Тесты | Jest (api), Vitest (пакеты, web), Playwright (e2e web), supertest (e2e API) | |
| Инфраструктура | Docker, docker-compose (dev/staging), GitHub Actions | |

### 5.3. Модули бэкенда (apps/api/src/modules)

| Модуль | Ответственность |
|---|---|
| `auth` | OTP, токены, сессии, guards |
| `users` | Профиль, устройства push, настройки уведомлений, привязка Telegram |
| `orgs` | Организации, участники, адреса, верификация, публичные профили |
| `dictionaries` | Регионы, виды рыбы, размерные классы |
| `farms` | Хозяйства продавцов |
| `media` | Presigned URL, регистрация файлов, обработка (через worker) |
| `listings` | Наличие и будущий урожай, резервы, свежесть |
| `requests` | Заявки покупателей |
| `matching` | Подбор кандидатов для заявки, рассылка продавцам |
| `offers` | Предложения продавцов, принятие → создание заказа |
| `orders` | Заказы, строки, статусы, события, сборка оператором |
| `logistics` | Машины, рейсы, точки, статусы рейсов |
| `acceptance` | Приёмка строк, фактический вес |
| `payments` | Учёт платежей и подтверждений |
| `commissions` | Начисление и выставление комиссии |
| `documents` | Генерация и загрузка документов |
| `chat` | Сообщения по заказу |
| `disputes` | Споры |
| `reviews` | Отзывы, рейтинги, надёжность |
| `prices` | Ценовой индекс |
| `notifications` | Каталог событий, шаблоны, каналы, доставка |
| `telegram` | Бот: привязка, команды, inline-действия |
| `admin` | Эндпоинты оператора и администратора, отчёты, CRM-заметки, задачи |
| `settings` | Настройки платформы с кэшем |
| `audit` | Журнал аудита |
| `events` | Доменные события (outbox) и их публикация в очереди |
| `realtime` | Socket.IO gateway, комнаты, рассылка событий |
| `health` | `/health`, `/ready` |

### 5.4. Доменные события (outbox)

Каждое значимое изменение (создана заявка, подтверждена строка, сменился статус заказа и т.д.) в той же транзакции записывается в таблицу `DomainEvent`. Worker вычитывает необработанные события и:

1. публикует их в realtime (Socket.IO);
2. запускает уведомления по каталогу (раздел 11);
3. в будущем — передаёт во внешние интеграции (e-baliq, учёт хозяйства).

Это гарантирует, что уведомление не потеряется при сбое после коммита и не уйдёт, если транзакция откатилась.

### 5.5. Окружения

| Окружение | Назначение | Особенности |
|---|---|---|
| `local` | Разработка | docker-compose: Postgres, Redis, MinIO; SMS в консоль; OTP-код `000000` разрешён только здесь |
| `staging` | Тестирование и демо | Отдельная БД; реальные SMS только на белый список номеров |
| `production` | Боевое | Дата-центр в Узбекистане (провайдер уточняется); TLS; резервные копии |

---

## 6. Структура репозитория и соглашения

### 6.1. Структура

```
baliqbozor/
├─ CLAUDE.md                 # инструкция для AI-агента
├─ docs/
│  ├─ SPEC.md                # этот документ
│  ├─ DECISIONS.md           # принятые решения по неясностям
│  └─ PROGRESS.md            # прогресс по milestones
├─ apps/
│  ├─ api/                   # NestJS: REST, WebSocket, Telegram webhook
│  ├─ worker/                # NestJS standalone: BullMQ-процессоры
│  ├─ web/                   # Next.js: покупатель, продавец, перевозчик, лендинг
│  ├─ admin/                 # Next.js: оператор и администратор
│  └─ mobile/                # React Native CLI
├─ packages/
│  ├─ db/                    # Prisma schema, миграции, seed, клиент
│  ├─ domain/                # общие типы, enum-ы, чистая бизнес-логика
│  │                         #  (статусные машины, расчёт сумм, matching score)
│  ├─ api-client/            # сгенерированный клиент OpenAPI + обёртки
│  ├─ i18n/                  # переводы uz/ru, форматирование чисел/дат/денег
│  ├─ ui/                    # общие React-компоненты web/admin
│  ├─ config/                # общие eslint, tsconfig, prettier
│  └─ pdf-templates/         # HTML-шаблоны документов
├─ infra/
│  ├─ docker-compose.yml
│  ├─ docker/                # Dockerfile для каждого app
│  └─ caddy/ или nginx/      # reverse proxy для staging/prod
└─ .github/workflows/        # CI
```

### 6.2. Соглашения по коду

- **Деньги** — только целые числа в сумах (`BigInt` в Prisma и в домене, `string` в JSON API). Никаких `number` и `float` для денег. Округление — до целого сума, «половина вверх».
- **Вес** — килограммы, `Decimal(12,3)` в БД, в API — строка с десятичной точкой (`"1250.500"`). Расчёты — через `decimal.js` в `packages/domain`.
- **Время** — в БД UTC (`timestamptz`), даты поставки и окна вылова — тип `date` (локальная дата Ташкента). Отображение — `Asia/Tashkent`.
- **Идентификаторы** — UUID. Человекочитаемые номера: заявки `RQ-2026-000123`, заказы `FO-2026-000123`, споры `DS-2026-000045`, счета на комиссию `CM-2026-000010` (сквозная нумерация по типу и году).
- **API** — REST, префикс `/api/v1`, JSON в camelCase, ошибки в едином формате (раздел 10.2), пагинация курсором.
- **Изоляция данных** — любой запрос к данным организации проходит через guard, проверяющий членство пользователя в организации (`x-org-id` в заголовке или org из ресурса). Это обязательное требование, покрывается e2e-тестами.
- **Строки интерфейса** — только через ключи i18n (`packages/i18n`), никаких захардкоженных текстов. Ключи по модулям: `listings.form.volume.label`.
- **Бизнес-логика** — чистые функции в `packages/domain` (переходы статусов, расчёт сумм и комиссий, скоринг подбора) с модульными тестами; сервисы NestJS вызывают их.
- **Миграции** — только через `prisma migrate dev` с осмысленным именем; применённые миграции не редактировать.
- **Коммиты** — Conventional Commits (`feat(orders): ...`, `fix(auth): ...`).
- **Секреты** — только через переменные окружения; `.env.example` поддерживается актуальным.
- **Логи** — без персональных данных (номер телефона маскируется: `+99890*****67`).

---

## 7. Модель данных

### 7.1. Принципы

- Эталонная схема ниже — **обязательная по смыслу** и проходит `prisma validate` (Prisma 5). При реализации допускается добавлять индексы, служебные поля и обратные связи, если `prisma validate` того требует, но не менять смысл сущностей, статусов и правил.
- Ссылки на пользователя-автора (`createdById`, `operatorId` и т.п.) хранятся как UUID без связи Prisma, чтобы не раздувать модель `User`; существование проверяется в сервисе.
- Удаление: бизнес-сущности не удаляются физически — используются статусы (`ARCHIVED`, `CANCELLED`). Физически удаляются только черновики и просроченные OTP.
- Все суммы — `BigInt` (UZS), все веса — `Decimal(12,3)` (кг), координаты — `Decimal(9,6)`.

### 7.2. Prisma-схема (packages/db/prisma/schema.prisma)

```prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

// ===================== ENUMS =====================

enum PlatformRole {
  USER
  OPERATOR
  ADMIN
}
enum Locale {
  uz
  ru
}
enum UserStatus {
  ACTIVE
  BLOCKED
}
enum OtpPurpose {
  LOGIN
}
enum PushPlatform {
  ANDROID
  IOS
  WEB
}

enum OrgType {
  SELLER
  BUYER
  CARRIER
}
enum LegalForm {
  INDIVIDUAL
  SOLE_PROPRIETOR
  LLC
  FARM_ENTERPRISE
  DEHKAN_FARM
  OTHER
}
enum VerificationStatus {
  UNVERIFIED
  PENDING
  VERIFIED
  REJECTED
  SUSPENDED
}
enum MemberRole {
  OWNER
  MANAGER
  STAFF
}

enum WaterBodyType {
  POND
  RAS
  CAGE
  RACEWAY
  OTHER
}
enum ProductForm {
  LIVE
  CHILLED
}
enum PriceType {
  FIXED
  NEGOTIABLE
}
enum ListingKind {
  AVAILABLE_NOW
  FUTURE_HARVEST
}
enum ListingStatus {
  DRAFT
  ACTIVE
  PAUSED
  SOLD_OUT
  EXPIRED
  ARCHIVED
}

enum RequestStatus {
  DRAFT
  PENDING_REVIEW
  OPEN
  OFFERS_RECEIVED
  ORDERED
  CANCELLED
  EXPIRED
}
enum OfferStatus {
  PENDING
  ACCEPTED
  PARTIALLY_ACCEPTED
  REJECTED
  WITHDRAWN
  EXPIRED
}

enum OrderStatus {
  DRAFT                        // собирается оператором
  PENDING_SELLER_CONFIRMATION  // ждём подтверждения строк продавцами
  CONFIRMED                    // все активные строки подтверждены
  LOGISTICS_ASSIGNED           // назначен перевозчик (или самовывоз согласован)
  LOADING                      // идёт вылов/погрузка
  IN_TRANSIT                   // в пути
  DELIVERED                    // доставлено, ждём приёмку
  ACCEPTED                     // приёмка оформлена по всем строкам
  COMPLETED                    // оплата подтверждена, сделка закрыта
  DISPUTED                     // открыт спор
  CANCELLED
}
enum OrderLineStatus {
  PENDING
  CONFIRMED
  DECLINED
  LOADED
  DELIVERED
  ACCEPTED
  CANCELLED
}
enum DeliveryType {
  PLATFORM_CARRIER
  BUYER_PICKUP
  SELLER_DELIVERY
}
enum PaymentTerms {
  ON_DELIVERY
  PREPAID
  PARTIAL_PREPAID
}

enum VehicleType {
  LIVE_FISH_TANK
  REFRIGERATED
  ISOTHERMAL
  OTHER
}
enum ShipmentStatus {
  PLANNED
  ASSIGNED
  EN_ROUTE_TO_PICKUP
  LOADING
  IN_TRANSIT
  DELIVERED
  CANCELLED
}
enum StopType {
  PICKUP
  DROPOFF
}

enum PaymentDirection {
  BUYER_TO_SELLER
  BUYER_TO_CARRIER
  SELLER_TO_PLATFORM
}
enum PaymentMethod {
  CASH
  BANK_TRANSFER
  CARD
  OTHER
}
enum PaymentStatus {
  PENDING
  CONFIRMED
  REJECTED
}
enum CommissionStatus {
  ACCRUED
  INVOICED
  PAID
  WAIVED
}
enum CommissionInvoiceStatus {
  ISSUED
  PAID
  CANCELLED
}

enum DocumentType {
  ORDER_CONFIRMATION
  ACCEPTANCE_ACT
  WAYBILL
  VET_CERTIFICATE
  INVOICE
  COMMISSION_INVOICE
  OTHER
}
enum DisputeReason {
  UNDERWEIGHT
  DEAD_FISH
  WRONG_SIZE
  WRONG_SPECIES
  LATE_DELIVERY
  NO_SHOW
  PAYMENT
  OTHER
}
enum DisputeStatus {
  OPEN
  UNDER_REVIEW
  RESOLVED
  REJECTED
}

enum NotificationChannel {
  IN_APP
  PUSH
  SMS
  TELEGRAM
}
enum NotificationStatus {
  QUEUED
  SENT
  FAILED
  READ
}
enum MediaKind {
  IMAGE
  VIDEO
  PDF
  OTHER
}
enum MediaStatus {
  PENDING_UPLOAD
  UPLOADED
  PROCESSED
  REJECTED
}
enum TaskStatus {
  OPEN
  DONE
  CANCELLED
}

// ===================== IDENTITY =====================

model User {
  id             String       @id @default(uuid()) @db.Uuid
  phone          String       @unique              // +998XXXXXXXXX
  fullName       String?
  locale         Locale       @default(uz)
  platformRole   PlatformRole @default(USER)
  status         UserStatus   @default(ACTIVE)
  telegramChatId String?      @unique
  lastLoginAt    DateTime?
  createdAt      DateTime     @default(now())
  updatedAt      DateTime     @updatedAt

  memberships       Membership[]
  sessions          Session[]
  pushDevices       PushDevice[]
  notifications     Notification[]
  notificationPrefs NotificationPreference[]
  messages          Message[]
  uploadedMedia     MediaFile[]
}

model OtpCode {
  id         String     @id @default(uuid()) @db.Uuid
  phone      String
  purpose    OtpPurpose
  codeHash   String                                 // bcrypt/argon2 хэш, код не хранится
  attempts   Int        @default(0)
  expiresAt  DateTime
  consumedAt DateTime?
  createdAt  DateTime   @default(now())

  @@index([phone, createdAt])
}

model Session {
  id               String    @id @default(uuid()) @db.Uuid
  userId           String    @db.Uuid
  refreshTokenHash String    @unique
  familyId         String    @db.Uuid                // цепочка ротации для обнаружения повторного использования
  userAgent        String?
  ip               String?
  expiresAt        DateTime
  revokedAt        DateTime?
  createdAt        DateTime  @default(now())
  user             User      @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@index([userId])
  @@index([familyId])
}

model PushDevice {
  id         String       @id @default(uuid()) @db.Uuid
  userId     String       @db.Uuid
  platform   PushPlatform
  token      String       @unique
  lastSeenAt DateTime     @default(now())
  createdAt  DateTime     @default(now())
  user       User         @relation(fields: [userId], references: [id], onDelete: Cascade)
}

model TelegramLinkCode {
  id        String    @id @default(uuid()) @db.Uuid
  userId    String    @db.Uuid
  code      String    @unique                         // одноразовый, для deep-link t.me/<bot>?start=<code>
  expiresAt DateTime
  usedAt    DateTime?
  createdAt DateTime  @default(now())
}

// ===================== ORGANIZATIONS =====================

model Organization {
  id                 String             @id @default(uuid()) @db.Uuid
  type               OrgType
  legalForm          LegalForm
  name               String
  tin                String?                          // СТИР (ИНН), 9 цифр
  regionId           Int?
  districtName       String?
  legalAddress       String?
  description        String?
  contactPhone       String?
  verificationStatus VerificationStatus @default(UNVERIFIED)
  verificationNote   String?
  verifiedAt         DateTime?
  verifiedById       String?            @db.Uuid
  commissionRateBps  Int?                             // индивидуальная ставка; null = из настроек
  ratingAvg          Decimal?           @db.Decimal(3, 2)
  ratingCount        Int                @default(0)
  reliabilityScore   Decimal?           @db.Decimal(5, 2)  // 0..100
  completedOrders    Int                @default(0)
  cancelledByOrg     Int                @default(0)
  declinedLines      Int                @default(0)
  createdAt          DateTime           @default(now())
  updatedAt          DateTime           @updatedAt

  region             Region?             @relation(fields: [regionId], references: [id])
  members            Membership[]
  addresses          Address[]
  farms              Farm[]
  listings           Listing[]
  requests           BuyerRequest[]
  offers             Offer[]
  buyerOrders        Order[]
  sellerLines        OrderLine[]
  vehicles           Vehicle[]
  shipments          Shipment[]
  paymentsPaid       Payment[]           @relation("PaymentPayer")
  paymentsReceived   Payment[]           @relation("PaymentPayee")
  commissions        Commission[]
  commissionInvoices CommissionInvoice[]
  reviewsGiven       Review[]            @relation("ReviewFrom")
  reviewsReceived    Review[]            @relation("ReviewTo")
  disputesOpened     Dispute[]
  crmNotes           CrmNote[]
  media              MediaFile[]

  @@index([type, verificationStatus])
  @@index([tin])
}

model Membership {
  id        String       @id @default(uuid()) @db.Uuid
  userId    String       @db.Uuid
  orgId     String       @db.Uuid
  role      MemberRole
  createdAt DateTime     @default(now())
  user      User         @relation(fields: [userId], references: [id], onDelete: Cascade)
  org       Organization @relation(fields: [orgId], references: [id], onDelete: Cascade)

  @@unique([userId, orgId])
  @@index([orgId])
}

model Address {
  id           String         @id @default(uuid()) @db.Uuid
  orgId        String         @db.Uuid
  label        String                                  // «Ресторан на Чиланзаре»
  addressText  String
  regionId     Int
  districtName String?
  lat          Decimal        @db.Decimal(9, 6)
  lng          Decimal        @db.Decimal(9, 6)
  contactName  String?
  contactPhone String?
  workingHours String?                                 // «08:00–11:00 приёмка»
  isDefault    Boolean        @default(false)
  isArchived   Boolean        @default(false)
  createdAt    DateTime       @default(now())
  org          Organization   @relation(fields: [orgId], references: [id])
  region       Region         @relation(fields: [regionId], references: [id])
  requests     BuyerRequest[]
  orders       Order[]
}

// ===================== DICTIONARIES =====================

model Region {
  id         Int            @id @default(autoincrement())
  code       String         @unique                    // TASHKENT_CITY, SAMARKAND …
  nameUz     String
  nameRu     String
  sort       Int            @default(0)
  orgs       Organization[]
  farms      Farm[]
  addresses  Address[]
  priceIndex PriceIndex[]
}

model FishSpecies {
  id          Int            @id @default(autoincrement())
  code        String         @unique                   // CARP, SILVER_CARP …
  nameUz      String
  nameRu      String
  nameLatin   String?
  isActive    Boolean        @default(true)
  sort        Int            @default(0)
  sizeClasses SizeClass[]
  listings    Listing[]
  requests    BuyerRequest[]
  orderLines  OrderLine[]
  priceIndex  PriceIndex[]
}

model SizeClass {
  id         Int            @id @default(autoincrement())
  speciesId  Int
  code       String                                     // "1-2"
  minKg      Decimal        @db.Decimal(6, 3)
  maxKg      Decimal?       @db.Decimal(6, 3)           // null = «и больше»
  labelUz    String
  labelRu    String
  isActive   Boolean        @default(true)
  sort       Int            @default(0)
  species    FishSpecies    @relation(fields: [speciesId], references: [id])
  listings   Listing[]
  requests   BuyerRequest[]
  orderLines OrderLine[]
  priceIndex PriceIndex[]

  @@unique([speciesId, code])
}

// ===================== SUPPLY =====================

model Farm {
  id             String          @id @default(uuid()) @db.Uuid
  sellerOrgId    String          @db.Uuid
  name           String
  regionId       Int
  districtName   String?
  addressText    String?
  lat            Decimal         @db.Decimal(9, 6)
  lng            Decimal         @db.Decimal(9, 6)
  waterBodyTypes WaterBodyType[]
  areaHa         Decimal?        @db.Decimal(10, 2)
  description    String?
  isActive       Boolean         @default(true)
  createdAt      DateTime        @default(now())
  updatedAt      DateTime        @updatedAt
  seller         Organization    @relation(fields: [sellerOrgId], references: [id])
  region         Region          @relation(fields: [regionId], references: [id])
  listings       Listing[]
  offers         Offer[]
  orderLines     OrderLine[]
  media          MediaFile[]

  @@index([sellerOrgId])
  @@index([regionId])
}

model Listing {
  id              String        @id @default(uuid()) @db.Uuid
  sellerOrgId     String        @db.Uuid
  farmId          String        @db.Uuid
  speciesId       Int
  sizeClassId     Int
  form            ProductForm
  kind            ListingKind   @default(AVAILABLE_NOW)
  volumeKg        Decimal       @db.Decimal(12, 3)       // заявленный объём
  reservedKg      Decimal       @default(0) @db.Decimal(12, 3)  // под подтверждённые строки
  soldKg          Decimal       @default(0) @db.Decimal(12, 3)  // по принятым строкам
  minOrderKg      Decimal       @db.Decimal(12, 3)
  priceType       PriceType
  pricePerKg      BigInt?                                // UZS; null при NEGOTIABLE
  availableFrom   DateTime      @db.Date                 // начало окна вылова
  availableTo     DateTime?     @db.Date                 // конец окна (null = до отмены)
  description     String?
  status          ListingStatus @default(DRAFT)
  lastConfirmedAt DateTime?                              // последнее подтверждение актуальности
  publishedAt     DateTime?
  createdById     String        @db.Uuid
  createdAt       DateTime      @default(now())
  updatedAt       DateTime      @updatedAt
  seller          Organization  @relation(fields: [sellerOrgId], references: [id])
  farm            Farm          @relation(fields: [farmId], references: [id])
  species         FishSpecies   @relation(fields: [speciesId], references: [id])
  sizeClass       SizeClass     @relation(fields: [sizeClassId], references: [id])
  offers          Offer[]
  orderLines      OrderLine[]
  media           MediaFile[]

  @@index([status, speciesId, sizeClassId, form])
  @@index([sellerOrgId, status])
  @@index([farmId])
}

// ===================== DEMAND =====================

model BuyerRequest {
  id                String        @id @default(uuid()) @db.Uuid
  number            String        @unique               // RQ-2026-000123
  buyerOrgId        String        @db.Uuid
  createdById       String        @db.Uuid
  createdByOperator Boolean       @default(false)       // создана оператором по звонку
  speciesId         Int
  sizeClassId       Int
  acceptAdjacentSizes Boolean     @default(false)       // готов на соседний размерный класс
  form              ProductForm
  volumeKg          Decimal       @db.Decimal(12, 3)
  minAcceptableKg   Decimal?      @db.Decimal(12, 3)    // минимальный объём, при котором сделка имеет смысл
  deliveryAddressId String        @db.Uuid
  deliveryDateFrom  DateTime      @db.Date
  deliveryDateTo    DateTime      @db.Date
  targetPricePerKg  BigInt?
  radiusKm          Int           @default(150)
  isRecurringInterest Boolean     @default(false)       // «нужно регулярно» — информативно в MVP
  notes             String?
  status            RequestStatus @default(DRAFT)
  expiresAt         DateTime
  submittedAt       DateTime?
  createdAt         DateTime      @default(now())
  updatedAt         DateTime      @updatedAt
  buyer             Organization  @relation(fields: [buyerOrgId], references: [id])
  species           FishSpecies   @relation(fields: [speciesId], references: [id])
  sizeClass         SizeClass     @relation(fields: [sizeClassId], references: [id])
  deliveryAddress   Address       @relation(fields: [deliveryAddressId], references: [id])
  offers            Offer[]
  orders            Order[]
  notifiedSellers   RequestNotification[]

  @@index([status, speciesId])
  @@index([buyerOrgId, status])
}

/// Кому из продавцов и когда разослана заявка (чтобы не спамить повторно)
model RequestNotification {
  id          String       @id @default(uuid()) @db.Uuid
  requestId   String       @db.Uuid
  sellerOrgId String       @db.Uuid
  listingId   String?      @db.Uuid
  score       Decimal      @db.Decimal(6, 3)
  notifiedAt  DateTime     @default(now())
  viewedAt    DateTime?
  request     BuyerRequest @relation(fields: [requestId], references: [id], onDelete: Cascade)

  @@unique([requestId, sellerOrgId])
}

model Offer {
  id            String       @id @default(uuid()) @db.Uuid
  requestId     String       @db.Uuid
  sellerOrgId   String       @db.Uuid
  farmId        String       @db.Uuid
  listingId     String?      @db.Uuid
  createdById   String       @db.Uuid
  volumeKg      Decimal      @db.Decimal(12, 3)
  pricePerKg    BigInt
  availableDate DateTime     @db.Date                    // дата, когда готов отгрузить
  comment       String?
  status        OfferStatus  @default(PENDING)
  acceptedKg    Decimal?     @db.Decimal(12, 3)
  validUntil    DateTime
  createdAt     DateTime     @default(now())
  updatedAt     DateTime     @updatedAt
  request       BuyerRequest @relation(fields: [requestId], references: [id])
  seller        Organization @relation(fields: [sellerOrgId], references: [id])
  farm          Farm         @relation(fields: [farmId], references: [id])
  listing       Listing?     @relation(fields: [listingId], references: [id])
  orderLines    OrderLine[]

  @@index([requestId, status])
  @@index([sellerOrgId, status])
}

// ===================== ORDERS =====================

model Order {
  id                     String        @id @default(uuid()) @db.Uuid
  number                 String        @unique          // FO-2026-000123
  buyerOrgId             String        @db.Uuid
  requestId              String?       @db.Uuid
  createdById            String        @db.Uuid
  operatorId             String?       @db.Uuid         // ответственный оператор
  status                 OrderStatus   @default(DRAFT)
  deliveryType           DeliveryType
  deliveryAddressId      String?       @db.Uuid
  deliveryAddressSnapshot Json                          // копия адреса на момент заказа
  deliveryDate           DateTime      @db.Date
  deliveryWindow         String?                        // «06:00–09:00»
  paymentTerms           PaymentTerms  @default(ON_DELIVERY)
  prepaymentPercent      Int?
  plannedAmount          BigInt        @default(0)      // Σ plannedKg × price
  finalAmount            BigInt?                        // Σ по приёмке
  logisticsAmount        BigInt?                        // стоимость перевозки (информативно)
  buyerNote              String?
  cancelReason           String?
  cancelledById          String?       @db.Uuid
  cancelledAt            DateTime?
  confirmedAt            DateTime?
  deliveredAt            DateTime?
  acceptedAt             DateTime?
  completedAt            DateTime?
  createdAt              DateTime      @default(now())
  updatedAt              DateTime      @updatedAt
  buyer                  Organization  @relation(fields: [buyerOrgId], references: [id])
  request                BuyerRequest? @relation(fields: [requestId], references: [id])
  deliveryAddress        Address?      @relation(fields: [deliveryAddressId], references: [id])
  lines                  OrderLine[]
  events                 OrderEvent[]
  shipments              Shipment[]
  payments               Payment[]
  documents              Document[]
  disputes               Dispute[]
  messages               Message[]
  reviews                Review[]

  @@index([buyerOrgId, status])
  @@index([status, deliveryDate])
  @@index([operatorId, status])
}

model OrderLine {
  id                String          @id @default(uuid()) @db.Uuid
  orderId           String          @db.Uuid
  sellerOrgId       String          @db.Uuid
  farmId            String          @db.Uuid
  listingId         String?         @db.Uuid
  offerId           String?         @db.Uuid
  speciesId         Int
  sizeClassId       Int
  form              ProductForm
  plannedKg         Decimal         @db.Decimal(12, 3)
  pricePerKg        BigInt
  plannedAmount     BigInt
  actualKg          Decimal?        @db.Decimal(12, 3)  // взвешено при приёмке (всего)
  deadKg            Decimal?        @db.Decimal(12, 3)  // снулая
  rejectedKg        Decimal?        @db.Decimal(12, 3)  // отбраковано (не тот размер и т.п.)
  payableKg         Decimal?        @db.Decimal(12, 3)  // к оплате по правилам (раздел 8.8)
  finalAmount       BigInt?
  adjustmentAmount  BigInt          @default(0)         // корректировка по спору (может быть < 0)
  commissionRateBps Int                                 // снимок ставки на момент создания строки
  status            OrderLineStatus @default(PENDING)
  sellerConfirmedAt DateTime?
  sellerConfirmedById String?       @db.Uuid
  declineReason     String?
  loadedAt          DateTime?
  createdAt         DateTime        @default(now())
  updatedAt         DateTime        @updatedAt
  order             Order           @relation(fields: [orderId], references: [id])
  seller            Organization    @relation(fields: [sellerOrgId], references: [id])
  farm              Farm            @relation(fields: [farmId], references: [id])
  listing           Listing?        @relation(fields: [listingId], references: [id])
  offer             Offer?          @relation(fields: [offerId], references: [id])
  species           FishSpecies     @relation(fields: [speciesId], references: [id])
  sizeClass         SizeClass       @relation(fields: [sizeClassId], references: [id])
  acceptance        Acceptance?
  commission        Commission?
  documents         Document[]
  disputes          Dispute[]

  @@index([orderId])
  @@index([sellerOrgId, status])
}

/// Лента событий заказа (таймлайн в интерфейсе)
model OrderEvent {
  id          String       @id @default(uuid()) @db.Uuid
  orderId     String       @db.Uuid
  type        String                                     // STATUS_CHANGED, LINE_CONFIRMED, SHIPMENT_ASSIGNED …
  fromStatus  String?
  toStatus    String?
  actorUserId String?      @db.Uuid
  actorRole   String?                                    // BUYER/SELLER/CARRIER/OPERATOR/SYSTEM
  payload     Json?
  createdAt   DateTime     @default(now())
  order       Order        @relation(fields: [orderId], references: [id], onDelete: Cascade)

  @@index([orderId, createdAt])
}

// ===================== LOGISTICS =====================

model Vehicle {
  id            String       @id @default(uuid()) @db.Uuid
  carrierOrgId  String       @db.Uuid
  plateNumber   String
  type          VehicleType
  capacityKg    Decimal      @db.Decimal(12, 3)
  tanksCount    Int?
  hasAeration   Boolean      @default(false)
  regionIds     Int[]                                   // регионы работы
  tariffPerKm   BigInt?
  minTripPrice  BigInt?
  isActive      Boolean      @default(true)
  createdAt     DateTime     @default(now())
  updatedAt     DateTime     @updatedAt
  carrier       Organization @relation(fields: [carrierOrgId], references: [id])
  shipments     Shipment[]

  @@unique([carrierOrgId, plateNumber])
}

model Shipment {
  id                String         @id @default(uuid()) @db.Uuid
  orderId           String         @db.Uuid
  carrierOrgId      String?        @db.Uuid
  vehicleId         String?        @db.Uuid
  driverName        String?
  driverPhone       String?
  status            ShipmentStatus @default(PLANNED)
  plannedPickupAt   DateTime?
  plannedDeliveryAt DateTime?
  price             BigInt?
  distanceKm        Decimal?       @db.Decimal(8, 1)
  notes             String?
  createdAt         DateTime       @default(now())
  updatedAt         DateTime       @updatedAt
  order             Order          @relation(fields: [orderId], references: [id])
  carrier           Organization?  @relation(fields: [carrierOrgId], references: [id])
  vehicle           Vehicle?       @relation(fields: [vehicleId], references: [id])
  stops             ShipmentStop[]

  @@index([carrierOrgId, status])
  @@index([orderId])
}

model ShipmentStop {
  id              String    @id @default(uuid()) @db.Uuid
  shipmentId      String    @db.Uuid
  sequence        Int
  type            StopType
  farmId          String?   @db.Uuid                    // для PICKUP
  orderLineIds    String[]  @db.Uuid                    // какие строки грузятся на этой точке
  addressSnapshot Json
  plannedAt       DateTime?
  arrivedAt       DateTime?
  departedAt      DateTime?
  shipment        Shipment  @relation(fields: [shipmentId], references: [id], onDelete: Cascade)

  @@unique([shipmentId, sequence])
}

// ===================== ACCEPTANCE, MONEY, DOCUMENTS =====================

model Acceptance {
  id            String      @id @default(uuid()) @db.Uuid
  orderLineId   String      @unique @db.Uuid
  actualKg      Decimal     @db.Decimal(12, 3)
  deadKg        Decimal     @default(0) @db.Decimal(12, 3)
  rejectedKg    Decimal     @default(0) @db.Decimal(12, 3)
  qualityNote   String?
  signerName    String?
  acceptedById  String      @db.Uuid
  acceptedAt    DateTime    @default(now())
  clientRequestId String?   @unique                     // идемпотентность при офлайн-повторе
  orderLine     OrderLine   @relation(fields: [orderLineId], references: [id])
  media         MediaFile[]
}

model Payment {
  id            String           @id @default(uuid()) @db.Uuid
  orderId       String           @db.Uuid
  direction     PaymentDirection
  payerOrgId    String?          @db.Uuid
  payeeOrgId    String?          @db.Uuid
  amount        BigInt
  method        PaymentMethod
  status        PaymentStatus    @default(PENDING)
  reference     String?                                  // № платёжки, комментарий
  proofMediaId  String?          @db.Uuid
  recordedById  String           @db.Uuid
  confirmedById String?          @db.Uuid
  confirmedAt   DateTime?
  rejectReason  String?
  createdAt     DateTime         @default(now())
  order         Order            @relation(fields: [orderId], references: [id])
  payer         Organization?    @relation("PaymentPayer", fields: [payerOrgId], references: [id])
  payee         Organization?    @relation("PaymentPayee", fields: [payeeOrgId], references: [id])

  @@index([orderId])
}

model Commission {
  id          String             @id @default(uuid()) @db.Uuid
  orderLineId String             @unique @db.Uuid
  sellerOrgId String             @db.Uuid
  rateBps     Int
  baseAmount  BigInt
  amount      BigInt
  status      CommissionStatus   @default(ACCRUED)
  invoiceId   String?            @db.Uuid
  accruedAt   DateTime           @default(now())
  paidAt      DateTime?
  orderLine   OrderLine          @relation(fields: [orderLineId], references: [id])
  seller      Organization       @relation(fields: [sellerOrgId], references: [id])
  invoice     CommissionInvoice? @relation(fields: [invoiceId], references: [id])

  @@index([sellerOrgId, status])
}

model CommissionInvoice {
  id          String                  @id @default(uuid()) @db.Uuid
  number      String                  @unique           // CM-2026-000010
  sellerOrgId String                  @db.Uuid
  periodFrom  DateTime                @db.Date
  periodTo    DateTime                @db.Date
  totalAmount BigInt
  status      CommissionInvoiceStatus @default(ISSUED)
  documentId  String?                 @db.Uuid
  dueDate     DateTime                @db.Date
  issuedAt    DateTime                @default(now())
  paidAt      DateTime?
  seller      Organization            @relation(fields: [sellerOrgId], references: [id])
  commissions Commission[]
}

model Document {
  id          String       @id @default(uuid()) @db.Uuid
  type        DocumentType
  number      String?
  orderId     String?      @db.Uuid
  orderLineId String?      @db.Uuid
  mediaFileId String       @db.Uuid
  isGenerated Boolean      @default(false)
  createdById String?      @db.Uuid
  createdAt   DateTime     @default(now())
  order       Order?       @relation(fields: [orderId], references: [id])
  orderLine   OrderLine?   @relation(fields: [orderLineId], references: [id])
  mediaFile   MediaFile    @relation(fields: [mediaFileId], references: [id])

  @@index([orderId])
}

// ===================== DISPUTES, REVIEWS, CHAT =====================

model Dispute {
  id               String        @id @default(uuid()) @db.Uuid
  number           String        @unique                // DS-2026-000045
  orderId          String        @db.Uuid
  orderLineId      String?       @db.Uuid
  openedByUserId   String        @db.Uuid
  openedByOrgId    String        @db.Uuid
  reason           DisputeReason
  description      String
  status           DisputeStatus @default(OPEN)
  resolution       String?
  adjustmentAmount BigInt?                              // итоговая корректировка суммы строки
  resolvedById     String?       @db.Uuid
  resolvedAt       DateTime?
  createdAt        DateTime      @default(now())
  updatedAt        DateTime      @updatedAt
  order            Order         @relation(fields: [orderId], references: [id])
  orderLine        OrderLine?    @relation(fields: [orderLineId], references: [id])
  openedByOrg      Organization  @relation(fields: [openedByOrgId], references: [id])
  media            MediaFile[]

  @@index([status])
}

model Review {
  id                 String       @id @default(uuid()) @db.Uuid
  orderId            String       @db.Uuid
  fromOrgId          String       @db.Uuid
  toOrgId            String       @db.Uuid
  authorUserId       String       @db.Uuid
  scoreReliability   Int                                 // 1..5
  scoreQuality       Int                                 // 1..5 (соответствие веса/размера/качества; для перевозчика — сохранность)
  scorePunctuality   Int                                 // 1..5
  scoreCommunication Int                                 // 1..5
  comment            String?
  isPublished        Boolean      @default(false)
  publishedAt        DateTime?
  createdAt          DateTime     @default(now())
  order              Order        @relation(fields: [orderId], references: [id])
  fromOrg            Organization @relation("ReviewFrom", fields: [fromOrgId], references: [id])
  toOrg              Organization @relation("ReviewTo", fields: [toOrgId], references: [id])

  @@unique([orderId, fromOrgId, toOrgId])
  @@index([toOrgId, isPublished])
}

model Message {
  id           String      @id @default(uuid()) @db.Uuid
  orderId      String      @db.Uuid
  senderUserId String      @db.Uuid
  senderOrgId  String?     @db.Uuid                      // null для оператора
  text         String?
  isSystem     Boolean     @default(false)
  createdAt    DateTime    @default(now())
  order        Order       @relation(fields: [orderId], references: [id])
  sender       User        @relation(fields: [senderUserId], references: [id])
  media        MediaFile[]
  reads        MessageRead[]

  @@index([orderId, createdAt])
}

model MessageRead {
  messageId String   @db.Uuid
  userId    String   @db.Uuid
  readAt    DateTime @default(now())
  message   Message  @relation(fields: [messageId], references: [id], onDelete: Cascade)

  @@id([messageId, userId])
}

// ===================== MEDIA =====================

model MediaFile {
  id           String        @id @default(uuid()) @db.Uuid
  uploaderId   String        @db.Uuid
  kind         MediaKind
  status       MediaStatus   @default(PENDING_UPLOAD)
  storageKey   String        @unique
  mimeType     String
  sizeBytes    Int
  width        Int?
  height       Int?
  durationSec  Int?
  thumbnailKey String?
  orgId        String?       @db.Uuid                    // документы верификации
  farmId       String?       @db.Uuid
  listingId    String?       @db.Uuid
  messageId    String?       @db.Uuid
  acceptanceId String?       @db.Uuid
  disputeId    String?       @db.Uuid
  createdAt    DateTime      @default(now())
  uploader     User          @relation(fields: [uploaderId], references: [id])
  org          Organization? @relation(fields: [orgId], references: [id])
  farm         Farm?         @relation(fields: [farmId], references: [id])
  listing      Listing?      @relation(fields: [listingId], references: [id])
  message      Message?      @relation(fields: [messageId], references: [id])
  acceptance   Acceptance?   @relation(fields: [acceptanceId], references: [id])
  dispute      Dispute?      @relation(fields: [disputeId], references: [id])
  documents    Document[]
}

// ===================== NOTIFICATIONS =====================

model Notification {
  id        String              @id @default(uuid()) @db.Uuid
  userId    String              @db.Uuid
  eventType String                                       // ключ из каталога, напр. order.line.confirmation_requested
  channel   NotificationChannel
  title     String
  body      String
  data      Json?                                        // deep link, id сущностей
  status    NotificationStatus  @default(QUEUED)
  error     String?
  sentAt    DateTime?
  readAt    DateTime?
  createdAt DateTime            @default(now())
  user      User                @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@index([userId, channel, createdAt])
}

model NotificationPreference {
  id        String                @id @default(uuid()) @db.Uuid
  userId    String                @db.Uuid
  eventType String
  channels  NotificationChannel[]
  user      User                  @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@unique([userId, eventType])
}

// ===================== ANALYTICS, OPS, SYSTEM =====================

model PriceIndex {
  id            String      @id @default(uuid()) @db.Uuid
  speciesId     Int
  sizeClassId   Int
  regionId      Int?                                     // null = вся страна (уникальность — частичный индекс в миграции)
  weekStart     DateTime    @db.Date                     // понедельник
  form          ProductForm
  avgPricePerKg BigInt                                   // средняя, взвешенная по кг
  minPricePerKg BigInt
  maxPricePerKg BigInt
  dealsCount    Int
  volumeKg      Decimal     @db.Decimal(14, 3)
  computedAt    DateTime    @default(now())
  species       FishSpecies @relation(fields: [speciesId], references: [id])
  sizeClass     SizeClass   @relation(fields: [sizeClassId], references: [id])
  region        Region?     @relation(fields: [regionId], references: [id])

  @@index([speciesId, sizeClassId, weekStart])
}

model CrmNote {
  id        String       @id @default(uuid()) @db.Uuid
  orgId     String       @db.Uuid
  authorId  String       @db.Uuid
  text      String
  createdAt DateTime     @default(now())
  org       Organization @relation(fields: [orgId], references: [id])
}

model OpsTask {
  id          String     @id @default(uuid()) @db.Uuid
  title       String
  description String?
  type        String                                     // UNMATCHED_REQUEST, LINE_CONFIRMATION_TIMEOUT, VERIFY_ORG, CALL_BACK …
  assigneeId  String?    @db.Uuid
  orgId       String?    @db.Uuid
  orderId     String?    @db.Uuid
  requestId   String?    @db.Uuid
  disputeId   String?    @db.Uuid
  dueAt       DateTime?
  status      TaskStatus @default(OPEN)
  createdById String?    @db.Uuid                       // null = создана системой
  createdAt   DateTime   @default(now())
  updatedAt   DateTime   @updatedAt

  @@index([status, dueAt])
}

model AuditLog {
  id          String   @id @default(uuid()) @db.Uuid
  actorUserId String?  @db.Uuid
  actorRole   String?
  impersonatorId String? @db.Uuid                        // если оператор действовал «от имени»
  action      String                                     // order.cancel, org.verify, settings.update …
  entityType  String
  entityId    String
  before      Json?
  after       Json?
  ip          String?
  userAgent   String?
  createdAt   DateTime @default(now())

  @@index([entityType, entityId])
  @@index([actorUserId, createdAt])
}

model Setting {
  key         String   @id                               // commission.defaultRateBps …
  value       Json
  updatedById String?  @db.Uuid
  updatedAt   DateTime @updatedAt
}

/// Outbox доменных событий
model DomainEvent {
  id            String    @id @default(uuid()) @db.Uuid
  type          String                                    // order.status.changed …
  aggregateType String
  aggregateId   String
  payload       Json
  createdAt     DateTime  @default(now())
  processedAt   DateTime?
  attempts      Int       @default(0)
  lastError     String?

  @@index([processedAt, createdAt])
}

/// Сквозная нумерация документов
model NumberSequence {
  key   String @id                                       // "FO-2026", "RQ-2026" …
  value Int    @default(0)
}

/// Идемпотентность запросов (офлайн-повторы из мобильного приложения)
model IdempotencyKey {
  key            String   @id
  userId         String   @db.Uuid
  method         String
  path           String
  responseStatus Int
  responseBody   Json
  createdAt      DateTime @default(now())
}
```

### 7.3. Начальные данные (seed)

**Регионы (14):** г. Ташкент (`TASHKENT_CITY`), Ташкентская (`TASHKENT`), Андижанская (`ANDIJAN`), Бухарская (`BUKHARA`), Джизакская (`JIZZAKH`), Кашкадарьинская (`KASHKADARYA`), Навоийская (`NAVOI`), Наманганская (`NAMANGAN`), Самаркандская (`SAMARKAND`), Сурхандарьинская (`SURKHANDARYA`), Сырдарьинская (`SYRDARYA`), Ферганская (`FERGANA`), Хорезмская (`KHOREZM`), Республика Каракалпакстан (`KARAKALPAKSTAN`). Названия на узбекском — латиницей (Toshkent shahri, Toshkent viloyati, Andijon, Buxoro, Jizzax, Qashqadaryo, Navoiy, Namangan, Samarqand, Surxondaryo, Sirdaryo, Farg'ona, Xorazm, Qoraqalpog'iston Respublikasi).

**Виды рыбы** (узбекские названия проверить с носителем языка до запуска):

| code | ru | uz (проверить) | latin |
|---|---|---|---|
| CARP | Карп (сазан) | Zog'ora baliq (karp) | Cyprinus carpio |
| SILVER_CARP | Толстолобик белый | Oq do'ngpeshona | Hypophthalmichthys molitrix |
| BIGHEAD_CARP | Толстолобик пёстрый | Ola do'ngpeshona | Hypophthalmichthys nobilis |
| GRASS_CARP | Белый амур | Oq amur | Ctenopharyngodon idella |
| RAINBOW_TROUT | Форель радужная | Gulmoy (forel) | Oncorhynchus mykiss |
| STURGEON | Осётр | Bekire (osetr) | Acipenser spp. |
| AFRICAN_CATFISH | Клариевый сом | Klarias laqqa baliq | Clarias gariepinus |
| TILAPIA | Тиляпия | Tilapiya | Oreochromis spp. |
| OTHER | Другое | Boshqa | — |

**Размерные классы** (редактируются администратором):

- Карп, толстолобики, амур: `0-0.5` (до 0,5 кг), `0.5-1`, `1-2`, `2-3`, `3+`.
- Форель: `0.25-0.4` (порционная), `0.4-0.7`, `0.7+`.
- Осётр: `1-3`, `3-5`, `5+`.
- Клариевый сом, тиляпия: `0.3-0.6`, `0.6-1`, `1+`.

**Настройки** — раздел 8.13. **Демо-данные** (только local/staging): 3 продавца с хозяйствами в разных регионах, 3 покупателя, 2 перевозчика, оператор и администратор, по 5–10 позиций наличия, несколько заявок и заказов в разных статусах.

---

## 8. Бизнес-процессы, статусы и правила

### 8.1. Регистрация, организации, верификация

1. Пользователь вводит номер → получает SMS-код → вводит код. Новый пользователь создаётся при первом успешном входе.
2. Если у пользователя нет организации — онбординг: выбрать тип (`SELLER` / `BUYER` / `CARRIER`), форму (`LegalForm`), название, регион, СТИР (необязателен для `INDIVIDUAL`), контактный телефон. Создатель становится `OWNER`.
3. Продавец после создания организации добавляет минимум одно хозяйство (раздел 8.2) и загружает документы для верификации (фото свидетельства о регистрации или любого подтверждающего документа, фото хозяйства) → `verificationStatus = PENDING`, создаётся `OpsTask(type = VERIFY_ORG)`.
4. Оператор проверяет (звонок, видеозвонок или выезд), ставит `VERIFIED` или `REJECTED` с комментарием. Уведомление владельцу.
5. Перевозчик проходит такую же верификацию (документы на машину).
6. Покупатель верификацию не проходит обязательно; его **первая заявка** уходит в статус `PENDING_REVIEW`, оператор подтверждает её (звонок) → `OPEN`. Последующие заявки публикуются сразу. Оператор может пометить покупателя `VERIFIED` вручную.
7. `SUSPENDED` — блокировка организации оператором: нельзя публиковать наличие, создавать заявки, предложения и заказы; текущие заказы доводятся до конца.

**Ограничения по статусу:**

| Действие | Требование |
|---|---|
| Публикация наличия, отправка предложения | Продавец `VERIFIED` |
| Создание заявки | Покупатель не `SUSPENDED` (первая — через `PENDING_REVIEW`) |
| Назначение на рейс | Перевозчик `VERIFIED` |
| Черновики, профиль, хозяйства | Любой статус, кроме `SUSPENDED` |

**Участники организации:** `OWNER` приглашает пользователя по номеру телефона и назначает роль. Если номера нет в системе, создаётся «ожидающее приглашение»: при первом входе с этим номером пользователь автоматически добавляется в организацию.

### 8.2. Хозяйства

- Обязательные поля: название, регион, координаты (точка на карте), хотя бы один тип водоёма.
- Необязательные: район, адрес текстом, площадь, описание, фото.
- Хозяйство нельзя удалить, если на нём есть активное наличие или незавершённые строки заказов; можно деактивировать (`isActive = false`) — тогда активное наличие этого хозяйства переводится в `PAUSED`.

### 8.3. Наличие (Listing)

**Поля и правила:**

- `kind = AVAILABLE_NOW` — рыба готова, окно вылова начинается не позже чем через 7 дней (настройка `listing.nowMaxDaysAhead`); `FUTURE_HARVEST` — будущий урожай (дата готовности дальше).
- `volumeKg ≥ minOrderKg ≥ settings.order.minOrderKg` (по умолчанию 100 кг).
- `priceType = FIXED` требует `pricePerKg > 0`; `NEGOTIABLE` — цена не указывается, покупатель видит «цена договорная».
- Минимум одно фото обязательно для публикации; видео контрольного облова — рекомендуется (на карточке показывается метка «есть видео облова»).
- **Доступный объём:** `availableKg = volumeKg − reservedKg − soldKg`. В поиске и подборе используется только `availableKg`.

**Статусы:**

```
DRAFT ──publish──▶ ACTIVE ◀──resume── PAUSED
  │                 │ │ │                ▲
  │                 │ │ └──pause─────────┘
  │                 │ └──availableKg ≤ 0──▶ SOLD_OUT ──(отмена резерва вернула объём)──▶ ACTIVE
  │                 └──availableTo прошла / свежесть истекла──▶ EXPIRED / PAUSED
  └──archive──▶ ARCHIVED (из любого статуса, если нет резервов)
```

- **Свежесть.** Активное наличие нужно подтверждать каждые `listing.freshnessDays` дней (по умолчанию 7). За 1 день до срока продавцу приходит напоминание с кнопками «Актуально», «Изменить объём», «Снять с продажи» (в приложении и в Telegram). Если не подтверждено — статус `PAUSED`, причина «не подтверждено», уведомление продавцу. Любое редактирование объёма или цены тоже обновляет `lastConfirmedAt`.
- Если `availableTo` в прошлом — `EXPIRED`.
- Изменение цены не влияет на уже подтверждённые строки заказов (цена фиксируется в строке).
- Уменьшить `volumeKg` ниже `reservedKg + soldKg` нельзя.

### 8.4. Заявка покупателя (BuyerRequest)

**Поля:** вид, размерный класс, «готов на соседний размер», форма, объём, минимальный приемлемый объём (по умолчанию = объём), адрес доставки (из адресов организации), окно дат доставки, ориентир цены, радиус поиска (по умолчанию 150 км), комментарий, «нужно регулярно».

**Статусы:**

```
DRAFT ──submit──▶ PENDING_REVIEW (первая заявка покупателя) ──operator approve──▶ OPEN
DRAFT ──submit──▶ OPEN (остальные)
OPEN ──первое предложение──▶ OFFERS_RECEIVED
OPEN / OFFERS_RECEIVED ──создан заказ на весь объём──▶ ORDERED
OPEN / OFFERS_RECEIVED ──создан заказ на часть объёма──▶ остаётся открытой на остаток (volumeRemaining)
любой незакрытый ──cancel──▶ CANCELLED
OPEN / OFFERS_RECEIVED ──expiresAt──▶ EXPIRED
```

- `expiresAt` = начало окна доставки или `submittedAt + request.defaultExpiryDays` (по умолчанию 5 дней) — что раньше.
- При переходе в `OPEN` запускается подбор (раздел 8.5).
- Если за `ops.unmatchedRequestHours` (по умолчанию 4 часа рабочего времени) нет ни одного предложения — создаётся `OpsTask(UNMATCHED_REQUEST)` и уведомление в ops-канал Telegram.
- Остаток объёма: `volumeRemaining = volumeKg − Σ plannedKg активных строк заказов по этой заявке`.

### 8.5. Подбор (matching)

Запускается при открытии заявки и повторно при публикации нового подходящего наличия (для открытых заявок).

**Фильтр кандидатов** (наличие `ACTIVE`, продавец `VERIFIED`):

1. `speciesId` совпадает; `sizeClassId` совпадает или соседний (по `sort`), если `acceptAdjacentSizes = true`.
2. `form` совпадает.
3. `availableKg ≥ minOrderKg` наличия и `availableKg ≥ min(request.minAcceptableKg, request.volumeKg) × splitFactor`, где `splitFactor` = 0,2 (сборный заказ допускает хозяйства, закрывающие от 20% объёма).
4. Окно вылова пересекается с окном доставки с учётом времени в пути: `availableFrom ≤ deliveryDateTo` и (`availableTo` = null или `availableTo ≥ deliveryDateFrom − transitDays`), где `transitDays = ceil(distanceKm / 400)`.
5. Расстояние от хозяйства до адреса доставки (по прямой, формула гаверсинуса) `≤ radiusKm`.

**Скоринг** (чистая функция в `packages/domain/matching`), значение 0..1, веса в настройках:

```
score = 0.35 · distanceScore      // 1 − distance/radius
      + 0.25 · priceScore         // 1, если цена ≤ target; иначе убывает; NEGOTIABLE = 0.5
      + 0.20 · reliabilityScore   // reliability/100, без истории = 0.6
      + 0.10 · freshnessScore     // 1, если подтверждено ≤ 2 дней назад, линейно до 0 к freshnessDays
      + 0.10 · volumeScore        // min(1, availableKg / volumeRemaining)
```

**Рассылка:** продавцам из топ-`matching.maxNotify` (по умолчанию 20) по лучшему наличию каждой организации отправляется уведомление «Новая заявка для вас» (in-app, push, Telegram). Одному продавцу по одной заявке — не более одного уведомления (`RequestNotification`). Продавец видит заявку в разделе «Заявки для меня», даже если уведомление не отправлялось (если проходит фильтр).

**Для оператора и покупателя** доступен список кандидатов с баллами, расстоянием, доступным объёмом и ценой; оператор может вручную «пригласить» продавца (отправить уведомление вне топа).

**Подсказка сборного заказа:** функция `suggestSplit(request, candidates)` — жадный подбор по убыванию `score` до покрытия `volumeRemaining`, не более `matching.maxLinesPerOrder` (по умолчанию 4) хозяйств; показывается оператору и покупателю как предложение, ничего не создаёт автоматически.

### 8.6. Предложения (Offer)

- Продавец отвечает на открытую заявку: хозяйство (и, по желанию, позиция наличия), объём (≥ минимального объёма наличия, ≤ доступного), цена за кг, дата отгрузки, комментарий. Срок действия — до `validUntil` (по умолчанию 24 часа, не позже `expiresAt` заявки).
- Одно активное предложение от одного хозяйства на заявку; изменить можно, пока статус `PENDING`.
- Создание предложения **не резервирует** объём — резерв появляется только при подтверждении строки заказа.
- Покупатель (или оператор от его имени) принимает одно или несколько предложений, при необходимости указывая принимаемый объём по каждому (`acceptedKg ≤ volumeKg`). Сумма принимаемых объёмов — от `minAcceptableKg` до `volumeRemaining`.
- При принятии создаётся заказ (8.7) со строками по каждому предложению; предложения получают `ACCEPTED` или `PARTIALLY_ACCEPTED`. Остальные остаются `PENDING` до истечения, если у заявки остался объём, иначе — `REJECTED`.
- Истёкшие — `EXPIRED` (фоновая задача каждые 15 минут).

### 8.7. Заказы

**Способы создания:**

1. **Из предложений** (основной) — 8.6.
2. **Напрямую из наличия** — покупатель нажимает «Заказать» на карточке с `FIXED` ценой: заказ с одной строкой по цене наличия, статус `PENDING_SELLER_CONFIRMATION`. Для `NEGOTIABLE` — создаётся заявка, адресованная этому продавцу (уведомление только ему).
3. **Сборка оператором** — по звонку покупателя: оператор выбирает покупателя, адрес, дату, добавляет строки из наличия разных хозяйств (`DRAFT`), затем отправляет на подтверждение.

**Статусная машина заказа** (реализуется как чистая функция `transitionOrder(order, action, actor)` в `packages/domain`):

| Из | Действие | В | Кто | Условие |
|---|---|---|---|---|
| DRAFT | submit | PENDING_SELLER_CONFIRMATION | оператор | ≥ 1 строка |
| PENDING_SELLER_CONFIRMATION | (авто) все активные строки CONFIRMED | CONFIRMED | система | ≥ 1 активная строка |
| PENDING_SELLER_CONFIRMATION | (авто) все строки DECLINED/CANCELLED | CANCELLED | система | — |
| CONFIRMED | assignLogistics | LOGISTICS_ASSIGNED | оператор | рейс с перевозчиком или тип доставки BUYER_PICKUP/SELLER_DELIVERY согласован |
| LOGISTICS_ASSIGNED | startLoading | LOADING | перевозчик / продавец / оператор | — |
| LOADING | (авто) рейс IN_TRANSIT или все строки LOADED | IN_TRANSIT | система | — |
| IN_TRANSIT | (авто) рейс DELIVERED / markDelivered | DELIVERED | перевозчик / покупатель / оператор | — |
| DELIVERED | (авто) все активные строки ACCEPTED | ACCEPTED | система | — |
| ACCEPTED | (авто) по каждому продавцу подтверждены платежи ≥ его итоговой суммы | COMPLETED | система | или `forceComplete` оператором с причиной |
| DELIVERED / ACCEPTED | openDispute | DISPUTED | покупатель / продавец / оператор | — |
| DISPUTED | (авто) все споры заказа закрыты | статус до спора | система | — |
| DRAFT … LOGISTICS_ASSIGNED | cancel | CANCELLED | покупатель (до CONFIRMED — свободно, после — с причиной), оператор | — |
| LOADING и позже | cancel | CANCELLED | только оператор | с причиной |

**Статусная машина строки:**

| Из | Действие | В | Кто |
|---|---|---|---|
| PENDING | confirm | CONFIRMED | продавец (OWNER/MANAGER) |
| PENDING | decline (с причиной) | DECLINED | продавец |
| PENDING | (авто) таймаут `order.sellerConfirmationTimeoutHours` (по умолчанию 6 ч) | PENDING + OpsTask оператору | система |
| CONFIRMED | markLoaded | LOADED | продавец / перевозчик / оператор |
| LOADED | markDelivered | DELIVERED | перевозчик / покупатель / оператор |
| DELIVERED | recordAcceptance | ACCEPTED | покупатель (любой член организации) / оператор |
| PENDING / CONFIRMED | cancel (с причиной) | CANCELLED | оператор; покупатель — до LOADED |

**Резервирование объёма:**

- При `confirm` строки: в транзакции с блокировкой строки наличия (`SELECT … FOR UPDATE`) проверить `availableKg ≥ plannedKg`, затем `reservedKg += plannedKg`. Если объёма не хватает — подтверждение отклоняется с ошибкой `INSUFFICIENT_VOLUME`, продавцу предлагается изменить объём строки (только в меньшую сторону, с уведомлением покупателя).
- При `cancel`/`decline` подтверждённой строки: `reservedKg −= plannedKg`.
- При `recordAcceptance`: `reservedKg −= plannedKg`, `soldKg += actualKg − rejectedKg` (не меньше 0).
- Если строка создана не из наличия (оператор ввёл вручную) — резерв не ведётся.

**Перевыбор при отказе:** если строка `DECLINED`, оператор получает задачу; он может добавить новую строку от другого хозяйства в тот же заказ (заказ возвращается в `PENDING_SELLER_CONFIRMATION`, если был `CONFIRMED` и ещё нет логистики).

**Видимость контактов:** телефоны и точный адрес контрагента показываются только после подтверждения строки (`CONFIRMED`). До этого покупатель видит регион, район и рейтинг продавца, продавец — регион доставки и тип покупателя.

### 8.8. Цены и суммы

Все расчёты — чистые функции в `packages/domain/money` с тестами.

```
plannedAmount(line)  = round(plannedKg × pricePerKg)
payableKg(line)      = actualKg − rejectedKg − (deadFishPolicy == NOT_PAID ? deadKg : 0)   // ≥ 0
finalAmount(line)    = round(payableKg × pricePerKg) + adjustmentAmount
order.plannedAmount  = Σ plannedAmount активных строк
order.finalAmount    = Σ finalAmount принятых строк
commission(line)     = round(finalAmount(line) × commissionRateBps / 10000)
```

- `round` — до целого сума, половина вверх.
- `deadFishPolicy` — настройка `order.deadFishPolicy`: `NOT_PAID` (по умолчанию для `LIVE`) или `PAID`. Для `CHILLED` снулая рыба не учитывается.
- Допуск по весу `order.weightToleranceBps` (по умолчанию 1000 = 10%): если `actualKg` отличается от `plannedKg` больше чем на допуск, строка помечается флагом `weightDeviation`, покупатель при приёмке должен подтвердить «принимаю с отклонением» или открыть спор.
- Ставка комиссии строки = `seller.commissionRateBps ?? settings.commission.defaultRateBps` (по умолчанию 200 = 2%), фиксируется в строке при создании. Продавец видит ставку и сумму комиссии до подтверждения строки.

### 8.9. Логистика

- Тип доставки задаётся в заказе: `PLATFORM_CARRIER` (перевозчик платформы), `BUYER_PICKUP` (самовывоз), `SELLER_DELIVERY` (доставляет продавец).
- Для `PLATFORM_CARRIER` оператор создаёт рейс: перевозчик, машина, водитель, телефон, точки погрузки (по хозяйствам, в порядке маршрута) и выгрузки, плановое время, цена. Система подсказывает перевозчиков, у которых машина подходит по типу (`LIVE` → `LIVE_FISH_TANK`; `CHILLED` → `REFRIGERATED`/`ISOTHERMAL`), вместимости (≥ Σ plannedKg) и региону.
- Расчёт цены-ориентира: `max(minTripPrice, distanceKm × tariffPerKm)`, где `distanceKm` — сумма отрезков маршрута по прямой × коэффициент `logistics.roadFactor` (по умолчанию 1,3). Оператор может изменить цену.
- Кто платит перевозчику — по умолчанию покупатель напрямую (`Payment.direction = BUYER_TO_CARRIER`); платформа фиксирует сумму и статус (открытый вопрос 15).
- Статусы рейса: `PLANNED → ASSIGNED` (перевозчик подтвердил) `→ EN_ROUTE_TO_PICKUP → LOADING → IN_TRANSIT → DELIVERED`; `CANCELLED` — оператор. Отметки прибытия и отъезда по точкам. Смена статуса рейса синхронизирует строки и заказ (таблица 8.7).
- Перевозчик видит только свои рейсы, адреса точек и контакты по ним, но не цены рыбы.

### 8.10. Приёмка

- Доступна, когда строка `DELIVERED` (или заказ `DELIVERED`).
- По каждой строке: фактический вес (обязательно), снулая (кг), отбраковано (кг), комментарий о качестве, минимум одно фото весов или накладной (обязательно), имя принявшего.
- После сохранения строка → `ACCEPTED`, считаются `payableKg`, `finalAmount`, создаётся `Commission(ACCRUED)`, генерируется PDF «Акт приёмки» по строке (в worker), уведомление продавцу.
- Запрос приёмки из мобильного приложения содержит `clientRequestId` — повторная отправка при плохой связи не создаёт дубль.
- Исправить приёмку может только оператор (с записью в аудит); продавец, не согласный с приёмкой, открывает спор в течение `dispute.windowHours` (по умолчанию 48 ч).
- Если покупатель не оформил приёмку за `order.acceptanceTimeoutHours` (по умолчанию 24 ч) после доставки — задача оператору.

### 8.11. Расчёты (без онлайн-оплаты)

- Платежи фиксируются вручную: «Покупатель оплатил продавцу X сум, способ, номер платёжки, фото квитанции». Записать может покупатель, продавец или оператор.
- Платёж, записанный плательщиком, подтверждает получатель (`CONFIRMED`) или отклоняет с причиной (`REJECTED`). Записанный получателем — сразу `CONFIRMED`.
- `paymentTerms`: `ON_DELIVERY` (по умолчанию) — оплата после приёмки; `PREPAID` / `PARTIAL_PREPAID` — продавец может не отгружать до подтверждения предоплаты (`prepaymentPercent`), система показывает предупреждение, но не блокирует.
- Заказ переходит в `COMPLETED`, когда по каждому продавцу сумма подтверждённых платежей `BUYER_TO_SELLER` ≥ его итоговой сумме по строкам. Оператор может закрыть принудительно с причиной.
- Просрочка оплаты: если через `payment.overdueDays` (по умолчанию 3 дня) после приёмки нет подтверждённой оплаты — уведомление покупателю и задача оператору; это учитывается в надёжности покупателя.

### 8.12. Комиссия и счета на комиссию

- Комиссия начисляется при приёмке строки (`ACCRUED`).
- Раз в период `commission.billingPeriod` (по умолчанию неделя, понедельник 09:00) worker формирует по каждому продавцу `CommissionInvoice` на все `ACCRUED` комиссии, генерирует PDF со списком строк, срок оплаты `commission.paymentDueDays` (по умолчанию 7 дней), уведомляет продавца. Комиссии → `INVOICED`.
- Оплату счёта отмечает оператор или администратор → счёт `PAID`, комиссии `PAID`.
- Если счёт просрочен больше чем на `commission.blockAfterOverdueDays` (по умолчанию 14 дней) — продавец не может отправлять новые предложения (наличие остаётся видимым), уведомление.
- Администратор может списать комиссию (`WAIVED`) с причиной.

### 8.13. Настройки платформы (Setting, значения по умолчанию)

| Ключ | По умолчанию | Описание |
|---|---|---|
| `commission.defaultRateBps` | 200 | 2% с продавца |
| `commission.billingPeriod` | `WEEK` | `WEEK` / `MONTH` |
| `commission.paymentDueDays` | 7 | |
| `commission.blockAfterOverdueDays` | 14 | |
| `order.minOrderKg` | 100 | Минимальный объём строки |
| `order.sellerConfirmationTimeoutHours` | 6 | Затем задача оператору |
| `order.acceptanceTimeoutHours` | 24 | |
| `order.weightToleranceBps` | 1000 | 10% |
| `order.deadFishPolicy` | `NOT_PAID` | Для живой рыбы |
| `listing.freshnessDays` | 7 | |
| `listing.nowMaxDaysAhead` | 7 | |
| `request.defaultExpiryDays` | 5 | |
| `request.defaultRadiusKm` | 150 | |
| `offer.defaultValidityHours` | 24 | |
| `matching.maxNotify` | 20 | |
| `matching.maxLinesPerOrder` | 4 | |
| `matching.weights` | `{distance:0.35, price:0.25, reliability:0.2, freshness:0.1, volume:0.1}` | |
| `logistics.roadFactor` | 1.3 | |
| `payment.overdueDays` | 3 | |
| `dispute.windowHours` | 48 | |
| `review.blindPeriodDays` | 7 | |
| `priceIndex.minDeals` | 3 | |
| `ops.unmatchedRequestHours` | 4 | |
| `ops.workingHours` | `{from:"08:00", to:"20:00"}` | Для SLA и тихих часов некритичных уведомлений |
| `otp.ttlSeconds` | 300 | |
| `otp.maxAttempts` | 5 | |
| `otp.resendCooldownSeconds` | 60 | |
| `otp.maxPerPhonePerHour` | 5 | |

Настройки кэшируются в Redis, меняются в админке, каждое изменение пишется в аудит.

### 8.14. Отмены

- Покупатель отменяет заказ до `CONFIRMED` без последствий; после `CONFIRMED` и до `LOADING` — с обязательной причиной, увеличивается `cancelledByOrg`.
- Продавец не отменяет заказ целиком: он отклоняет свою строку до подтверждения (`declinedLines += 1`) или после подтверждения — только через оператора (тоже учитывается в надёжности).
- С `LOADING` и позже отменяет только оператор.
- Отмена освобождает резервы, уведомляет всех участников, пишет `OrderEvent` и аудит.

### 8.15. Споры

- Открыть может покупатель или продавец по заказу в статусе `DELIVERED` или `ACCEPTED` (в течение `dispute.windowHours` после приёмки), либо оператор в любой момент. Причины — `DisputeReason`; описание и фото/видео обязательны (кроме `PAYMENT`).
- Заказ → `DISPUTED`; создаётся задача оператору; обсуждение идёт в чате заказа.
- Оператор: `OPEN → UNDER_REVIEW → RESOLVED` (с решением и, при необходимости, `adjustmentAmount` для строки) или `REJECTED`. Корректировка пересчитывает `finalAmount` строки и комиссию (если счёт уже выставлен — разница переносится в следующий счёт).
- После закрытия всех споров заказ возвращается в предыдущий статус и продолжает движение.

### 8.16. Отзывы, рейтинг, надёжность

- После `COMPLETED` (или `CANCELLED` после `CONFIRMED`) участникам предлагается оставить отзыв: покупатель ↔ каждый продавец, покупатель → перевозчик, продавец → перевозчик. Четыре оценки 1–5 и комментарий.
- **Слепые отзывы:** отзыв публикуется, когда обе стороны оставили отзыв или прошло `review.blindPeriodDays`. До публикации стороны не видят оценок друг друга.
- `ratingAvg` = среднее всех четырёх оценок по опубликованным отзывам; пересчитывается при публикации.
- **Надёжность** (0–100), сглаженная формула для малых выборок:

```
reliability = 100 × (completed + 3) / (completed + cancelledByOrg + declinedLines + overduePayments + 4)
```

  где `completed` — завершённые заказы, где организация участвовала. Показывается после ≥ 3 сделок, до этого — метка «Новый участник».

### 8.17. Ценовой индекс

- Ночная задача (03:00) считает по завершённым строкам за последние 12 недель: средневзвешенную по кг цену, мин., макс., число сделок и объём — по виду, размерному классу, форме, неделе; отдельно по каждому региону хозяйства и по стране (`regionId = null`).
- Публикуется только при `dealsCount ≥ priceIndex.minDeals`.
- Показывается на публичной странице «Цены», в карточке наличия («рыночная цена за прошлую неделю») и в форме заявки/предложения как подсказка.

### 8.18. Чат по заказу

- У каждого заказа есть общий чат: покупатель, продавцы строк, перевозчик (после назначения), оператор. Текст и фото.
- Системные сообщения (`isSystem`) дублируют ключевые события таймлайна.
- Номера телефонов в тексте сообщений до подтверждения строк маскируются (регулярное выражение для `+998…` и 9-значных номеров).

### 8.19. Автоматические задачи оператора (SLA)

| Триггер | Задача |
|---|---|
| Организация отправила документы | `VERIFY_ORG` |
| Первая заявка покупателя | `REVIEW_FIRST_REQUEST` |
| Заявка без предложений `ops.unmatchedRequestHours` | `UNMATCHED_REQUEST` |
| Строка не подтверждена `order.sellerConfirmationTimeoutHours` | `LINE_CONFIRMATION_TIMEOUT` |
| Строка отклонена продавцом | `LINE_DECLINED` |
| Заказ `CONFIRMED` без логистики за 12 ч до даты доставки | `ASSIGN_LOGISTICS` |
| Нет приёмки через `order.acceptanceTimeoutHours` | `ACCEPTANCE_OVERDUE` |
| Нет оплаты через `payment.overdueDays` | `PAYMENT_OVERDUE` |
| Открыт спор | `DISPUTE` |

---

## 9. Права доступа

Проверка в два слоя: **платформенная роль** (`USER` / `OPERATOR` / `ADMIN`) и **членство в организации** с ролью (`OWNER` / `MANAGER` / `STAFF`) и типом организации.

| Действие | SELLER OWNER/MANAGER | SELLER STAFF | BUYER OWNER/MANAGER | BUYER STAFF | CARRIER | OPERATOR | ADMIN |
|---|---|---|---|---|---|---|---|
| Редактировать организацию, приглашать участников | OWNER | — | OWNER | — | OWNER | ✓ | ✓ |
| Хозяйства, наличие | ✓ | просмотр | — | — | — | ✓ | ✓ |
| Подтвердить свежесть наличия | ✓ | ✓ | — | — | — | ✓ | ✓ |
| Предложения на заявки | ✓ | — | — | — | — | от имени | от имени |
| Подтвердить/отклонить строку | ✓ | — | — | — | — | ✓ | ✓ |
| Отметить отгрузку (LOADED) | ✓ | ✓ | — | — | ✓ | ✓ | ✓ |
| Заявки, принятие предложений | — | — | ✓ | — | — | от имени | от имени |
| Отмена заказа | — | — | ✓ (по правилам) | — | — | ✓ | ✓ |
| Приёмка | — | — | ✓ | ✓ | — | ✓ | ✓ |
| Запись платежа | ✓ | — | ✓ | — | ✓ (свой рейс) | ✓ | ✓ |
| Подтверждение полученного платежа | ✓ | — | — | — | ✓ | ✓ | ✓ |
| Рейсы: смена статусов | — | — | — | — | ✓ | ✓ | ✓ |
| Чат заказа | участники заказа | участники | участники | участники | после назначения | ✓ | ✓ |
| Открыть спор | ✓ | — | ✓ | — | — | ✓ | ✓ |
| Решить спор | — | — | — | — | — | ✓ | ✓ |
| Верификация организаций | — | — | — | — | — | ✓ | ✓ |
| Справочники, настройки, комиссии (списание) | — | — | — | — | — | — | ✓ |
| Отметить оплату счёта комиссии | — | — | — | — | — | ✓ | ✓ |
| Вход «от имени» (impersonation) | — | — | — | — | — | только чтение | ✓ |

- «От имени» — оператор создаёт действия за организацию (например, заявку по звонку); в записи сохраняются и организация, и оператор (`createdByOperator`, аудит с `impersonatorId`).
- Все запросы к ресурсам организации проверяют членство; доступ к заказу имеют: покупатель, продавцы его строк (только к своим строкам и общим данным заказа), назначенный перевозчик (только логистические данные), оператор, администратор.
- Продавец не видит строки других продавцов в сборном заказе (ни цены, ни объёмы, ни названия), только общий статус и логистику.

---

## 10. API

### 10.1. Общие правила

- База: `/api/v1`. JSON, camelCase. Даты-время — ISO 8601 в UTC; даты — `YYYY-MM-DD`.
- Деньги — строки с целым числом сум: `"pricePerKg": "28000"`. Вес — строки с десятичной точкой: `"volumeKg": "1500.000"`.
- Аутентификация: `Authorization: Bearer <accessToken>`. Текущая организация: заголовок `X-Org-Id` (обязателен для эндпоинтов уровня организации; сервер проверяет членство).
- Пагинация: `?limit=20&cursor=<opaque>` → `{ items: [...], nextCursor: string | null }`.
- Фильтры и сортировка — query-параметры, описанные в OpenAPI.
- Идемпотентность: для `POST` из мобильного приложения поддерживается заголовок `Idempotency-Key` (хранение ответа 24 ч в `IdempotencyKey`).
- Rate limiting: глобально 100 запросов/мин на пользователя; OTP — по правилам 8.13.
- Все эндпоинты описаны через `@nestjs/swagger`; спецификация доступна на `/api/docs` (только не в production) и экспортируется в `packages/api-client/openapi.json` скриптом `pnpm api:generate`.

### 10.2. Формат ошибок

```json
{
  "error": {
    "code": "INSUFFICIENT_VOLUME",
    "message": "Недостаточно доступного объёма",
    "details": { "availableKg": "350.000", "requestedKg": "500.000" },
    "requestId": "b7c1…"
  }
}
```

Коды ошибок — перечисление в `packages/domain/errors.ts`, тексты для пользователя — через i18n на клиенте по `code`. Основные: `VALIDATION_FAILED`, `UNAUTHORIZED`, `FORBIDDEN`, `NOT_FOUND`, `CONFLICT`, `INVALID_TRANSITION`, `INSUFFICIENT_VOLUME`, `ORG_NOT_VERIFIED`, `ORG_SUSPENDED`, `OTP_INVALID`, `OTP_EXPIRED`, `OTP_TOO_MANY_ATTEMPTS`, `RATE_LIMITED`, `COMMISSION_OVERDUE_BLOCK`, `MEDIA_TOO_LARGE`, `MEDIA_TYPE_NOT_ALLOWED`.

### 10.3. Эндпоинты

Обозначения ролей: **S** — продавец, **B** — покупатель, **C** — перевозчик, **O** — оператор, **A** — администратор, **any** — любой авторизованный, **public** — без авторизации.

#### Auth и профиль

| Метод | Путь | Кто | Описание |
|---|---|---|---|
| POST | `/auth/otp/request` | public | `{ phone }` → отправка кода; ответ `{ resendAfterSec }` |
| POST | `/auth/otp/verify` | public | `{ phone, code }` → `{ accessToken, refreshToken, user, isNewUser }` |
| POST | `/auth/refresh` | public | `{ refreshToken }` → новая пара; повторное использование старого refresh отзывает всю цепочку |
| POST | `/auth/logout` | any | Отзыв текущей сессии |
| GET | `/me` | any | Профиль + список организаций с ролями |
| PATCH | `/me` | any | `fullName`, `locale` |
| POST / DELETE | `/me/push-devices` | any | Регистрация/удаление FCM-токена |
| GET / PUT | `/me/notification-preferences` | any | Каналы по типам событий |
| POST | `/me/telegram/link` | any | → `{ deepLink }` (одноразовый код, 10 мин) |
| DELETE | `/me/telegram` | any | Отвязать Telegram |

#### Организации

| Метод | Путь | Кто | Описание |
|---|---|---|---|
| POST | `/orgs` | any | Создать организацию (создатель — OWNER) |
| GET | `/orgs/:id` | any | Публичный профиль: название, тип, регион, рейтинг, надёжность, верификация, число сделок, опубликованные отзывы |
| PATCH | `/orgs/:id` | OWNER, O, A | Данные организации |
| POST | `/orgs/:id/verification` | OWNER | `{ mediaIds[] , note }` → `PENDING` |
| GET | `/orgs/:id/members` | члены | |
| POST | `/orgs/:id/members` | OWNER | `{ phone, role }` (приглашение) |
| PATCH / DELETE | `/orgs/:id/members/:userId` | OWNER | Роль / исключение (нельзя удалить последнего OWNER) |
| GET / POST | `/orgs/:id/addresses` | B, O | Адреса доставки |
| PATCH / DELETE | `/addresses/:id` | B, O | DELETE = архивирование |
| GET | `/orgs/:id/reviews` | any | Опубликованные отзывы |

#### Справочники и медиа

| Метод | Путь | Кто | Описание |
|---|---|---|---|
| GET | `/dict/regions` | public | |
| GET | `/dict/species` | public | С размерными классами |
| POST | `/media/upload-url` | any | `{ kind, mimeType, sizeBytes, purpose }` → `{ mediaId, uploadUrl, headers }` (presigned PUT, 10 мин) |
| POST | `/media/:id/complete` | uploader | Подтвердить загрузку → постановка в обработку (превью, EXIF, проверка) |
| GET | `/media/:id/url` | имеющие доступ к сущности | Подписанная ссылка на скачивание (10 мин) |

Ограничения: изображения `jpeg/png/webp/heic` до 15 МБ (на клиенте сжимать до ~2 МБ), видео `mp4/quicktime` до 60 МБ и 60 с, PDF до 15 МБ.

#### Хозяйства и наличие

| Метод | Путь | Кто | Описание |
|---|---|---|---|
| GET / POST | `/farms` | S | Хозяйства своей организации |
| GET / PATCH | `/farms/:id` | S, O | |
| GET | `/listings` | any, public (без точных координат и контактов) | Поиск: `speciesId, sizeClassId, form, regionId, near=lat,lng, radiusKm, availableOn, maxPrice, kind, sort=score|price|distance|fresh` |
| GET | `/listings/:id` | any | Карточка + ценовой индекс |
| POST | `/listings` | S | Создать (`DRAFT`) |
| PATCH | `/listings/:id` | S | Правка (с проверками 8.3) |
| POST | `/listings/:id/publish` | S | `DRAFT/PAUSED → ACTIVE` (проверки: верификация, фото, объёмы) |
| POST | `/listings/:id/pause` / `/resume` / `/archive` | S | |
| POST | `/listings/:id/confirm` | S | Подтверждение свежести, опционально `{ volumeKg, pricePerKg }` |
| GET | `/seller/listings` | S | Свои, с фильтром по статусу |

#### Заявки, подбор, предложения

| Метод | Путь | Кто | Описание |
|---|---|---|---|
| POST | `/requests` | B, O (от имени) | Создать черновик |
| PATCH | `/requests/:id` | B | Только `DRAFT` |
| POST | `/requests/:id/submit` | B | → `OPEN` или `PENDING_REVIEW` |
| POST | `/requests/:id/cancel` | B, O | |
| GET | `/requests/my` | B | Свои заявки |
| GET | `/requests/:id` | B (своя), S (если проходит фильтр подбора или есть предложение), O | Для продавца — без названия покупателя и точного адреса |
| GET | `/requests/:id/candidates` | B (своя), O | Кандидаты подбора со скорингом + `suggestedSplit` |
| POST | `/requests/:id/invite` | O | `{ sellerOrgId }` — пригласить продавца вне топа |
| GET | `/seller/requests` | S | «Заявки для меня»: открытые, проходящие фильтр, с отметкой «есть моё предложение» |
| POST | `/requests/:id/offers` | S | Создать предложение |
| GET | `/requests/:id/offers` | B (своя), O | Предложения со сводкой по продавцу (рейтинг, надёжность, расстояние) |
| PATCH | `/offers/:id` | S | Пока `PENDING` |
| POST | `/offers/:id/withdraw` | S | |
| POST | `/requests/:id/accept` | B, O | `{ items: [{ offerId, acceptedKg }], deliveryType, deliveryWindow?, paymentTerms, prepaymentPercent? }` → созданный заказ |

#### Заказы

| Метод | Путь | Кто | Описание |
|---|---|---|---|
| GET | `/orders` | B, S, C, O | Список с фильтрами `status, dateFrom, dateTo, role` (видимость по разделу 9) |
| GET | `/orders/:id` | участники, O | Заказ; продавец видит только свои строки |
| POST | `/orders/from-listing` | B | `{ listingId, volumeKg, deliveryAddressId, deliveryDate, deliveryType, paymentTerms }` |
| POST | `/orders` | O | Черновик сборного заказа от имени покупателя |
| POST / PATCH / DELETE | `/orders/:id/lines` | O | Строки в `DRAFT` (и добавление замены после отказа) |
| POST | `/orders/:id/submit` | O | `DRAFT → PENDING_SELLER_CONFIRMATION` |
| POST | `/orders/:id/lines/:lineId/confirm` | S | Резервирование (8.7) |
| POST | `/orders/:id/lines/:lineId/decline` | S | `{ reason }` |
| POST | `/orders/:id/lines/:lineId/loaded` | S, C, O | |
| POST | `/orders/:id/delivered` | C, B, O | |
| POST | `/orders/:id/lines/:lineId/acceptance` | B, O | `{ actualKg, deadKg, rejectedKg, qualityNote, signerName, mediaIds[], acceptDeviation, clientRequestId }` |
| POST | `/orders/:id/cancel` | B, O | `{ reason }` |
| POST | `/orders/:id/force-complete` | O | `{ reason }` |
| GET | `/orders/:id/events` | участники, O | Таймлайн |
| GET / POST | `/orders/:id/messages` | участники, O | Чат; `POST { text?, mediaIds[] }` |
| POST | `/orders/:id/messages/read` | участники | `{ upToMessageId }` |
| GET | `/orders/:id/documents` | участники, O | Документы (продавец — только по своим строкам и общие) |
| POST | `/orders/:id/documents` | S, B, C, O | Загрузить `{ type, orderLineId?, mediaId }` |
| POST | `/orders/:id/documents/generate` | O | `{ type: ORDER_CONFIRMATION }` — перегенерация |

#### Логистика

| Метод | Путь | Кто | Описание |
|---|---|---|---|
| GET / POST | `/vehicles` | C | Свои машины |
| PATCH | `/vehicles/:id` | C | |
| GET | `/orders/:id/carrier-suggestions` | O | Подходящие перевозчики и машины с ценой-ориентиром |
| POST | `/orders/:id/shipments` | O | Создать рейс с точками |
| PATCH | `/shipments/:id` | O | |
| POST | `/shipments/:id/status` | C, O | `{ status, stopId?, event: ARRIVED|DEPARTED }` |
| GET | `/carrier/shipments` | C | Свои рейсы |
| POST | `/orders/:id/logistics` | O | Для `BUYER_PICKUP`/`SELLER_DELIVERY`: зафиксировать договорённость → `LOGISTICS_ASSIGNED` |

#### Расчёты, комиссии, споры, отзывы

| Метод | Путь | Кто | Описание |
|---|---|---|---|
| GET / POST | `/orders/:id/payments` | участники, O | `POST { direction, payeeOrgId, amount, method, reference, proofMediaId }` |
| POST | `/payments/:id/confirm` / `/reject` | получатель, O | |
| GET | `/seller/commissions` | S | Начисления и счета |
| GET | `/seller/commission-invoices/:id` | S | Со ссылкой на PDF |
| POST | `/orders/:id/disputes` | B, S, O | `{ orderLineId?, reason, description, mediaIds[] }` |
| GET | `/disputes/:id` | стороны, O | |
| POST | `/orders/:id/reviews` | B, S, C | `{ toOrgId, scores, comment }` |

#### Уведомления, цены, публичное

| Метод | Путь | Кто | Описание |
|---|---|---|---|
| GET | `/notifications` | any | In-app, пагинация, `unreadCount` |
| POST | `/notifications/:id/read`, `/notifications/read-all` | any | |
| GET | `/prices/index` | public | `speciesId, sizeClassId, form, regionId?, weeks=12` |
| GET | `/public/stats` | public | Для лендинга: число хозяйств, сделок, объём (кэш 1 ч) |

#### Администрирование (`/admin/*`, только O и A, если не указано иное)

| Метод | Путь | Описание |
|---|---|---|
| GET | `/admin/dashboard` | Счётчики очередей: верификация, заявки без предложений, неподтверждённые строки, заказы без логистики, доставки сегодня, споры, просроченные оплаты и счета |
| GET | `/admin/tasks` / PATCH `/admin/tasks/:id` | Задачи оператора (назначить, закрыть) |
| GET | `/admin/orgs` / GET `/admin/orgs/:id` | Поиск, карточка с CRM-заметками, историей сделок, документами верификации |
| POST | `/admin/orgs/:id/verify` / `/reject` / `/suspend` / `/unsuspend` | С комментарием |
| POST | `/admin/orgs/:id/notes` | CRM-заметка |
| PATCH | `/admin/orgs/:id/commission-rate` | **A** — индивидуальная ставка |
| GET | `/admin/users` / PATCH `/admin/users/:id` | Блокировка, платформенная роль (**A**) |
| POST | `/admin/requests/:id/approve` | Подтвердить первую заявку |
| GET | `/admin/requests` / `/admin/orders` / `/admin/shipments` | Доски с фильтрами |
| POST | `/admin/orders/:id/assign-operator` | |
| PATCH | `/admin/orders/:id/lines/:lineId/acceptance` | Исправление приёмки (аудит) |
| GET | `/admin/disputes` / POST `/admin/disputes/:id/review` / `/resolve` / `/reject` | |
| GET | `/admin/payments` | Журнал платежей |
| GET | `/admin/commission-invoices` / POST `/admin/commission-invoices/:id/mark-paid` | |
| POST | `/admin/commissions/:id/waive` | **A** |
| CRUD | `/admin/dict/species`, `/admin/dict/size-classes`, `/admin/dict/regions` | **A** |
| GET / PATCH | `/admin/settings` | **A** |
| GET | `/admin/audit` | Фильтр по сущности, пользователю, дате |
| GET | `/admin/reports/:type` | `funnel`, `gmv`, `sellers`, `buyers`, `operators` (CSV/XLSX экспорт) |
| POST | `/admin/impersonate` | `{ orgId }` → короткоживущий токен «только чтение» (O), полный (A); всё в аудит |
| GET / PUT | `/admin/notification-templates` | **A** — тексты шаблонов uz/ru |

### 10.4. Realtime (Socket.IO)

- Namespace `/rt`, аутентификация JWT в `auth.token` при подключении.
- Комнаты: `user:{userId}`, `org:{orgId}`, `order:{orderId}` (подписка только при наличии доступа), `ops` (операторы).
- События сервер → клиент:

| Событие | Комната | Данные |
|---|---|---|
| `notification.created` | user | Уведомление |
| `order.updated` | order, org участников | `{ orderId, status, updatedAt }` → клиент перезапрашивает |
| `order.line.updated` | order | `{ orderId, lineId, status }` |
| `message.created` | order | Сообщение |
| `offer.created` | org покупателя, ops | `{ requestId, offerId }` |
| `request.updated` | org покупателя | `{ requestId, status }` |
| `shipment.updated` | order, org перевозчика | `{ shipmentId, status }` |
| `ops.task.created` | ops | Задача |

- Клиенты используют realtime только как сигнал к инвалидации кэша TanStack Query; источник истины — REST.

---

## 11. Уведомления и Telegram-бот

### 11.1. Механика

1. Доменное событие (outbox) → worker определяет получателей и каналы по **каталогу** (11.2) и настройкам пользователя.
2. Для каждого получателя и канала создаётся `Notification(QUEUED)` и задача в очереди канала.
3. Каналы: `IN_APP` (запись в БД + realtime), `PUSH` (FCM), `SMS` (SmsProvider), `TELEGRAM` (бот, если привязан).
4. Тексты — шаблоны с плейсхолдерами на языке получателя (`user.locale`), хранятся в `packages/i18n/notifications/{uz,ru}.json`, редактируемые копии — через админку.
5. **Тихие часы**: некритичные уведомления по push и Telegram вне `ops.workingHours` откладываются до утра; критичные (помечены в каталоге) уходят сразу.
6. SMS — только для критичных событий и OTP (стоимость).
7. Повторы: до 3 попыток с экспоненциальной задержкой; ошибки в `Notification.error`.
8. Каждое уведомление содержит deep link: веб — `https://<домен>/<путь>`, мобильное — `baliqbozor://orders/<id>`, Telegram — inline-кнопка.

### 11.2. Каталог событий

| Событие | Получатели | Каналы по умолчанию | Критичное |
|---|---|---|---|
| `org.verification.approved` / `rejected` | OWNER организации | in-app, push, TG, SMS | нет |
| `org.member.invited` | приглашённый | SMS | нет |
| `request.first.pending_review` | операторы | in-app (ops), TG ops-чат | нет |
| `request.matched` (новая заявка для продавца) | OWNER/MANAGER продавцов из рассылки | in-app, push, TG | нет |
| `offer.received` | автор заявки + OWNER/MANAGER покупателя, операторы | in-app, push, TG | нет |
| `offer.accepted` / `rejected` / `expired` | автор предложения | in-app, push, TG | нет |
| `order.line.confirmation_requested` | OWNER/MANAGER продавца строки | in-app, push, TG, SMS | **да** |
| `order.line.confirmed` / `declined` | покупатель, операторы | in-app, push, TG | нет |
| `order.confirmed` | покупатель, продавцы | in-app, push, TG | нет |
| `shipment.assigned` | перевозчик (OWNER/MANAGER), покупатель, продавцы | in-app, push, TG, SMS (перевозчику) | **да** для перевозчика |
| `shipment.status_changed` | покупатель; продавцы — при прибытии на их точку | in-app, push, TG | нет |
| `order.delivered` | покупатель (все члены) | in-app, push, TG | **да** (нужна приёмка) |
| `order.line.accepted` | продавец строки | in-app, push, TG | нет |
| `payment.recorded` | получатель (подтвердить) | in-app, push, TG | нет |
| `payment.confirmed` / `rejected` | плательщик | in-app, push, TG | нет |
| `payment.overdue` | покупатель, операторы | in-app, push, TG, SMS | **да** |
| `order.cancelled` | все участники | in-app, push, TG, SMS (если был CONFIRMED) | **да** |
| `dispute.opened` / `resolved` | стороны, операторы | in-app, push, TG | нет |
| `review.requested` | участники завершённого заказа | in-app, push | нет |
| `listing.freshness_reminder` | OWNER/MANAGER/STAFF продавца | in-app, push, TG | нет |
| `listing.auto_paused` | OWNER/MANAGER продавца | in-app, push, TG | нет |
| `commission.invoice_issued` / `overdue` | OWNER продавца | in-app, push, TG, SMS (просрочка) | нет |
| `message.created` | участники заказа, кроме автора | in-app, push (сгруппировано, не чаще 1 раза в 5 мин на заказ) | нет |
| `ops.task.created` | операторы | in-app (ops), TG ops-чат | по типу |

### 11.3. Telegram-бот

Реализация: модуль `telegram` в `apps/api` на grammY, webhook `/api/v1/telegram/webhook/<secret>`; отправка сообщений — через очередь worker (лимиты Telegram API соблюдать: не более ~25 сообщений/с).

**Привязка аккаунта:**
1. В вебе или мобильном приложении «Подключить Telegram» → `POST /me/telegram/link` → deep link `https://t.me/<bot>?start=<code>`.
2. Пользователь открывает ссылку → `/start <code>` → бот проверяет код, сохраняет `telegramChatId`.
3. Альтернатива для тех, кто начинает в боте: `/start` без кода → бот просит поделиться контактом (кнопка «Отправить номер») → если номер есть в системе, отправляет OTP по SMS → пользователь вводит код в боте → привязка. Если номера нет — бот даёт ссылку на регистрацию.

**Команды и функции (язык — по `user.locale`, переключение `/lang`):**

| Команда / событие | Что делает |
|---|---|
| `/start`, `/help` | Приветствие, список команд, ссылка на веб и приложение |
| `/listings` | Моё наличие: по каждой позиции кнопки «Актуально», «Изменить объём», «Снять» |
| `/requests` | Открытые заявки для меня (до 10): кратко + кнопка «Сделать предложение» |
| `/orders` | Активные заказы с текущим статусом и кнопкой «Открыть в приложении» |
| `/lang` | Выбор языка |
| Уведомление `order.line.confirmation_requested` | Текст строки (вид, размер, объём, цена, сумма, комиссия, дата) + кнопки «Подтвердить» / «Отклонить» (при отклонении бот спрашивает причину из списка) |
| Уведомление `request.matched` | Кнопки «Сделать предложение» / «Неинтересно» |
| Диалог «Сделать предложение» | Пошагово: хозяйство (если несколько) → объём → цена за кг (подсказка индекса) → дата отгрузки → подтверждение. Использовать grammY conversations |
| Уведомление `listing.freshness_reminder` | «Актуально» / «Изменить объём» (ввод числа) / «Снять» |
| Уведомление `payment.recorded` | «Подтвердить получение» / «Не получал» |
| Перевозчик: `shipment.assigned` | «Принял рейс» → `ASSIGNED`; затем кнопки следующего статуса и отметок точек |

**Безопасность бота:** каждая callback-кнопка содержит короткий подписанный токен (HMAC от действия, id сущности, userId, срока 72 ч); сервер заново проверяет права пользователя на действие. Секрет webhook — в URL и в заголовке `X-Telegram-Bot-Api-Secret-Token`.

**Ops-чат:** отдельная закрытая группа операторов; бот публикует туда события из каталога, помеченные «TG ops-чат», с кнопкой «Открыть в админке».

---

## 12. Клиентские приложения

### 12.1. Общие требования к интерфейсам

- **Языки:** узбекский (латиница) по умолчанию, русский; переключатель в шапке и в профиле. Все строки — ключи i18n.
- **Форматы:** деньги — `1 250 000 so'm` / `1 250 000 сум` (пробел-разделитель тысяч, без копеек); цена — `28 000 so'm/kg`; вес — `1 250,5 kg` (одна десятичная, запятая для ru и uz); даты — `05.11.2026`; время — 24-часовое; телефон — маска `+998 90 123 45 67`.
- **Простота:** пользователи — фермеры и закупщики, не IT-специалисты. Крупные элементы, понятные подписи, одна главная кнопка на экран, подсказки в пустых состояниях («У вас пока нет наличия. Добавьте первую позицию — покупатели увидят её сразу после проверки»).
- **Статусы** — цветные бейджи с текстом (не только цветом); на каждом заказе — таймлайн событий и блок «Что дальше и кто должен действовать».
- **Подтверждения** для необратимых действий (отмена заказа, отклонение строки, приёмка).
- **Карты** — выбор точки при создании хозяйства и адреса; показ хозяйств-кандидатов на карте для оператора.
- **Адаптивность** — веб удобен на телефоне (многие продавцы зайдут с мобильного браузера по ссылке из Telegram).
- **Доступность** — контраст WCAG AA, подписи у полей ввода, работа с клавиатуры в админке.

### 12.2. Веб-приложение (apps/web, Next.js)

**Публичная часть (без входа):**

| Страница | Содержимое |
|---|---|
| `/` | Лендинг: что это, для кого, как работает (3 шага для покупателя и продавца), статистика, CTA «Я покупатель» / «Я продаю рыбу», ссылки на Telegram-бот и приложение |
| `/prices` | Ценовой индекс: выбор вида, размера, формы, региона; график за 12 недель; таблица |
| `/catalog` | Каталог наличия (без точных координат и контактов): фильтры, карточки; «Заказать» ведёт на вход |
| `/listing/:id` | Публичная карточка наличия |
| `/login` | Ввод телефона → код |

**Общие разделы после входа:** выбор/переключение организации, онбординг (создание организации), профиль, уведомления, настройки уведомлений, подключение Telegram, команда (для OWNER), профиль организации и верификация.

**Покупатель:**

| Раздел | Функции |
|---|---|
| Главная | Активные заказы с ближайшими доставками; заявки с новыми предложениями; кнопки «Новая заявка», «Каталог» |
| Новая заявка | Форма 8.4 с подсказкой рыночной цены; выбор или добавление адреса (карта) |
| Мои заявки | Список со статусами; карточка заявки: предложения в виде сравнительной таблицы (цена, объём, дата, расстояние, рейтинг, надёжность, «есть видео облова»), подсказка сборного заказа, выбор и частичное принятие, итог и комиссия не показываются покупателю (комиссия платит продавец) |
| Каталог | Поиск наличия, карточки, «Заказать» (8.7, способ 2) |
| Заказы | Список и фильтры; карточка заказа: строки, суммы, логистика (машина, водитель, телефон, статус рейса), таймлайн, чат, документы, платежи, кнопки по статусу: «Отменить», «Доставлено», «Оформить приёмку», «Записать оплату», «Открыть спор», «Оставить отзыв» |
| Приёмка | Пошаговая форма по каждой строке: фактический вес, снулая, отбраковано, фото весов (обязательно), комментарий, имя; предупреждение об отклонении веса |
| Адреса | Список, добавление, архив |
| Отзывы | Полученные и оставленные |

**Продавец:**

| Раздел | Функции |
|---|---|
| Главная | Строки, ждущие подтверждения (с таймером), новые заявки для меня, наличие с истекающей свежестью, ближайшие отгрузки, неоплаченные суммы |
| Хозяйства | Список, создание/редактирование с картой, фото |
| Наличие | Список по статусам; форма создания (вид → размер → форма → объём → минимальная партия → цена или «договорная» → окно вылова → фото/видео → описание); быстрые действия: подтвердить, изменить объём, пауза, архив |
| Заявки для меня | Лента подходящих открытых заявок: вид, размер, объём, регион доставки, даты, ориентир цены, расстояние; «Сделать предложение» |
| Мои предложения | Статусы, редактирование, отзыв |
| Заказы | Только свои строки: подтвердить/отклонить (с показом комиссии), отметить отгрузку, загрузить ветдокументы, приёмка (просмотр), платежи (подтвердить получение), чат, споры, отзывы |
| Финансы | Получено/ожидается по заказам; начисленная комиссия; счета на комиссию с PDF и статусом |
| Профиль и рейтинг | Публичный профиль, отзывы, надёжность |

**Перевозчик:**

| Раздел | Функции |
|---|---|
| Рейсы | Список назначенных и активных; карточка: точки по порядку с адресами, контактами и кнопками «Построить маршрут» (ссылка в Яндекс Карты / Google Maps), смена статусов и отметки прибытия/отъезда, чат заказа |
| Машины | Список, добавление: номер, тип, вместимость, баки, аэрация, регионы, тарифы, фото |
| Финансы | Записанные и подтверждённые оплаты рейсов |

### 12.3. Админка оператора и администратора (apps/admin, Next.js)

Отдельное приложение, вход только для `OPERATOR` и `ADMIN`. Интерфейс на русском и узбекском. Основа — таблицы с фильтрами, быстрыми действиями и боковой панелью деталей.

| Раздел | Функции |
|---|---|
| **Пульт** (`/`) | Счётчики очередей (10.3 `/admin/dashboard`), список моих задач с SLA-таймерами, лента событий ops |
| **Задачи** | Все задачи: тип, связанная сущность, срок, ответственный; взять в работу, закрыть с комментарием |
| **Организации** | Поиск по названию, телефону, СТИР; карточка: данные, участники, хозяйства/машины, документы верификации (просмотр фото), история сделок, рейтинг, CRM-заметки, действия: верифицировать, отклонить, заблокировать, индивидуальная комиссия (A), войти «от имени» |
| **Заявки** | Доска по статусам; карточка: детали, **консоль подбора** — карта с адресом доставки и хозяйствами-кандидатами, таблица кандидатов со скорингом, подсказка сборного заказа, «пригласить продавца», создание заказа из выбранных позиций; одобрение первой заявки |
| **Новый заказ по звонку** | Мастер: покупатель (поиск или быстрое создание организации с телефоном) → адрес → дата → строки из наличия (поиск по виду/размеру/региону, ввод объёма) → тип доставки и условия оплаты → отправить продавцам |
| **Заказы** | Доска (канбан по статусам) и таблица; карточка с полным доступом: строки всех продавцов, таймлайн, чат, документы, логистика, платежи, споры; действия: назначить оператора, заменить строку, отменить, исправить приёмку, закрыть принудительно |
| **Логистика** | Рейсы на сегодня/завтра; подбор перевозчика для заказа (подходящие машины с ценой-ориентиром); создание рейса с точками (перетаскивание порядка) |
| **Споры** | Очередь, карточка с материалами, решение с корректировкой |
| **Финансы** | Журнал платежей, просрочки, комиссии по продавцам, счета (сформировать вручную, отметить оплату, списать — A) |
| **Цены** | Ценовой индекс, ручной пересчёт |
| **Справочники** (A) | Виды, размерные классы, регионы |
| **Настройки** (A) | Таблица 8.13 с описаниями и валидацией |
| **Шаблоны уведомлений** (A) | Тексты uz/ru с предпросмотром |
| **Пользователи** (A) | Поиск, блокировка, платформенные роли |
| **Отчёты** | Воронка (заявки → предложения → заказы → завершённые), оборот (GMV), число сделок, средний чек, повторные покупатели, время подбора, доля отказов и отмен, активность продавцов, эффективность операторов; экспорт CSV/XLSX |
| **Аудит** | Журнал с фильтрами и просмотром изменений (до/после) |

### 12.4. Мобильное приложение (apps/mobile, React Native CLI)

Одно приложение для всех ролей; интерфейс зависит от типа текущей организации. Android 8+, iOS 15+. Ориентир — недорогие Android-смартфоны.

**Экраны:**

| Роль | Экраны |
|---|---|
| Все | Вход по телефону, онбординг, переключение организации, уведомления, профиль, язык, подключение Telegram, настройки уведомлений |
| Продавец | Главная (как в вебе), наличие (список, создание с камерой: фото и видео облова до 60 с), заявки для меня, создание предложения, заказы (подтвердить/отклонить строку, отгрузка, загрузка ветдокумента камерой), подтверждение оплат, финансы |
| Покупатель | Главная, новая заявка, предложения и принятие, каталог, заказы, **приёмка** (весы — ввод вручную, фото весов камерой, подпись именем), запись оплаты с фото квитанции, отзывы |
| Перевозчик | Рейсы, карточка рейса с кнопками статусов, звонок по точке, открытие навигации, фото накладной |

**Требования:**

- Push через FCM, каналы уведомлений Android: «Важные» (критичные события, высокий приоритет, звук) и «Обычные».
- Глубокие ссылки `baliqbozor://` и универсальные ссылки на домен.
- Камера: фото сжимаются на устройстве до 1600 px по длинной стороне и ~80% JPEG; видео — ограничение 60 с.
- **Работа при плохой связи:** черновики форм (наличие, предложение, приёмка, оплата) сохраняются локально (MMKV); отправка приёмки и оплаты — через очередь с повтором и `Idempotency-Key`/`clientRequestId`; загрузка медиа — с повтором и индикатором прогресса. Полноценный офлайн-режим не требуется.
- Кэш последних данных (TanStack Query persist) для просмотра заказов без сети.
- Хранение токенов — Keychain/Keystore.
- Sentry для ошибок; аналитика экранов — минимальная, без персональных данных.

### 12.5. Интернационализация

- Пакет `packages/i18n`: `locales/uz.json`, `locales/ru.json`, функции форматирования денег, веса, дат (`formatMoney`, `formatKg`, `formatDate`) — используются в web, admin, mobile, PDF и уведомлениях.
- Ключи по модулям: `common.*`, `auth.*`, `listings.*`, `requests.*`, `orders.*`, `status.order.*`, `errors.<CODE>`, `notifications.<event>.title/body`.
- Тест в CI: все ключи из `ru.json` присутствуют в `uz.json` и наоборот.
- Названия справочников (виды, регионы, размеры) — из полей `nameUz/nameRu`, не из i18n-файлов.

### 12.6. Документы (PDF)

| Документ | Когда | Содержимое |
|---|---|---|
| Подтверждение заказа | При `CONFIRMED` (по строке для продавца и общее для покупателя) | Номер, стороны (покупатель и продавец строки), позиции, объёмы, цены, суммы, дата и адрес доставки, условия оплаты, логистика |
| Акт приёмки | При приёмке строки | Позиция, плановый и фактический вес, снулая, отбраковано, к оплате, сумма, кто принял, время, фото весов (миниатюра) |
| Счёт на комиссию | По периоду | Реквизиты платформы (из настроек), продавец, список строк с суммами и комиссией, итог, срок оплаты |

Шаблоны — HTML + CSS в `packages/pdf-templates`, двуязычные (язык получателя), генерация в worker через Playwright Chromium, результат сохраняется как `MediaFile` + `Document(isGenerated = true)`.

---

## 13. Нефункциональные требования, безопасность, тестирование, DevOps

### 13.1. Производительность и масштаб

| Показатель | Цель MVP |
|---|---|
| Ответ API (чтение), p95 | ≤ 300 мс |
| Ответ API (запись), p95 | ≤ 800 мс |
| Поиск наличия при 50 000 активных позиций, p95 | ≤ 500 мс |
| Доставка in-app/push после события, p95 | ≤ 30 с |
| Одновременные пользователи | 2 000 |
| Доступность | 99,5% в месяц |
| Время первой загрузки веба на 3G | ≤ 4 с (LCP) |

Поиск по расстоянию: гаверсинус в SQL с предварительным отбором по ограничивающему прямоугольнику (lat/lng ± Δ) и индексам. Переход на PostGIS — при необходимости, без изменения API.

### 13.2. Безопасность

- **OTP:** 6 цифр, хэш в БД, срок 5 мин, до 5 попыток, повторная отправка не чаще 60 с, не более 5 SMS на номер в час и 20 на IP в час; блокировка номера на 1 час после превышения. В production нет «волшебного» кода.
- **Токены:** access JWT 15 мин (подпись RS256 или HS256 с секретом из env), refresh — случайная строка, хранится хэш, ротация при каждом обновлении, повторное использование старого refresh отзывает всю цепочку (`familyId`).
- **Авторизация:** глобальный guard: аутентификация → платформенная роль → членство в организации (`X-Org-Id`) → права на конкретный ресурс (политики в `orders/policies.ts` и т.п.). Отказ по умолчанию.
- **Изоляция данных:** e2e-тесты на каждый ресурс: пользователь организации A не может читать/менять данные B; продавец не видит строки других продавцов сборного заказа; перевозчик не видит цены.
- **Валидация** всех входных данных (DTO + class-validator), ограничения длины строк, белые списки enum-ов.
- **Файлы:** только presigned URL, проверка MIME по содержимому (magic bytes) в worker, удаление EXIF (в том числе геотегов), ограничения размера, приватный бакет, выдача только подписанными ссылками.
- **HTTP:** Helmet, строгий CORS (только домены web/admin), HTTPS везде, HSTS.
- **Аудит:** все действия операторов и администраторов, смены статусов заказов, приёмки, платежи, споры, настройки, верификация, вход «от имени».
- **Персональные данные:** храним минимум (телефон, имя, данные организации). Телефоны контрагентов видны только после подтверждения строки. Логи без телефонов (маска).
- **Секреты:** только env; в репозитории — `.env.example`. Ротация ключей JWT без простоя (поддержка двух ключей).
- **Резервные копии:** ежедневный полный бэкап Postgres + WAL-архив (восстановление на момент времени), хранение 30 дней во втором месте; ежемесячная проверка восстановления.

### 13.3. Наблюдаемость

- Логи pino в JSON: `requestId`, `userId`, `orgId`, путь, статус, длительность; без тел запросов с персональными данными.
- Sentry во всех приложениях; алерты на всплеск ошибок.
- `/health` (жив) и `/ready` (БД, Redis, S3 доступны).
- Метрики очередей BullMQ (размер, ошибки) — панель Bull Board в админке (только A).
- Алерты: ошибки отправки SMS/Telegram выше порога, рост неотправленных `DomainEvent`, недоступность API.

### 13.4. Тестирование

| Уровень | Инструмент | Что покрываем |
|---|---|---|
| Модульные | Vitest/Jest | `packages/domain`: статусные машины, расчёт сумм и комиссий, скоринг подбора, `suggestSplit`, правила свежести, надёжность — покрытие ≥ 90% |
| Сервисы API | Jest + тестовая БД | Бизнес-правила с транзакциями: резервирование при конкурентном подтверждении (две строки на одно наличие одновременно), переходы статусов, отмены, споры |
| E2E API | supertest + docker Postgres/Redis | Каждый эндпоинт: успех, валидация, права, изоляция организаций |
| E2E веб | Playwright | Сквозные сценарии 14.3 |
| Мобильное | Jest + React Native Testing Library | Ключевые экраны и очередь отправки; ручной чек-лист перед релизом |
| Нагрузочные | k6 | Поиск наличия, создание предложений, realtime-подключения |

Правила: новый эндпоинт без e2e-теста не принимается; баг-фикс сопровождается тестом, воспроизводящим ошибку.

### 13.5. DevOps

- **Локально:** `docker compose up -d` (Postgres 16, Redis 7, MinIO), `pnpm i`, `pnpm db:migrate`, `pnpm db:seed`, `pnpm dev` (все приложения через Turborepo).
- **CI (GitHub Actions)** на каждый PR: установка, lint, typecheck, unit, e2e API (сервисы в контейнерах), сборка всех приложений, проверка `prisma migrate diff` (схема и миграции совпадают), проверка ключей i18n, проверка актуальности OpenAPI-клиента.
- **Сборка:** Docker-образ на каждое приложение (`api`, `worker`, `web`, `admin`), multi-stage, non-root.
- **Staging/production:** docker compose или k3s на VPS в дата-центре Узбекистана, reverse proxy (Caddy/Nginx) с TLS, отдельный managed или self-hosted Postgres с бэкапами, S3-совместимое хранилище (MinIO на отдельном диске или облачный S3 провайдера).
- **Миграции** применяются отдельным шагом деплоя перед запуском новой версии; миграции только обратно совместимые (expand → migrate → contract).
- **Мобильное:** сборки через Fastlane или GitHub Actions; каналы internal testing (Google Play) и TestFlight.

### 13.6. Переменные окружения (`.env.example`)

```
# общие
NODE_ENV=development
APP_ENV=local                  # local | staging | production
WEB_URL=http://localhost:3000
ADMIN_URL=http://localhost:3001
API_URL=http://localhost:4000

# база и очереди
DATABASE_URL=postgresql://app:app@localhost:5432/baliqbozor
REDIS_URL=redis://localhost:6379

# auth
JWT_ACCESS_SECRET=change-me
JWT_ACCESS_TTL=900
REFRESH_TTL_DAYS=30
OTP_DEV_BYPASS_CODE=000000     # работает только при APP_ENV=local

# S3
S3_ENDPOINT=http://localhost:9000
S3_REGION=us-east-1
S3_BUCKET=baliqbozor-private
S3_ACCESS_KEY=minio
S3_SECRET_KEY=minio123

# SMS
SMS_PROVIDER=console           # console | eskiz
SMS_ESKIZ_EMAIL=
SMS_ESKIZ_PASSWORD=
SMS_SENDER=4546
SMS_STAGING_WHITELIST=+998901234567

# push
FCM_PROJECT_ID=
FCM_CLIENT_EMAIL=
FCM_PRIVATE_KEY=

# telegram
TELEGRAM_BOT_TOKEN=
TELEGRAM_BOT_USERNAME=
TELEGRAM_WEBHOOK_SECRET=
TELEGRAM_OPS_CHAT_ID=
TELEGRAM_CALLBACK_HMAC_SECRET=

# наблюдаемость
SENTRY_DSN_API=
SENTRY_DSN_WEB=
SENTRY_DSN_ADMIN=
SENTRY_DSN_MOBILE=
LOG_LEVEL=info

# платформа (реквизиты для счетов на комиссию)
PLATFORM_LEGAL_NAME=
PLATFORM_TIN=
PLATFORM_BANK_DETAILS=
```

---

## 14. План реализации и критерии приёмки

### 14.1. Milestones

Каждый milestone завершается работающей сборкой, зелёным CI, обновлённым `docs/PROGRESS.md` и демо-сценарием на seed-данных.

| # | Milestone | Содержание | Критерий готовности |
|---|---|---|---|
| M0 | Каркас | Монорепозиторий, пакеты `config`, `db`, `domain`, `i18n`, `api-client`; docker-compose; NestJS api и worker с health; Next.js web и admin с i18n и Tailwind; RN-проект; CI | `pnpm dev` поднимает всё; CI зелёный; `/health` отвечает |
| M1 | Доступ и организации | OTP-вход, токены, сессии; `/me`; организации, участники, приглашения, адреса; справочники и seed; верификация (отправка и решение в админке); guard'ы и изоляция; аудит | Сценарий: регистрация продавца → создание организации → отправка документов → оператор верифицирует → уведомление in-app |
| M2 | Хозяйства и наличие | Медиа (presigned, обработка в worker), хозяйства с картой, наличие (CRUD, публикация, пауза, архив, свежесть с напоминанием и автопаузой), публичный каталог | Продавец публикует наличие с фото; покупатель находит его в каталоге с фильтрами и по расстоянию; без подтверждения через 7 дней позиция уходит в паузу |
| M3 | Заявки, подбор, предложения | Заявки, модерация первой, matching со скорингом и рассылкой, «Заявки для меня», предложения, сравнение, `suggestSplit`, outbox + уведомления in-app/push | Покупатель создаёт заявку → подходящие продавцы получают уведомление → двое делают предложения → покупатель видит сравнение и подсказку сборного заказа |
| M4 | Заказы | Принятие предложений → заказ; заказ из наличия; конструктор оператора; подтверждение/отклонение строк с резервированием (конкурентно-безопасно); статусная машина; таймлайн; чат; realtime; таймауты и задачи | Сборный заказ из двух хозяйств: одно подтверждает, второе отклоняет → оператор заменяет строку → заказ `CONFIRMED`; резервы корректны |
| M5 | Логистика | Машины, подсказка перевозчиков, рейсы с точками, статусы рейса и синхронизация с заказом | Оператор назначает перевозчика; перевозчик проводит рейс по статусам; заказ доходит до `DELIVERED` |
| M6 | Приёмка, деньги, документы | Приёмка с фото и идемпотентностью; расчёт сумм; комиссии; платежи и подтверждения; `COMPLETED`; генерация PDF; счета на комиссию по расписанию | Приёмка с отклонением веса и снулой рыбой даёт верные суммы; после подтверждения оплат заказ `COMPLETED`; по понедельникам формируется счёт с PDF |
| M7 | Споры, отзывы, рейтинги | Споры с корректировкой; слепые отзывы; рейтинг; надёжность; ограничения по просроченной комиссии | Спор «недовес» с корректировкой пересчитывает сумму и комиссию; отзывы публикуются по правилу |
| M8 | Telegram и SMS | Привязка, команды, уведомления с кнопками, диалог предложения, подтверждение строки и оплаты, ops-чат; SMS-провайдер для критичных событий | Продавец подтверждает строку и делает предложение полностью из Telegram |
| M9 | Админка и отчёты | Пульт, задачи и SLA, консоль подбора с картой, доски, финансы, настройки, шаблоны, отчёты, аудит, impersonation | Оператор проводит заказ «по звонку» от создания до завершения без обращения к БД |
| M10 | Мобильное приложение | Роли и экраны 12.4, push, камера, очередь отправки, deep links | Покупатель оформляет приёмку при плохой связи — данные доходят один раз; продавец получает push и подтверждает строку |
| M11 | Готовность к запуску | Ценовой индекс, публичные страницы, нагрузочные тесты, безопасность (чек-лист 13.2), бэкапы, мониторинг, staging, переводы uz проверены носителем | Чек-лист запуска пройден |

### 14.2. Definition of Done для любой задачи

- Код в TypeScript strict, без `any` и без отключения правил линтера без комментария-обоснования.
- Бизнес-логика — в `packages/domain` с модульными тестами.
- Эндпоинт описан в OpenAPI, клиент перегенерирован, e2e-тест на успех, валидацию и права.
- Строки интерфейса — через i18n в обоих языках.
- Миграция создана и проверена на чистой БД и на БД с seed-данными.
- Аудит и доменные события добавлены для значимых действий.
- Обновлены `docs/PROGRESS.md` и, при принятии решения по неясности, `docs/DECISIONS.md`.

### 14.3. Сквозные сценарии приёмки (Playwright + e2e API)

**Сценарий 1. Сборный заказ от заявки до завершения**
```
Дано: продавцы S1 (Самарканд, 2 т толстолобика 1–2 кг, 26 000 сум/кг) и S2 (Джизак, 1 т, 25 000 сум/кг) верифицированы;
      покупатель B (ресторан, Ташкент) создал ранее хотя бы одну заявку.
Когда B создаёт заявку на 2,5 т толстолобика 1–2 кг, живой, доставка через 2 дня, радиус поиска 350 км
Тогда S1 и S2 получают уведомление «Новая заявка для вас»
Когда S1 предлагает 1,8 т по 26 000, S2 — 1 т по 25 000
И B принимает 1,5 т у S1 и 1 т у S2
Тогда создан заказ FO-… с двумя строками в статусе PENDING_SELLER_CONFIRMATION
Когда S1 и S2 подтверждают строки
Тогда заказ CONFIRMED, у наличия S1 reservedKg = 1500, у S2 = 1000
Когда оператор назначает перевозчика C с живорыбной машиной на 3 т и маршрутом S2 → S1 → B
И C проводит рейс до DELIVERED
И B оформляет приёмку: строка S1 — 1 480 кг, снулая 20 кг; строка S2 — 1 000 кг
Тогда к оплате S1 = (1480 − 20) × 26 000 = 37 960 000 сум; S2 = 25 000 000 сум
И начислена комиссия 2%: S1 = 759 200 сум, S2 = 500 000 сум
Когда B записывает оплаты, а S1 и S2 их подтверждают
Тогда заказ COMPLETED и сторонам предложено оставить отзывы
```

**Сценарий 2. Конкурентное подтверждение.** Наличие 1 000 кг, две строки разных заказов по 700 кг подтверждаются одновременно → одна подтверждена, вторая получает `INSUFFICIENT_VOLUME`; `reservedKg = 700`.

**Сценарий 3. Изоляция.** Продавец S2 запрашивает заказ из сценария 1 → видит только свою строку; запрос строки S1 по id → `404`; перевозчик C не получает цены в ответе.

**Сценарий 4. Свежесть.** Наличие не подтверждено 7 дней → `PAUSED`, исчезает из каталога и подбора, продавцу ушло уведомление; после «Актуально» снова `ACTIVE`.

**Сценарий 5. Спор.** Покупатель открывает спор «недовес» по строке S2 с фото → оператор решает с корректировкой −500 000 сум → сумма строки и комиссия пересчитаны, заказ вернулся в прежний статус.

**Сценарий 6. Telegram.** Продавец с привязанным Telegram получает запрос подтверждения строки, нажимает «Подтвердить» → строка `CONFIRMED`, покупатель видит изменение в вебе в реальном времени.

---

## 15. Открытые вопросы и значения по умолчанию

Пока бизнес не принял решение, агент реализует значение по умолчанию **как настройку**, чтобы его можно было поменять без кода.

| # | Вопрос | По умолчанию в MVP |
|---|---|---|
| 1 | Размер комиссии и кто платит | 2% с продавца от итоговой суммы строки; индивидуальная ставка — через админку |
| 2 | Оплачивается ли снулая рыба при живой поставке | Не оплачивается (`NOT_PAID`) |
| 3 | Минимальная партия | 100 кг на строку |
| 4 | Допустимые условия оплаты | При доставке, предоплата, частичная предоплата; отсрочки нет |
| 5 | Кто платит перевозчику и зарабатывает ли платформа на логистике | Покупатель платит перевозчику напрямую; платформа только фиксирует; комиссии с логистики нет |
| 6 | Могут ли продавать физлица и дехканские хозяйства | Да, после верификации оператором |
| 7 | Обязательны ли ветеринарные документы на партию | Загрузка рекомендуется; обязательность — флаг в настройках `order.requireVetDocument` = false |
| 8 | SMS-провайдер | Абстракция; реализация `eskiz` как первая, провайдер уточняется |
| 9 | Хостинг | Дата-центр в Узбекистане, провайдер уточняется; в коде — только переменные окружения |
| 10 | Узбекские названия видов рыбы и тексты | Черновые в seed; проверка носителем языка до запуска (M11) |
| 11 | Название бренда и домен | Рабочее `BaliqBozor`, deep link-схема `baliqbozor://` — вынести в конфиг |
| 12 | Нужна ли кириллица узбекского | Нет в MVP; структура i18n позволяет добавить `uz-Cyrl` |
| 13 | Публичность каталога без входа | Да, без точных координат, контактов и названий хозяйств (показывается регион и рейтинг) |

---

## 16. Точки расширения (будущие модули)

MVP проектируется так, чтобы следующие модули подключались без переделки ядра:

| Будущий модуль | Как подготовлено в MVP |
|---|---|
| **Учёт хозяйства** (зарыбление, кормление, биомасса, прогноз готовности) | `Farm` — стабильная сущность с координатами; `Listing` может создаваться и обновляться автоматически из учёта (поле-источник добавляется позже); доменные события позволяют учёту подписаться на продажи |
| **IoT-мониторинг воды** | Отдельный модуль и отдельное хранилище временных рядов; связь через `farmId`; уведомления — через существующий каталог событий |
| **Интеграция с e-baliq** | Отдельный модуль-адаптер, подписанный на доменные события (продажи, объёмы); ядро не знает формата e-baliq |
| **Онлайн-оплата и безопасная сделка** | Интерфейс `PaymentProvider` в модуле `payments`; сейчас реализован только ручной учёт; `Payment.method` расширяется |
| **ЭСФ (электронные счета-фактуры)** | Интерфейс `EInvoiceProvider`; документы уже генерируются и хранятся |
| **Финансирование, отсрочка через банк-партнёр** | `paymentTerms` расширяется новым значением; расчёт сроков уже есть |
| **Поставщики малька, кормов, оборудования** | Новый `OrgType = SUPPLIER` и отдельный каталог товаров; механика заявок и заказов переиспользуется |
| **B2C-продажи** | Отдельный тип покупателя и упрощённый поток заказа поверх тех же наличия и логистики |
| **Telegram Mini App** | Веб-приложение адаптивно; авторизация через Telegram initData добавляется в `auth` |

**Интерфейсы провайдеров** (в `apps/api/src/providers`): `SmsProvider`, `PushProvider`, `StorageProvider`, `PdfRenderer`, `GeocodingProvider` (пока не используется — ввод точки на карте), `PaymentProvider`, `EInvoiceProvider`. Каждый с реализацией-заглушкой для тестов.
