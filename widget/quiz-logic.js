/**
 * quiz-logic.js — игровая логика виджета.
 *
 * Назначение:
 *   - Принимает массив ответов пользователя и конфиг квиза.
 *   - Считает суммарные очки по каждому параметру скоринга.
 *   - Умножает итоговые параметры на весовые коэффициенты каждого курса из конфига.
 *   - Возвращает id курса с максимальным итоговым счётом.
 *   - Не содержит DOM-манипуляций — только чистая логика и состояние.
 *
 * Параметры скоринга (из quiz-config.json):
 *   experienced   — пользователь уже работает в IT
 *   career_change — хочет перейти в IT
 *   business      — работает в нетехнической / офисной роли
 *   exploring     — ещё не определился с направлением
 *   dev_interest  — интерес к разработке и коду
 *   data_interest — интерес к данным и аналитике
 *   ai_tools      — интерес к готовым AI-инструментам
 *
 * Логика маппинга параметров → курс (реализована через weights в конфиге):
 *   experienced + dev_interest / ai_tools → AI для разработчика
 *   career_change + dev_interest           → Web-разработка + AI
 *   career_change + data_interest          → Data Scientist + AI
 *   business + ai_tools                    → AI для бизнеса
 *   exploring                              → курс с наибольшим суммарным score
 */

const QuizLogic = (() => {

  // ---------------------------------------------------------------------------
  // Шаг 1. Подсчёт сырых очков по параметрам
  // ---------------------------------------------------------------------------

  /**
   * Принимает массив выбранных ответов и полный конфиг квиза.
   * Возвращает объект { experienced: N, career_change: N, ... } —
   * сумму очков по каждому параметру.
   *
   * @param {string[]} selectedAnswerIds  — массив id выбранных ответов, например ['q1_a1', 'q2_a3', ...]
   * @param {Object}   quizConfig         — объект из quiz-config.json (quiz.questions + quiz.scoring)
   * @returns {Object} paramScores        — { [parameterId]: totalPoints }
   */
  function calcParamScores(selectedAnswerIds, quizConfig) {
    // Инициализируем все параметры нулём — читаем список из конфига, без хардкода
    const paramScores = {};
    quizConfig.scoring.parameters.forEach(({ id }) => {
      paramScores[id] = 0;
    });

    // Строим быстрый индекс answerId → scores из вопросов конфига
    const answerIndex = buildAnswerIndex(quizConfig.questions);

    // Суммируем очки за каждый выбранный ответ
    selectedAnswerIds.forEach(answerId => {
      const scores = answerIndex[answerId];
      if (!scores) return; // неизвестный id — пропускаем

      Object.entries(scores).forEach(([param, points]) => {
        if (param in paramScores) {
          paramScores[param] += points;
        }
      });
    });

    return paramScores;
  }

  /**
   * Строит плоский индекс { [answerId]: scoresObject } по всем вопросам конфига.
   * Вызывается один раз за сессию подсчёта.
   *
   * @param {Object[]} questions — quiz.questions из конфига
   * @returns {Object} index
   */
  function buildAnswerIndex(questions) {
    const index = {};
    questions.forEach(question => {
      question.answers.forEach(answer => {
        index[answer.id] = answer.scores;
      });
    });
    return index;
  }

  // ---------------------------------------------------------------------------
  // Шаг 2. Подсчёт итогового счёта для каждого курса
  // ---------------------------------------------------------------------------

  /**
   * Для каждого курса из scoring.results умножает накопленные очки параметра
   * на его вес и суммирует. Возвращает массив { id, title, score } по убыванию.
   *
   * Пример для курса "AI для разработчика":
   *   score = experienced*3.0 + dev_interest*2.0 + ai_tools*1.5 + ...
   *
   * @param {Object}   paramScores — результат calcParamScores()
   * @param {Object[]} results     — quiz.scoring.results из конфига
   * @returns {{ id: string, title: string, score: number }[]}
   */
  function calcCourseScores(paramScores, results) {
    return results
      .map(course => {
        const score = Object.entries(course.weights).reduce(
          (sum, [param, weight]) => sum + (paramScores[param] ?? 0) * weight,
          0
        );
        return { id: course.id, title: course.title, score };
      })
      .sort((a, b) => b.score - a.score);
  }

  // ---------------------------------------------------------------------------
  // Шаг 3. Определение победителя
  // ---------------------------------------------------------------------------

  /**
   * Главная функция модуля.
   * Принимает ответы пользователя и конфиг, возвращает объект результата.
   *
   * @param {string[]} selectedAnswerIds — выбранные пользователем id ответов
   * @param {Object}   quizConfig        — полный объект из quiz-config.json (поле quiz.*)
   * @returns {{
   *   courseId:    string,   — id победившего курса
   *   courseTitle: string,   — название курса
   *   description: string,   — описание курса из конфига
   *   paramScores: Object,   — сырые очки по параметрам (для отладки / аналитики)
   *   ranking:     Array     — все курсы по убыванию score
   * }}
   *
   * Примеры ожидаемых результатов:
   *   experienced:4 + dev_interest:6           → 'ai_dev'
   *   career_change:4 + dev_interest:6         → 'web_ai'
   *   career_change:4 + data_interest:6        → 'data_ai'
   *   business:6 + ai_tools:4                  → 'ai_business'
   *   exploring:6 (+ небольшой ai_tools)       → определяется вторичными сигналами
   */
  function getResult(selectedAnswerIds, quizConfig) {
    const { scoring, questions } = quizConfig;

    const paramScores  = calcParamScores(selectedAnswerIds, { scoring, questions });
    const ranking      = calcCourseScores(paramScores, scoring.results);
    const winner       = ranking[0];

    // Ищем полный объект курса-победителя, чтобы вернуть description
    const winnerConfig = scoring.results.find(r => r.id === winner.id);

    return {
      courseId:    winner.id,
      courseTitle: winner.title,
      description: winnerConfig?.description ?? '',
      paramScores,
      ranking,
    };
  }

  // ---------------------------------------------------------------------------
  // Публичный API модуля
  // ---------------------------------------------------------------------------

  return {
    /**
     * Определяет рекомендованный курс по массиву id выбранных ответов.
     *
     * Пример использования:
     *   const result = QuizLogic.getResult(
     *     ['q1_a1', 'q2_a1', 'q3_a1', 'q4_a2', 'q5_a1', 'q6_a2'],
     *     config.quiz
     *   );
     *   console.log(result.courseId);     // 'ai_dev'
     *   console.log(result.courseTitle);  // 'AI для разработчика'
     */
    getResult,

    /**
     * Вспомогательная функция — только сырые очки по параметрам.
     * Удобна для отладки и unit-тестирования.
     *
     * Пример:
     *   QuizLogic.calcParamScores(['q1_a3', 'q2_a3'], config.quiz)
     *   // → { business: 2, ai_tools: 2, experienced: 0, ... }
     */
    calcParamScores,
  };

})();
