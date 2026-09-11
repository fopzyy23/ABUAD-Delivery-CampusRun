/*!
 * DropzyyModal — reusable accessible replacement for native confirm()/prompt().
 *
 * Renders into the existing #modalRoot element using the shared .modal styles.
 * Loaded on both index.html and admin.html (before app.js / admin.js).
 *
 * API:
 *   window.DropzyyModal.confirm({ title, message, confirmText, cancelText, danger })
 *     -> Promise<boolean>            (false on Cancel / Escape / backdrop click)
 *   window.DropzyyModal.prompt({ title, message, label, placeholder, confirmText,
 *                                cancelText, defaultValue })
 *     -> Promise<string | null>      (null on Cancel / Escape / backdrop click)
 *
 * Accessibility: role=dialog + aria-modal, labelled/described ids, Tab focus trap,
 * Escape = cancel, backdrop click = cancel, initial focus on the primary action
 * (or the input for prompt), focus restored to the trigger after close, and the
 * background is scroll-locked while a dialog is open.
 */
(function () {
  'use strict';

  const FOCUSABLE =
    'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), ' +
    'select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

  let current = null;

  function rootEl() {
    let root = document.getElementById('modalRoot');
    if (!root) {
      root = document.createElement('div');
      root.id = 'modalRoot';
      document.body.appendChild(root);
    }
    return root;
  }

  function focusableNodes(scope) {
    return Array.prototype.slice.call(scope.querySelectorAll(FOCUSABLE))
      .filter(n => n.offsetParent !== null);
  }

  function close() {
    if (!current) return;
    if (current.backdrop.parentNode) {
      current.backdrop.parentNode.removeChild(current.backdrop);
    }
    document.removeEventListener('keydown', current.onKeydown, true);
    document.body.classList.remove('modal-open');
    if (current.prevFocus && typeof current.prevFocus.focus === 'function') {
      current.prevFocus.focus({ preventScroll: true });
    }
    current = null;
  }

  function openDialog(opts, settle) {
    // Only one dialog at a time — cancel any previously open one.
    if (current) {
      settle(false);
      close();
    }

    const prevFocus = document.activeElement;

    const backdrop = document.createElement('div');
    backdrop.className = 'modal-backdrop';
    backdrop.setAttribute('role', 'presentation');

    const dialog = document.createElement('div');
    dialog.className = 'modal';
    dialog.setAttribute('role', 'dialog');
    dialog.setAttribute('aria-modal', 'true');
    dialog.setAttribute('aria-labelledby', 'dropzyyModalTitle');
    if (opts.message) dialog.setAttribute('aria-describedby', 'dropzyyModalMessage');
    dialog.tabIndex = -1;

    const title = document.createElement('h2');
    title.id = 'dropzyyModalTitle';
    title.className = 'modal__title';
    title.textContent = opts.title || 'Please confirm';

    const body = document.createElement('div');
    body.className = 'modal__body';

    if (opts.message) {
      const msg = document.createElement('p');
      msg.id = 'dropzyyModalMessage';
      msg.className = 'modal__message';
      msg.textContent = opts.message;
      body.appendChild(msg);
    }

    let input = null;
    if (opts.showInput) {
      const field = document.createElement('div');
      field.className = 'field mt-2 mb-0';
      const label = document.createElement('label');
      label.setAttribute('for', 'dropzyyModalInput');
      label.textContent = opts.label || 'Value';
      input = document.createElement('input');
      input.id = 'dropzyyModalInput';
      input.className = 'input';
      input.type = 'text';
      if (opts.placeholder) input.placeholder = opts.placeholder;
      if (opts.defaultValue) input.value = opts.defaultValue;
      field.appendChild(label);
      field.appendChild(input);
      body.appendChild(field);
    }

    const actions = document.createElement('div');
    actions.className = 'modal__actions';

    const cancelBtn = document.createElement('button');
    cancelBtn.type = 'button';
    cancelBtn.className = 'btn btn--ghost';
    cancelBtn.textContent = opts.cancelText || 'Cancel';

    const confirmBtn = document.createElement('button');
    confirmBtn.type = 'button';
    confirmBtn.className = 'btn' + (opts.danger ? ' btn--danger' : '');
    confirmBtn.textContent = opts.confirmText || 'Confirm';

    function settleAndClose(val) {
      settle(val);
      close();
    }

    function resolveOk() {
      settleAndClose(opts.showInput ? input.value : true);
    }

    function resolveCancel() {
      settleAndClose(opts.showInput ? null : false);
    }

    function onKeydown(e) {
      if (e.key === 'Escape') { e.preventDefault(); resolveCancel(); return; }
      if (e.key === 'Tab') {
        const els = focusableNodes(dialog);
        if (!els.length) return;
        if ((e.shiftKey && document.activeElement === els[0]) || (e.shiftKey && document.activeElement === dialog)) {
          e.preventDefault();
          els[els.length - 1].focus();
        } else if (!e.shiftKey && document.activeElement === els[els.length - 1]) {
          e.preventDefault();
          els[0].focus();
        }
        return;
      }
      if (e.key === 'Enter' && input && e.target === input) {
        e.preventDefault();
        resolveOk();
      }
    }

    // Backdrop click (only when the click lands on the overlay itself) cancels.
    backdrop.addEventListener('click', (e) => {
      if (e.target === backdrop) resolveCancel();
    });

    confirmBtn.addEventListener('click', resolveOk);
    cancelBtn.addEventListener('click', resolveCancel);

    actions.appendChild(cancelBtn);
    actions.appendChild(confirmBtn);

    dialog.appendChild(title);
    dialog.appendChild(body);
    dialog.appendChild(actions);
    backdrop.appendChild(dialog);
    rootEl().appendChild(backdrop);

    document.body.classList.add('modal-open');
    document.addEventListener('keydown', onKeydown, true);

    current = { backdrop, prevFocus, onKeydown };

    // Initial focus: the input for prompt(), otherwise the primary action.
    const focusTarget = (opts.showInput && input) ? input : confirmBtn;
    window.setTimeout(() => focusTarget.focus(), 0);
  }

  window.DropzyyModal = {
    confirm(opts) {
      return new Promise(resolve => openDialog(Object.assign({}, opts || {}), resolve));
    },
    prompt(opts) {
      return new Promise(resolve => openDialog(Object.assign({ showInput: true }, opts || {}), resolve));
    }
  };
})();