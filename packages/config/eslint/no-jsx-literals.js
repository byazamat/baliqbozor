/**
 * Запрещает строки интерфейса прямо в JSX (CLAUDE.md: «Строки интерфейса — только ключи i18n»).
 * Проверяет текст между тегами, строковые литералы в `{...}` внутри детей
 * и видимые пользователю атрибуты. Строки без букв (знаки, цифры, «·», «—») разрешены.
 */
const LETTER = /\p{L}/u;
const VISIBLE_ATTRIBUTES = new Set(['alt', 'title', 'placeholder', 'aria-label', 'label']);

const hasLetters = (value) => typeof value === 'string' && LETTER.test(value);

/** @type {import('eslint').Rule.RuleModule} */
export const noJsxLiterals = {
  meta: {
    type: 'problem',
    docs: { description: 'Disallow user-visible string literals in JSX; use i18n keys' },
    messages: { literal: 'Строка интерфейса должна идти через i18n: "{{text}}"' },
    schema: [],
  },
  create(context) {
    const report = (node, text) =>
      context.report({ node, messageId: 'literal', data: { text: text.trim().slice(0, 40) } });

    const checkExpression = (node, expression) => {
      if (expression.type === 'Literal' && hasLetters(expression.value)) {
        report(node, String(expression.value));
      }
      if (expression.type === 'TemplateLiteral') {
        const raw = expression.quasis.map((q) => q.value.cooked ?? '').join('');
        if (hasLetters(raw)) report(node, raw);
      }
    };

    return {
      JSXText(node) {
        if (hasLetters(node.value)) report(node, node.value);
      },
      JSXExpressionContainer(node) {
        if (node.parent?.type === 'JSXElement' || node.parent?.type === 'JSXFragment') {
          checkExpression(node, node.expression);
        }
      },
      JSXAttribute(node) {
        const name = node.name.type === 'JSXIdentifier' ? node.name.name : '';
        if (!VISIBLE_ATTRIBUTES.has(name) || !node.value) return;
        if (node.value.type === 'Literal' && hasLetters(node.value.value)) {
          report(node, String(node.value.value));
        }
        if (node.value.type === 'JSXExpressionContainer') {
          checkExpression(node, node.value.expression);
        }
      },
    };
  },
};
