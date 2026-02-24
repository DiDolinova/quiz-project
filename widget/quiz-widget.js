/**
 * quiz-widget.js — главный модуль квиза.
 *
 * Зависимости (должны быть подключены раньше этого файла):
 *   - quiz-logic.js  → QuizLogic
 *   - quiz-api.js    → QuizApi
 *
 * Использование:
 *   QuizWidget.init({ containerId: 'quiz-widget-root', configUrl: 'widget/quiz-config.json' });
 *
 * CSS-namespace: все классы имеют префикс eb-quiz__
 */

const QuizWidget = (() => {

  // ---------------------------------------------------------------------------
  // Константы
  // ---------------------------------------------------------------------------

  const STORAGE_KEY        = 'eb_quiz_last_shown';
  const COOLDOWN_DAYS      = 3;
  const TIMER_DESKTOP_SEC  = 25;
  const TIMER_MOBILE_SEC   = 35;
  const MOBILE_BREAKPOINT  = 768; // px

  // ---------------------------------------------------------------------------
  // Состояние (сбрасывается при каждой инициализации)
  // ---------------------------------------------------------------------------

  let state = null;

  function createInitialState(config) {
    return {
      config,                   // полный объект quiz.* из quiz-config.json
      currentStep: 'teaser',    // 'teaser' | 'questions' | 'contacts_1' | 'contacts_2' | 'result'
      currentQuestionIndex: 0,
      answers: {},              // { [questionId]: answerId }
      contactData: {            // накапливается между двумя шагами формы
        name:  '',
        email: '',
        phone: '',
      },
      timerHandle: null,
      containerEl: null,
    };
  }

  // ---------------------------------------------------------------------------
  // localStorage — cooldown
  // ---------------------------------------------------------------------------

  function canShow() {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return true;
    const lastShown = parseInt(raw, 10);
    if (isNaN(lastShown)) return true;
    const daysPassed = (Date.now() - lastShown) / (1000 * 60 * 60 * 24);
    return daysPassed >= COOLDOWN_DAYS;
  }

  function recordShown() {
    localStorage.setItem(STORAGE_KEY, String(Date.now()));
  }

  // ---------------------------------------------------------------------------
  // Таймер
  // ---------------------------------------------------------------------------

  function isMobile() {
    return window.innerWidth < MOBILE_BREAKPOINT;
  }

  function startTimer() {
    const delay = isMobile() ? TIMER_MOBILE_SEC : TIMER_DESKTOP_SEC;
    state.timerHandle = setTimeout(() => mount(), delay * 1000);
  }

  function clearTimer() {
    if (state && state.timerHandle) {
      clearTimeout(state.timerHandle);
      state.timerHandle = null;
    }
  }

  // ---------------------------------------------------------------------------
  // HTML-рендеринг (строковые шаблоны, без фреймворков)
  // ---------------------------------------------------------------------------

  /** Экранирует спецсимволы HTML для безопасной вставки строк. */
  function esc(str) {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function renderTeaser() {
    return `
      <div class="eb-quiz__teaser">
        <p class="eb-quiz__teaser-title">У нас есть курсы для разных уровней и целей: от смены профессии до прокачки текущих навыков с AI.</p>
        <p class="eb-quiz__teaser-subtitle">Пройдите короткий тест и мы покажем, какой из них даст вам максимум.<br>Это займёт всего 3 минуты и 6 вопросов.</p>
        <div class="eb-quiz__teaser-actions">
          <button class="eb-quiz__btn eb-quiz__btn--accept" data-action="accept" type="button">
            Подобрать курс
          </button>
          <button class="eb-quiz__btn eb-quiz__btn--decline" data-action="decline" type="button">
            Не сейчас
          </button>
        </div>
      </div>`;
  }

  function renderProgressBar(current, total) {
    const pct = Math.round((current / total) * 100);
    return `
      <div class="eb-quiz__progress" role="progressbar" aria-valuenow="${pct}" aria-valuemin="0" aria-valuemax="100">
        <div class="eb-quiz__progress-fill" style="width:${pct}%"></div>
        <span class="eb-quiz__progress-label">${current} из ${total}</span>
      </div>`;
  }

  function renderQuestion(question, questionNumber, total) {
    const selectedAnswerId = state.answers[question.id] ?? null;

    const answersHtml = question.answers.map(answer => {
      const isSelected = answer.id === selectedAnswerId;
      return `
        <button
          class="eb-quiz__answer${isSelected ? ' eb-quiz__answer--selected' : ''}"
          data-answer-id="${esc(answer.id)}"
          data-question-id="${esc(question.id)}"
          type="button"
        >${esc(answer.text)}</button>`;
    }).join('');

    return `
      <div class="eb-quiz__question" data-question-id="${esc(question.id)}">
        ${renderProgressBar(questionNumber, total)}
        <p class="eb-quiz__question-text">${esc(question.text)}</p>
        <div class="eb-quiz__answers">${answersHtml}</div>
        <div class="eb-quiz__nav">
          ${questionNumber > 1
            ? `<button class="eb-quiz__btn eb-quiz__btn--back" data-action="prev" type="button">Назад</button>`
            : '<span></span>'}
          <button
            class="eb-quiz__btn eb-quiz__btn--next"
            data-action="next"
            type="button"
            ${selectedAnswerId ? '' : 'disabled'}
          >${questionNumber === total ? 'Далее' : 'Следующий вопрос'}</button>
        </div>
      </div>`;
  }

  // Шаг 1: имя + email
  function renderContactsStep1() {
    const total = state.config.questions.length;
    const { name, email } = state.contactData;
    return `
      <div class="eb-quiz__contacts">
        ${renderProgressBar(total, total)}
        <p class="eb-quiz__contacts-title">Почти готово — осталось пара шагов</p>
        <form class="eb-quiz__form" data-step="1" novalidate>
          <div class="eb-quiz__field">
            <label class="eb-quiz__label" for="eb-quiz-name">Ваше имя</label>
            <input
              class="eb-quiz__input"
              id="eb-quiz-name"
              name="name"
              type="text"
              placeholder="Иван Иванов"
              autocomplete="name"
              value="${esc(name)}"
              required
            />
            <span class="eb-quiz__field-error" aria-live="polite"></span>
          </div>
          <div class="eb-quiz__field">
            <label class="eb-quiz__label" for="eb-quiz-email">Email</label>
            <input
              class="eb-quiz__input"
              id="eb-quiz-email"
              name="email"
              type="email"
              placeholder="ivan@example.com"
              autocomplete="email"
              value="${esc(email)}"
              required
            />
            <span class="eb-quiz__field-error" aria-live="polite"></span>
          </div>
          <button class="eb-quiz__btn eb-quiz__btn--submit" type="submit">Далее</button>
          <p class="eb-quiz__form-error" aria-live="polite"></p>
        </form>
        <button class="eb-quiz__btn eb-quiz__btn--back" data-action="to-questions" type="button">← Изменить ответы</button>
      </div>`;
  }

  // Шаг 2: телефон + согласие ПДн
  function renderContactsStep2() {
    const total = state.config.questions.length;
    const { phone } = state.contactData;
    return `
      <div class="eb-quiz__contacts">
        ${renderProgressBar(total, total)}
        <p class="eb-quiz__contacts-title">Последний шаг — и вы узнаете свой результат</p>
        <form class="eb-quiz__form" data-step="2" novalidate>
          <div class="eb-quiz__field">
            <label class="eb-quiz__label" for="eb-quiz-phone">Телефон</label>
            <input
              class="eb-quiz__input"
              id="eb-quiz-phone"
              name="phone"
              type="tel"
              placeholder="+7 900 000-00-00"
              autocomplete="tel"
              value="${esc(phone)}"
              required
            />
            <span class="eb-quiz__field-error" aria-live="polite"></span>
          </div>
          <div class="eb-quiz__field eb-quiz__field--checkbox">
            <label class="eb-quiz__checkbox-label">
              <input class="eb-quiz__checkbox" type="checkbox" name="consent" required />
              <span>Согласен на обработку персональных данных</span>
            </label>
            <span class="eb-quiz__field-error" aria-live="polite"></span>
          </div>
          <button class="eb-quiz__btn eb-quiz__btn--submit" type="submit">Узнать мой курс</button>
          <p class="eb-quiz__form-error" aria-live="polite"></p>
        </form>
        <button class="eb-quiz__btn eb-quiz__btn--back" data-action="to-contacts-1" type="button">← Назад</button>
      </div>`;
  }

  function renderResult(result) {
    const ctaHtml = result.url
      ? `<a class="eb-quiz__btn eb-quiz__btn--cta" href="${esc(result.url)}" target="_blank" rel="noopener noreferrer">
           Узнать подробнее
         </a>`
      : '';
    return `
      <div class="eb-quiz__result">
        <p class="eb-quiz__result-label">Ваш курс</p>
        <h2 class="eb-quiz__result-title">${esc(result.courseTitle)}</h2>
        <p class="eb-quiz__result-description">${esc(result.description)}</p>
        ${ctaHtml}
      </div>`;
  }

  function renderShell(contentHtml) {
    const isExpanded = state.currentStep !== 'teaser';
    return `
      <div class="eb-quiz__overlay" data-action="close-overlay">
        <div class="eb-quiz__popup${isExpanded ? ' eb-quiz__popup--expanded' : ''}" role="dialog" aria-modal="true" aria-label="Квиз подбора курса">
          ${isExpanded
            ? `<button class="eb-quiz__close" data-action="close" type="button" aria-label="Закрыть">✕</button>`
            : ''}
          <div class="eb-quiz__body">
            ${contentHtml}
          </div>
        </div>
      </div>`;
  }

  // ---------------------------------------------------------------------------
  // DOM — монтирование и обновление
  // ---------------------------------------------------------------------------

  function mount() {
    const { containerEl } = state;
    containerEl.innerHTML = renderShell(getCurrentContentHtml());
    attachEvents(containerEl);
  }

  function remount() {
    const bodyEl = state.containerEl.querySelector('.eb-quiz__body');
    if (bodyEl) {
      bodyEl.innerHTML = getCurrentContentHtml();
      attachEvents(state.containerEl);
    }
  }

  function getCurrentContentHtml() {
    const { currentStep, currentQuestionIndex, config } = state;

    if (currentStep === 'teaser') {
      return renderTeaser();
    }
    if (currentStep === 'questions') {
      const question = config.questions[currentQuestionIndex];
      return renderQuestion(question, currentQuestionIndex + 1, config.questions.length);
    }
    if (currentStep === 'contacts_1') {
      return renderContactsStep1();
    }
    if (currentStep === 'contacts_2') {
      return renderContactsStep2();
    }
    return ''; // 'result' — рендерится отдельно после получения результата
  }

  // ---------------------------------------------------------------------------
  // Обработчики событий
  // ---------------------------------------------------------------------------

  function attachEvents(root) {
    // Делегирование кликов на весь контейнер
    root.onclick = (e) => {
      const target = e.target.closest('[data-action]');
      if (target) handleAction(target.dataset.action, target, e);

      // Выбор ответа
      const answerBtn = e.target.closest('[data-answer-id]');
      if (answerBtn) handleAnswerSelect(answerBtn);
    };

    // Закрытие по клику на оверлей
    const overlay = root.querySelector('.eb-quiz__overlay');
    if (overlay) overlay.onclick = (e) => { if (e.target === overlay) handleClose(); };

    // Отправка формы контактов (dispatch по data-step)
    const form = root.querySelector('.eb-quiz__form');
    if (form) {
      form.onsubmit = (e) => {
        e.preventDefault();
        if (form.dataset.step === '1') handleContactsStep1Submit(form);
        else                           handleContactsStep2Submit(form);
      };
    }
  }

  function handleAction(action) {
    switch (action) {
      case 'accept':       handleAccept();      break;
      case 'decline':      handleDecline();     break;
      case 'next':         handleNext();        break;
      case 'prev':         handlePrev();        break;
      case 'to-questions':  handleToQuestions();   break;
      case 'to-contacts-1': handleToContactsStep1(); break;
      case 'close':         handleClose();          break;
    }
  }

  // Пользователь согласился — раскрываем квиз
  function handleAccept() {
    state.currentStep = 'questions';
    mount(); // полный ремаунт: добавляет --expanded к popup
  }

  // Пользователь отказался — записываем cooldown и закрываем
  function handleDecline() {
    recordShown();
    destroy();
  }

  function handleAnswerSelect(btn) {
    const { questionId, answerId } = btn.dataset;
    state.answers[questionId] = answerId;

    // Обновляем выделение ответов без полного ремаунта
    const questionEl = state.containerEl.querySelector(`.eb-quiz__question[data-question-id="${questionId}"]`);
    if (!questionEl) return;

    questionEl.querySelectorAll('.eb-quiz__answer').forEach(b => {
      b.classList.toggle('eb-quiz__answer--selected', b.dataset.answerId === answerId);
    });

    const nextBtn = questionEl.querySelector('[data-action="next"]');
    if (nextBtn) nextBtn.disabled = false;
  }

  function handleNext() {
    const { currentQuestionIndex, config } = state;
    const isLast = currentQuestionIndex === config.questions.length - 1;

    if (isLast) {
      state.currentStep = 'contacts_1';
    } else {
      state.currentQuestionIndex += 1;
    }
    remount();
  }

  function handlePrev() {
    if (state.currentQuestionIndex > 0) {
      state.currentQuestionIndex -= 1;
      remount();
    }
  }

  function handleToQuestions() {
    state.currentStep = 'questions';
    remount();
  }

  function handleToContactsStep1() {
    state.currentStep = 'contacts_1';
    remount();
  }

  function handleClose() {
    recordShown();
    destroy();
  }

// ---------------------------------------------------------------------------
  // Отправка форм контактов (два шага)
  // ---------------------------------------------------------------------------

  // Шаг 1: валидация имени и email, сохранение в state, переход на шаг 2
  function handleContactsStep1Submit(form) {
    clearFormErrors(form);

    const name  = form.name.value.trim();
    const email = form.email.value.trim();
    let hasErrors = false;

    if (!name) {
      setFieldError(form, 'name', 'Введите ваше имя');
      hasErrors = true;
    }
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setFieldError(form, 'email', 'Введите корректный email');
      hasErrors = true;
    }
    if (hasErrors) return;

    // Сохраняем данные шага 1 и переходим к шагу 2
    state.contactData.name  = name;
    state.contactData.email = email;
    state.currentStep = 'contacts_2';
    remount();
  }

  // Шаг 2: валидация телефона и согласия, отправка лида, показ результата
  function handleContactsStep2Submit(form) {
    clearFormErrors(form);

    const phone   = form.phone.value.trim();
    const consent = form.consent.checked;
    let hasErrors = false;

    if (!phone) {
      setFieldError(form, 'phone', 'Введите номер телефона');
      hasErrors = true;
    }
    if (!consent) {
      setConsentError(form, 'Необходимо согласие на обработку данных');
      hasErrors = true;
    }
    if (hasErrors) return;

    // Сохраняем телефон и вычисляем результат
    state.contactData.phone = phone;
    const result = QuizLogic.getResult(Object.values(state.answers), state.config);

    const submitBtn = form.querySelector('.eb-quiz__btn--submit');
    submitBtn.disabled = true;
    submitBtn.textContent = 'Отправляем…';

    QuizApi.sendLead({
      name:               state.contactData.name,
      email:              state.contactData.email,
      phone:              state.contactData.phone,
      quiz_answers:       state.answers,
      recommended_course: result.courseId,
    })
      .then(() => {
        showResult(result);
        recordShown();
      })
      .catch(err => {
        submitBtn.disabled = false;
        submitBtn.textContent = 'Узнать мой курс';
        setFormError(form, getErrorMessage(err));
      });
  }

  function showResult(result) {
    state.currentStep = 'result';

    // Добираем url из конфига курса-победителя
    const courseConfig = state.config.scoring.results.find(r => r.id === result.courseId);
    const resultWithUrl = { ...result, url: courseConfig?.url ?? null };

    const bodyEl = state.containerEl.querySelector('.eb-quiz__body');
    if (bodyEl) {
      bodyEl.innerHTML = renderResult(resultWithUrl);
      attachEvents(state.containerEl);
    }
  }

  // ---------------------------------------------------------------------------
  // Ошибки формы
  // ---------------------------------------------------------------------------

  function setFieldError(form, fieldName, message) {
    const input = form.elements[fieldName];
    if (!input) return;
    input.classList.add('eb-quiz__input--error');
    const errorEl = input.closest('.eb-quiz__field')?.querySelector('.eb-quiz__field-error');
    if (errorEl) errorEl.textContent = message;
  }

  function setConsentError(form, message) {
    const checkbox = form.elements['consent'];
    if (!checkbox) return;
    const errorEl = checkbox.closest('.eb-quiz__field')?.querySelector('.eb-quiz__field-error');
    if (errorEl) errorEl.textContent = message;
  }

  function setFormError(form, message) {
    const errorEl = form.querySelector('.eb-quiz__form-error');
    if (errorEl) errorEl.textContent = message;
  }

  function clearFormErrors(form) {
    form.querySelectorAll('.eb-quiz__field-error').forEach(el => { el.textContent = ''; });
    form.querySelectorAll('.eb-quiz__input--error').forEach(el => el.classList.remove('eb-quiz__input--error'));
    setFormError(form, '');
  }

  function getErrorMessage(err) {
    if (err instanceof QuizApi.ApiError) {
      if (err.type === 'network') return 'Нет соединения. Проверьте интернет и попробуйте снова.';
      if (err.type === 'http')    return `Ошибка сервера (${err.status}). Попробуйте позже.`;
    }
    return 'Что-то пошло не так. Попробуйте ещё раз.';
  }

  // ---------------------------------------------------------------------------
  // Destroy
  // ---------------------------------------------------------------------------

  function destroy() {
    clearTimer();
    if (state?.containerEl) state.containerEl.innerHTML = '';
    state = null;
  }

  // ---------------------------------------------------------------------------
  // Публичный API
  // ---------------------------------------------------------------------------

  /**
   * Инициализирует виджет: загружает конфиг и запускает таймер показа.
   *
   * @param {{
   *   containerId?: string,   — id DOM-элемента (по умолчанию 'quiz-widget-root')
   *   configUrl?:  string,    — URL quiz-config.json (по умолчанию 'widget/quiz-config.json')
   * }} options
   */
  async function init(options = {}) {
    const containerId = options.containerId ?? 'quiz-widget-root';
    const configUrl   = options.configUrl   ?? 'widget/quiz-config.json';

    if (!canShow()) return;

    const containerEl = document.getElementById(containerId);
    if (!containerEl) {
      console.warn(`QuizWidget: элемент #${containerId} не найден.`);
      return;
    }

    let quizConfig;
    try {
      const response = await fetch(configUrl);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const json = await response.json();
      quizConfig = json.quiz;
    } catch (err) {
      console.error('QuizWidget: не удалось загрузить конфиг.', err);
      return;
    }

    state = createInitialState(quizConfig);
    state.containerEl = containerEl;

    startTimer();
  }

  /**
   * Показывает виджет немедленно, минуя таймер и проверку cooldown.
   * Предназначен для тестирования и ручного триггера (например, по кнопке на странице).
   * Требует предварительного вызова init().
   */
  function show() {
    if (!state) {
      console.warn('QuizWidget.show(): сначала вызовите QuizWidget.init().');
      return;
    }
    clearTimer();
    mount();
  }

  return {
    init,
    show,
    destroy,
  };

})();
