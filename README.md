# Quiz Widget

Встраиваемый виджет викторины для EdTech-сайтов.

## Структура проекта

```
quiz-project/
├── index.html              # Тестовая страница для разработки
└── widget/
    ├── quiz-widget.js      # Точка входа: инициализация и монтирование виджета
    ├── quiz-config.json    # Конфигурация: вопросы, настройки отображения, параметры
    ├── quiz-logic.js       # Игровая логика: подсчёт очков, переходы, валидация
    ├── quiz-api.js         # API-слой: загрузка данных, отправка результатов
    └── quiz-theme.css      # Стили и темизация виджета
```

## Быстрый старт

1. Откройте `index.html` в браузере для локального тестирования.
2. Настройте вопросы в `widget/quiz-config.json`.
3. При необходимости задайте эндпоинт API в `widget/quiz-api.js`.

## Встраивание на сайт

```html
<link rel="stylesheet" href="widget/quiz-theme.css" />
<div id="quiz-widget-root"></div>
<script src="widget/quiz-api.js"></script>
<script src="widget/quiz-logic.js"></script>
<script src="widget/quiz-widget.js"></script>
```
