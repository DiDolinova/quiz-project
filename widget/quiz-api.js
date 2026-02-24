/**
 * quiz-api.js — слой взаимодействия с API.
 *
 * Назначение:
 *   - Отправка лида (контакт + результат квиза) на бэкенд через sendLead().
 *   - Обработка сетевых ошибок и HTTP-ошибок (4xx, 5xx).
 *   - Изолирует всю работу с fetch, чтобы остальной код не зависел от транспорта.
 *   - Никакой логики amoCRM на фронте — только передача данных на бэкенд.
 */

const QuizApi = (() => {

  // ---------------------------------------------------------------------------
  // Конфигурация
  // ---------------------------------------------------------------------------

  const ENDPOINTS = {
    lead: '/api/lead',
  };

  // ---------------------------------------------------------------------------
  // Внутренние утилиты
  // ---------------------------------------------------------------------------

  /**
   * Базовая обёртка над fetch.
   * Выбрасывает ApiError при HTTP-ошибках (4xx, 5xx) и сетевых сбоях.
   *
   * @param {string} url
   * @param {RequestInit} options
   * @returns {Promise<any>} — распарсенный JSON из тела ответа
   */
  async function request(url, options = {}) {
    let response;

    try {
      response = await fetch(url, options);
    } catch (networkError) {
      // fetch упал сам по себе: нет соединения, DNS-сбой, CORS preflight и т.д.
      throw new ApiError('network', 0, 'Нет соединения с сервером. Проверьте интернет и попробуйте ещё раз.');
    }

    if (!response.ok) {
      // HTTP 4xx / 5xx — сервер ответил, но с ошибкой
      const errorBody = await safeParseJson(response);
      const message   = errorBody?.message ?? `Ошибка сервера (${response.status})`;
      throw new ApiError('http', response.status, message);
    }

    return safeParseJson(response);
  }

  /**
   * Пытается распарсить JSON из ответа, не выбрасывает исключение если тело пустое.
   *
   * @param {Response} response
   * @returns {Promise<any|null>}
   */
  async function safeParseJson(response) {
    try {
      return await response.json();
    } catch {
      return null;
    }
  }

  // ---------------------------------------------------------------------------
  // Кастомный класс ошибки
  // ---------------------------------------------------------------------------

  /**
   * ApiError — расширяет стандартный Error, добавляет тип и HTTP-статус.
   *
   * Поля:
   *   type   — 'network' | 'http' | 'validation'
   *   status — HTTP-код ответа (0 для сетевых ошибок)
   */
  class ApiError extends Error {
    constructor(type, status, message) {
      super(message);
      this.name   = 'ApiError';
      this.type   = type;   // 'network' | 'http' | 'validation'
      this.status = status; // 0 для сетевых ошибок, иначе HTTP-код
    }
  }

  // ---------------------------------------------------------------------------
  // Валидация входных данных
  // ---------------------------------------------------------------------------

  /**
   * Проверяет обязательные поля перед отправкой.
   * Выбрасывает ApiError с type='validation' при невалидных данных.
   *
   * @param {Object} data
   */
  function validateLeadData(data) {
    if (!data || typeof data !== 'object') {
      throw new ApiError('validation', 0, 'Данные для отправки отсутствуют.');
    }
    if (!data.name || typeof data.name !== 'string' || !data.name.trim()) {
      throw new ApiError('validation', 0, 'Укажите имя.');
    }
    if (!data.email || typeof data.email !== 'string' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email.trim())) {
      throw new ApiError('validation', 0, 'Укажите корректный email.');
    }
    if (!data.phone || typeof data.phone !== 'string' || !data.phone.trim()) {
      throw new ApiError('validation', 0, 'Укажите номер телефона.');
    }
    if (!data.recommended_course) {
      throw new ApiError('validation', 0, 'Не определён рекомендованный курс.');
    }
  }

  // ---------------------------------------------------------------------------
  // Публичные функции
  // ---------------------------------------------------------------------------

  /**
   * Отправляет данные лида на бэкенд.
   *
   * @param {{
   *   name:               string,   — имя пользователя
   *   email:              string,   — email пользователя
   *   phone:              string,   — телефон пользователя
   *   quiz_answers:       Object,   — { [questionId]: answerId }
   *   recommended_course: string    — id курса из quiz-config.json
   * }} data
   *
   * @returns {Promise<any>} — ответ сервера (JSON) в случае успеха
   * @throws  {ApiError}     — при сетевой или HTTP-ошибке, либо невалидных данных
   *
   * Пример использования:
   *   QuizApi.sendLead({
   *     name:               'Иван Иванов',
   *     email:              'ivan@example.com',
   *     phone:              '+7 900 000-00-00',
   *     quiz_answers:       { q1: 'q1_a2', q2: 'q2_a3' },
   *     recommended_course: 'web_ai',
   *   })
   *   .then(response => console.log('Лид отправлен', response))
   *   .catch(err => console.error(err.type, err.status, err.message));
   */
  function sendLead(data) {
    validateLeadData(data);

    const body = {
      name:               data.name.trim(),
      email:              data.email.trim(),
      phone:              data.phone.trim(),
      quiz_answers:       data.quiz_answers ?? {},
      recommended_course: data.recommended_course,
    };

    return request(ENDPOINTS.lead, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify(body),
    });
  }

  // ---------------------------------------------------------------------------
  // Публичный API модуля
  // ---------------------------------------------------------------------------

  return {
    sendLead,
    ApiError,
  };

})();
